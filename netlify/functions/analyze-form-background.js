import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120000 });

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

export async function handler(event, context) {
  console.log('[form-check-bg] Handler invoked');

  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  let jobId, userId, creditCost = 0;

  try {
    const body = JSON.parse(event.body);
    jobId = body.jobId;

    console.log('[form-check-bg] Processing job:', jobId);

    if (body._internalKey !== INTERNAL_KEY) {
      console.error('[form-check-bg] Invalid internal key');
      return { statusCode: 403 };
    }

    if (!jobId || !db) {
      console.error('[form-check-bg] Missing jobId or db');
      return { statusCode: 400 };
    }

    const jobRef = db.collection('formCheckJobs').doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      console.error('[form-check-bg] Job not found:', jobId);
      return { statusCode: 404 };
    }

    const job = jobSnap.data();
    userId = job.userId;
    creditCost = job.creditCost || 0;
    const chunkCount = job.chunkCount || 0;
    const imageDetail = job.imageDetail || 'low';
    const quality = job.quality || 'standard';
    const note = job.note || '';
    const isPremium = job.model === 'premium';
    const timestamps = job.timestamps || [];

    console.log('[form-check-bg] Job data:', { userId, chunkCount, quality, frameCount: job.frameCount });

    const frames = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunkSnap = await db.collection('formCheckFrames').doc(`${jobId}_chunk${i}`).get();
      if (chunkSnap.exists) {
        frames.push(...chunkSnap.data().frames);
      }
    }

    console.log('[form-check-bg] Loaded', frames.length, 'frames from', chunkCount, 'chunks');

    if (frames.length === 0) {
      await jobRef.update({ status: 'error', error: 'No frames found. Please try again.' });
      if (creditCost > 0) await refundCredits(userId, creditCost, false).catch(() => {});
      return { statusCode: 200 };
    }

    const content = [];
    let userText = `Analyze these ${frames.length} sequential frames from a workout video.`;
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

    logActivity({ type: 'form-check', title: 'Form Check Processing', description: `${frames.length} frames (${quality})`, model: isPremium ? 'premium' : 'standard', metadata: { userId, jobId, frameCount: frames.length, quality } });

    const aiModel = isPremium ? 'gpt-4o' : 'gpt-4o-mini';

    console.log('[form-check-bg] Calling OpenAI...', aiModel);
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
    console.log('[form-check-bg] OpenAI responded in', responseTime, 'ms');

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
      console.error('[form-check-bg] JSON parse error:', parseErr.message);
      analysis = null;
    }

    try {
      await db.collection('tokenUsage').add({
        userId,
        feature: 'form-check',
        model: aiModel,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        estimatedCost: cost,
        responseTimeMs: responseTime,
        userMessage: `Form check (${quality}): ${frames.length} frames${note ? ' - ' + note : ''}`,
        assistantResponse: `${analysis?.exercise || 'Unknown'}: score ${analysis?.overallScore || 0}/10`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('[form-check-bg] Failed to log usage:', e);
    }

    if (!analysis) {
      await jobRef.update({
        status: 'complete',
        analysis: {
          exercise: 'Unknown', overallScore: 0,
          overallSummary: 'The analysis could not be parsed. Please try again.',
          keyIssues: [], keyStrengths: [], frames: [], recommendations: [],
        },
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await jobRef.update({
        status: 'complete',
        analysis,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    for (let i = 0; i < chunkCount; i++) {
      db.collection('formCheckFrames').doc(`${jobId}_chunk${i}`).delete().catch(() => {});
    }

    console.log('[form-check-bg] Complete:', analysis?.exercise || 'Unknown', analysis?.overallScore || 0, '/10 in', responseTime, 'ms');

  } catch (error) {
    console.error('[form-check-bg] Error:', error);
    logError('analyze-form-background', error, 'high', { userId, jobId });

    if (creditCost > 0 && userId) {
      await refundCredits(userId, creditCost, false).catch(() => {});
    }

    if (jobId && db) {
      try {
        await db.collection('formCheckJobs').doc(jobId).update({
          status: 'error',
          error: 'Analysis failed. Credits have been refunded. Please try again.',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('[form-check-bg] Failed to write error:', e);
      }
    }
  }

  return { statusCode: 200 };
}