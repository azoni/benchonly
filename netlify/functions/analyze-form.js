import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';
import { buildSystemPrompt, buildUserMessage, buildGeminiParts, formatPoseContext } from './utils/formCheckPrompt.js';
import { callGemini } from './utils/gemini.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 22000 });

const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

function coerceAnalysis(analysis) {
  if (!analysis) return null;
  analysis.overallScore = Number(analysis.overallScore) || 0;
  analysis.repsDetected = Number(analysis.repsDetected) || 1;
  if (!Array.isArray(analysis.keyStrengths)) analysis.keyStrengths = [];
  if (!Array.isArray(analysis.keyIssues)) analysis.keyIssues = [];
  if (!Array.isArray(analysis.recommendations)) analysis.recommendations = [];
  if (!Array.isArray(analysis.injuryRisks)) analysis.injuryRisks = [];
  if (!Array.isArray(analysis.frames)) analysis.frames = [];
  if (!Array.isArray(analysis.cameraLimitations)) analysis.cameraLimitations = [];
  analysis.frames = analysis.frames.map(f => ({ ...f, formScore: Number(f.formScore) || 0 }));
  return analysis;
}

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

    logActivity({ type: 'form-check', title: 'Form Check (Inline)', description: `${frames.length} frames (${quality || 'standard'})${hasPoseData ? ' + pose data' : ''}`, metadata: { userId, frameCount: frames.length, quality: quality || 'standard', hasPoseData } });

    // ─── AI call: Gemini first, GPT-4o fallback ───
    let raw = '', aiModel = '', promptTokens = 0, completionTokens = 0, cost = 0;
    const startMs = Date.now();
    let usedGemini = false;

    try {
      const parts = buildGeminiParts(frames, timestamps, exercise, note, poseContext);
      const gemini = await callGemini(systemPrompt, parts, isPremium);
      raw = gemini.text;
      aiModel = gemini.model;
      promptTokens = gemini.promptTokens;
      completionTokens = gemini.completionTokens;
      cost = gemini.cost;
      usedGemini = true;
      console.log('[form-check] Gemini responded in', Date.now() - startMs, 'ms using', aiModel);
    } catch (geminiErr) {
      console.warn('[form-check] Gemini failed, falling back to OpenAI:', geminiErr.message);
      const gptModel = isPremium ? 'gpt-4o' : 'gpt-4o-mini';
      const content = buildUserMessage(frames, timestamps, exercise, note, imageDetail, poseContext);
      const response = await openai.chat.completions.create({
        model: gptModel,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      });
      raw = response.choices[0]?.message?.content || '';
      aiModel = gptModel;
      promptTokens = response.usage.prompt_tokens;
      completionTokens = response.usage.completion_tokens;
      const inputRate = isPremium ? 2.50 : 0.15;
      const outputRate = isPremium ? 10.00 : 0.60;
      cost = (promptTokens / 1e6) * inputRate + (completionTokens / 1e6) * outputRate;
      console.log('[form-check] OpenAI responded in', Date.now() - startMs, 'ms using', aiModel);
    }

    const responseTime = Date.now() - startMs;

    let analysis;
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      analysis = coerceAnalysis(JSON.parse(cleaned));
    } catch (parseErr) {
      console.error('Failed to parse form analysis JSON:', parseErr.message);
      analysis = null;
    }

    if (db) {
      try {
        await db.collection('tokenUsage').add({
          userId, feature: 'form-check', model: aiModel,
          provider: usedGemini ? 'gemini' : 'openai',
          promptTokens, completionTokens,
          totalTokens: promptTokens + completionTokens,
          estimatedCost: cost, responseTimeMs: responseTime,
          userMessage: `Form check (${quality || 'standard'}): ${frames.length} frames${note ? ' - ' + note : ''}`,
          assistantResponse: `${analysis?.exercise || 'Unknown'}: score ${analysis?.overallScore || 0}/10`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to log usage:', e);
      }
    }

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
