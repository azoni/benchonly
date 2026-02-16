import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120000 });

const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

const SYSTEM_PROMPT = `You are an elite strength and conditioning coach with 20+ years of experience, analyzing exercise form from sequential video frames.

You will receive numbered frames extracted from a workout video in chronological order. Analyze the complete movement pattern across all frames.

CRITICAL RULES — FOLLOW THESE EXACTLY:
1. ONLY describe what you can actually see in each frame. Never invent or assume positions, angles, or movements that aren't clearly visible.
2. If a frame shows the lifter standing, walking, resting, or not actively performing a rep, mark it as phase "setup" or "rest" and say so honestly. Do NOT fabricate form issues for non-lift frames.
3. If the camera angle makes it impossible to assess something (e.g. back angle from a front view), say "not visible from this angle" — do NOT guess.
4. Look at ALL frames before deciding phases. The actual lift might only occupy a subset of the frames. Mark the rest honestly as setup/rest/transition.
5. Only score frames where the lifter is actively performing the movement. Setup and rest frames should get a null formScore (use 0 to indicate "not scored — no active movement").
6. Base your overallScore ONLY on the frames where actual lifting occurs, not on setup/rest frames.

ANALYSIS APPROACH:
1. First scan all frames to identify: which exercise, where the actual reps start and end, and which frames are just setup/rest
2. Score each active-lift frame in context of the whole movement — don't penalize transitional positions that are normal parts of the lift
3. Be specific: reference exact body parts, joint angles, and positions you can ACTUALLY SEE
4. Be honest but constructive — if form is dangerous, say so clearly
5. If the video is unclear, too dark, or doesn't show exercise, set overallScore to 0 and explain

RESPOND WITH ONLY VALID JSON (no markdown, no backticks):
{
  "exercise": "Detected exercise name",
  "variation": "Specific variation if identifiable (e.g. 'low bar', 'sumo', 'close grip')",
  "repsDetected": 1,
  "overallScore": 7,
  "overallSummary": "2-3 sentence assessment written directly to the lifter. Be specific about what you actually observed, not generic advice.",
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
      "assessment": "Describe ONLY what you see. For setup/rest frames: 'Lifter is standing/walking/adjusting grip — no active movement.' For lift frames: specific positions and observations.",
      "formScore": 8,
      "cues": ["Actionable coaching cue — only for active lift frames. Use empty array [] for setup/rest frames."]
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