import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 22000 });

const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

const SYSTEM_PROMPT = `You are an elite strength and conditioning coach with 20+ years of experience, analyzing exercise form from sequential video frames.

You will receive numbered frames (with timestamps) extracted from a workout video in chronological order. Analyze the complete movement pattern across all frames.

CRITICAL RULES:
1. ONLY describe what you can actually see in each frame. Never invent or assume positions, angles, or movements that aren't clearly visible.
2. If a frame shows the lifter standing, walking, resting, or not actively performing a rep, mark it as phase "setup" or "rest" and say so honestly. Do NOT fabricate form issues for non-lift frames.
3. If the camera angle makes it impossible to assess something (e.g. back angle from a front view), say "not visible from this angle" — do NOT guess.
4. Look at ALL frames before deciding phases. The actual lift might only occupy a subset of the frames. Mark the rest honestly as setup/rest/transition.
5. Only score frames where the lifter is actively performing the movement. Setup and rest frames should get formScore 0.
6. Base your overallScore ONLY on the frames where actual lifting occurs, not on setup/rest frames.
7. Use the timestamps to understand timing between frames — this helps identify tempo, speed, and pauses.

RESPOND WITH ONLY VALID JSON (no markdown, no backticks):
{
  "exercise": "Detected exercise name",
  "variation": "Specific variation if identifiable (e.g. 'low bar', 'sumo', 'close grip')",
  "repsDetected": 1,
  "overallScore": 7,
  "overallSummary": "2-3 sentence assessment written directly to the lifter. Be specific about what you actually observed.",
  "movementQuality": {
    "stability": { "score": 8, "note": "Brief note on core/base stability" },
    "rangeOfMotion": { "score": 7, "note": "Brief note on ROM" },
    "control": { "score": 6, "note": "Brief note on tempo/control through movement" },
    "alignment": { "score": 8, "note": "Brief note on joint stacking and path" }
  },
  "keyStrengths": ["Specific strength with body part reference", "Another strength"],
  "keyIssues": ["Specific issue with WHY it matters", "Another issue"],
  "injuryRisks": [
    {
      "area": "Body area at risk",
      "severity": "low|medium|high",
      "description": "What's happening and why it's risky",
      "fix": "Specific cue to address it"
    }
  ],
  "frames": [
    {
      "frameNumber": 1,
      "phase": "setup|descent|bottom|ascent|lockout|transition|rest",
      "assessment": "Describe ONLY what you see. For setup/rest: 'Standing, no active movement.' For lift frames: specific positions.",
      "formScore": 8,
      "cues": ["Actionable coaching cue for lift frames. Empty array [] for setup/rest."]
    }
  ],
  "focusDrill": {
    "title": "The ONE thing to fix first",
    "description": "2-3 sentences: what to do differently next session, with a specific cue or drill",
    "cue": "Short memorable coaching cue (e.g. 'chest up, spread the floor')"
  },
  "recommendations": ["Priority fix 1 with specific instruction", "Fix 2", "Fix 3"]
}

SCORING: 1-3 dangerous/injury risk, 4-5 significant technique issues, 6-7 decent with clear fixes needed, 8-9 solid form with minor tweaks, 10 textbook. Use formScore 0 for setup/rest frames (not scored).

IMPORTANT: Write assessments as if talking directly to the lifter. Use "you/your" not "the lifter". Be concise but specific. NEVER fabricate observations — if you're unsure, say so.`;

export async function handler(event) {
  const cors = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  const rateCheck = await checkRateLimit(auth.uid, 'form-check');
  if (!rateCheck.allowed) {
    return { statusCode: 429, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many requests. Please wait a moment.' }) };
  }

  let creditCost = 0;
  let jobId = null;
  let userId = auth.uid;

  try {
    const body = JSON.parse(event.body);
    const { frames, timestamps, note: rawNote, exercise, targetUserId, model, quality } = body;
    const note = rawNote ? rawNote.replace(/[\n\r]/g, ' ').slice(0, 200).trim() : '';
    jobId = body.jobId;
    userId = (auth.isAdmin && targetUserId) ? targetUserId : auth.uid;

    const isPremium = model === 'premium' && auth.isAdmin;
    const imageDetail = isPremium ? 'high' : 'low';
    const QUALITY_COSTS = { quick: 10, standard: 15, detailed: 25 };
    creditCost = isPremium ? 50 : (QUALITY_COSTS[quality] || 15);

    // Server-side credit deduction
    const creditResult = await deductCredits(userId, 'form-check', creditCost, auth.isAdmin);
    if (!creditResult.success) {
      return { statusCode: 402, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Not enough credits. Need ${creditCost}, have ${creditResult.balance}.` }) };
    }

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      await refundCredits(userId, creditCost, auth.isAdmin);
      return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No frames provided' }) };
    }

    if (frames.length > 25) {
      await refundCredits(userId, creditCost, auth.isAdmin);
      return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many frames (max 25)' }) };
    }

    // ─── Try background function path ───
    // Store frames in Firestore chunks, invoke background, return jobId instantly
    let backgroundOk = false;

    try {
      const CHUNK_SIZE = 5;
      const chunks = [];
      for (let i = 0; i < frames.length; i += CHUNK_SIZE) {
        chunks.push(frames.slice(i, i + CHUNK_SIZE));
      }

      const batch = db.batch();
      chunks.forEach((chunk, idx) => {
        const chunkRef = db.collection('formCheckFrames').doc(`${jobId}_chunk${idx}`);
        batch.set(chunkRef, { jobId, userId, chunkIndex: idx, frames: chunk, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      });

      const jobRef = db.collection('formCheckJobs').doc(jobId);
      batch.set(jobRef, {
        userId,
        status: 'processing',
        quality: quality || 'standard',
        frameCount: frames.length,
        chunkCount: chunks.length,
        note: note || '',
        exercise: exercise || '',
        model: isPremium ? 'premium' : 'standard',
        imageDetail,
        creditCost,
        timestamps: timestamps || [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: false });

      await batch.commit();

      // Invoke background function — await the 202 (should be instant)
      const siteUrl = process.env.URL || 'https://benchpressonly.com';
      const bgResponse = await fetch(`${siteUrl}/.netlify/functions/analyze-form-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, _internalKey: INTERNAL_KEY }),
      });

      console.log('[form-check] Background invocation status:', bgResponse.status);

      if (bgResponse.status === 202) {
        backgroundOk = true;
      } else {
        console.warn('[form-check] Background returned', bgResponse.status, '- falling back to inline');
      }
    } catch (bgErr) {
      console.warn('[form-check] Background path failed:', bgErr.message, '- falling back to inline');
    }

    if (backgroundOk) {
      logActivity({ type: 'form-check', title: 'Form Check Queued (Background)', description: `${frames.length} frames (${quality || 'standard'})`, metadata: { userId, frameCount: frames.length, quality: quality || 'standard' } });

      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, background: true }),
      };
    }

    // ─── Fallback: inline processing ───
    console.log('[form-check] Processing inline:', frames.length, 'frames');

    // Mark processing
    if (jobId && db) {
      await db.collection('formCheckJobs').doc(jobId).set({
        userId, status: 'processing', quality: quality || 'standard',
        frameCount: frames.length, creditCost,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const content = [];
    let userText = `Analyze these ${frames.length} sequential frames from a workout video.`;
    if (exercise) userText += `\n\nExercise: ${exercise}. Focus your analysis on form cues specific to this movement.`;
    if (note) userText += `\n\nUser note: "${note}"`;
    const duration = timestamps?.length >= 2 ? timestamps[timestamps.length - 1] : null;
    userText += `\n\nFrames are numbered 1-${frames.length} in chronological order${duration ? `, spanning ${duration}s of video` : ''}.`;
    content.push({ type: 'text', text: userText });

    frames.forEach((frame, i) => {
      const ts = timestamps?.[i];
      const label = ts != null ? `Frame ${i + 1} (${ts}s):` : `Frame ${i + 1}:`;
      content.push({ type: 'text', text: label });
      content.push({
        type: 'image_url',
        image_url: {
          url: frame.startsWith('data:') ? frame : `data:image/jpeg;base64,${frame}`,
          detail: imageDetail,
        },
      });
    });

    logActivity({ type: 'form-check', title: 'Form Check (Inline)', description: `${frames.length} frames (${quality || 'standard'})`, metadata: { userId, frameCount: frames.length, quality: quality || 'standard' } });

    const aiModel = isPremium ? 'gpt-4o' : 'gpt-4o-mini';

    const startMs = Date.now();
    const response = await openai.chat.completions.create({
      model: aiModel,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    });
    const responseTime = Date.now() - startMs;

    const usage = response.usage;
    const inputRate = isPremium ? 2.50 : 0.15;
    const outputRate = isPremium ? 10.00 : 0.60;
    const cost = (usage.prompt_tokens / 1e6) * inputRate + (usage.completion_tokens / 1e6) * outputRate;
    const raw = response.choices[0]?.message?.content || '';

    let analysis;
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      analysis = JSON.parse(cleaned);
      // Validate and coerce response fields
      if (analysis) {
        analysis.overallScore = Number(analysis.overallScore) || 0;
        analysis.repsDetected = Number(analysis.repsDetected) || 1;
        if (!Array.isArray(analysis.keyStrengths)) analysis.keyStrengths = [];
        if (!Array.isArray(analysis.keyIssues)) analysis.keyIssues = [];
        if (!Array.isArray(analysis.recommendations)) analysis.recommendations = [];
        if (!Array.isArray(analysis.injuryRisks)) analysis.injuryRisks = [];
        if (!Array.isArray(analysis.frames)) analysis.frames = [];
        analysis.frames = analysis.frames.map(f => ({ ...f, formScore: Number(f.formScore) || 0 }));
      }
    } catch (parseErr) {
      console.error('Failed to parse form analysis JSON:', parseErr.message);
      analysis = null;
    }

    if (db) {
      try {
        await db.collection('tokenUsage').add({
          userId, feature: 'form-check', model: aiModel,
          promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens,
          estimatedCost: cost, responseTimeMs: responseTime,
          userMessage: `Form check (${quality || 'standard'}): ${frames.length} frames${note ? ' - ' + note : ''}`,
          assistantResponse: `${analysis?.exercise || 'Unknown'}: score ${analysis?.overallScore || 0}/10`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to log usage:', e);
      }
    }

    // Write to Firestore (triggers client's onSnapshot)
    if (jobId && db) {
      await db.collection('formCheckJobs').doc(jobId).update({
        status: 'complete',
        analysis: analysis || {
          exercise: 'Unknown', overallScore: 0,
          overallSummary: 'The analysis could not be parsed. Please try again.',
          keyIssues: [], keyStrengths: [], frames: [], recommendations: [],
        },
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, analysis, background: false }),
    };
  } catch (error) {
    console.error('Form analysis error:', error);
    logError('analyze-form', error, 'high', { userId: auth.uid });

    if (creditCost > 0) {
      await refundCredits(userId, creditCost, auth.isAdmin).catch(() => {});
    }

    // Write error to Firestore
    if (jobId && db) {
      const isTimeout = error.message?.includes('timeout') || error.message?.includes('timed out') || error.code === 'ETIMEDOUT';
      try {
        await db.collection('formCheckJobs').doc(jobId).update({
          status: 'error',
          error: isTimeout
            ? 'Analysis timed out. Try Standard (10 frames) for faster results. Credits refunded.'
            : 'Analysis failed. Credits have been refunded.',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to write error to Firestore:', e);
      }
    }

    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Analysis failed. Please try again.' }),
    };
  }
}