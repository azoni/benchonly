import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 22000 });

const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

const SYSTEM_PROMPT = `You are an elite strength and conditioning coach with 20+ years of experience, analyzing exercise form from sequential video frames.

You will receive numbered frames extracted from a workout video in chronological order. Your job is to analyze the MOVEMENT as a connected sequence, not grade individual snapshots.

CRITICAL RULES:
1. Watch the full sequence first. Understand the movement arc before commenting on any single frame.
2. ONLY describe what you can actually see. Never invent positions, angles, or movements that aren't clearly visible.
3. If the camera angle hides something, say "not visible from this angle" — do NOT guess.
4. Focus your analysis on the frames where actual lifting occurs. Setup/rest frames just get a phase label.
5. Think about how frames connect: is the lifter accelerating? Decelerating? Losing position over the set?

RESPOND WITH ONLY VALID JSON (no markdown, no backticks):
{
  "exercise": "Detected exercise name",
  "variation": "Specific variation if identifiable (e.g. 'low bar', 'sumo', 'close grip')",
  "repsDetected": 1,
  "overallScore": 7,
  "overallSummary": "2-3 sentence assessment of the overall movement quality. Reference specific things you observed across the sequence.",
  "movementQuality": {
    "stability": { "score": 8, "note": "Brief note on core/base stability across the movement" },
    "rangeOfMotion": { "score": 7, "note": "Brief note on ROM" },
    "control": { "score": 6, "note": "Brief note on tempo/control — did they rush? Lose tightness?" },
    "alignment": { "score": 8, "note": "Brief note on bar path, joint stacking through the movement" }
  },
  "keyStrengths": ["Specific strength observed across the movement", "Another strength"],
  "keyIssues": ["Specific issue with WHY it matters for this movement", "Another issue"],
  "injuryRisks": [
    {
      "area": "Body area at risk",
      "severity": "low|medium|high",
      "description": "What's happening across the movement and why it's risky",
      "fix": "Specific cue to address it"
    }
  ],
  "frames": [
    {
      "frameNumber": 1,
      "phase": "setup|descent|bottom|ascent|lockout|transition|rest"
    }
  ],
  "keyMoments": [
    {
      "title": "Short descriptive title (e.g. 'Forward lean out of the hole')",
      "frames": [8, 9],
      "type": "strength|issue|neutral",
      "assessment": "2-3 sentences describing what's happening across these frames as a movement. Reference how the position changes between them.",
      "cue": "One actionable coaching cue for this moment"
    }
  ],
  "focusDrill": {
    "title": "The ONE thing to fix first",
    "description": "2-3 sentences: what to do differently next session, with a specific cue or drill",
    "cue": "Short memorable coaching cue (e.g. 'chest up, spread the floor')"
  },
  "recommendations": ["Priority fix 1 with specific instruction", "Fix 2", "Fix 3"]
}

FRAMES ARRAY: One entry per frame with ONLY the phase label. No scores, no assessments. This is just for timeline visualization.

KEY MOMENTS: These are the heart of your analysis. Identify 3-8 significant moments in the movement:
- The best thing about their form (type: "strength")
- Each form breakdown or concern (type: "issue")  
- Notable transitions or positions (type: "neutral")
Each key moment references 1-3 frame numbers where it's visible. Describe what you see ACROSS those frames — how the position changes, not a static snapshot.

SCORING: 1-3 dangerous/injury risk, 4-5 significant technique issues, 6-7 decent with clear fixes needed, 8-9 solid form with minor tweaks, 10 textbook.

IMPORTANT: Write everything directly to the lifter using "you/your". Be concise and specific. NEVER fabricate observations.`;

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
    const { frames, note, targetUserId, model, quality } = body;
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
        model: isPremium ? 'premium' : 'standard',
        imageDetail,
        creditCost,
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
    if (note) userText += `\n\nUser note: "${note}"`;
    userText += `\n\nFrames are numbered 1-${frames.length} in chronological order, extracted evenly across the video (~1 per second).`;
    content.push({ type: 'text', text: userText });

    frames.forEach((frame, i) => {
      content.push({ type: 'text', text: `Frame ${i + 1}:` });
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