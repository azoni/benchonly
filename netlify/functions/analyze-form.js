import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';
import { buildSystemPrompt, buildUserMessage, formatPoseContext } from './utils/formCheckPrompt.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 22000 });

const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

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
    const { frames, timestamps, note: rawNote, exercise, targetUserId, model, quality, poseData } = body;
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
        poseData: Array.isArray(poseData) ? poseData : [],
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

    const inlinePoseData = Array.isArray(poseData) ? poseData : [];
    const hasPoseData = inlinePoseData.some(p => p.poseDetected);
    const poseContext = hasPoseData ? formatPoseContext(inlinePoseData, exercise) : '';
    const systemPrompt = buildSystemPrompt(exercise, hasPoseData);
    const content = buildUserMessage(frames, timestamps, exercise, note, imageDetail, poseContext);

    logActivity({ type: 'form-check', title: 'Form Check (Inline)', description: `${frames.length} frames (${quality || 'standard'})${hasPoseData ? ' + pose data' : ''}`, metadata: { userId, frameCount: frames.length, quality: quality || 'standard', hasPoseData } });

    const aiModel = isPremium ? 'gpt-4o' : 'gpt-4o-mini';

    const startMs = Date.now();
    const response = await openai.chat.completions.create({
      model: aiModel,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
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
        if (!Array.isArray(analysis.cameraLimitations)) analysis.cameraLimitations = [];
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