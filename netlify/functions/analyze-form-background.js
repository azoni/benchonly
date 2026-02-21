import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';
import { buildSystemPrompt, buildUserMessage, buildGeminiParts, formatPoseContext } from './utils/formCheckPrompt.js';
import { callGemini } from './utils/gemini.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120000 });

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
    const rawNote = job.note || '';
    const note = rawNote.replace(/[\n\r]/g, ' ').slice(0, 200).trim();
    const exercise = job.exercise || '';
    const isPremium = job.model === 'premium';
    const timestamps = job.timestamps || [];
    const poseData = job.poseData || [];

    console.log('[form-check-bg] Job data:', { userId, chunkCount, quality, frameCount: job.frameCount, poseFrames: poseData.length });

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

    const hasPoseData = poseData.some(p => p.poseDetected);
    const poseContext = hasPoseData ? formatPoseContext(poseData, exercise) : '';
    const systemPrompt = buildSystemPrompt(exercise, hasPoseData);

    logActivity({ type: 'form-check', title: 'Form Check Processing', description: `${frames.length} frames (${quality})${hasPoseData ? ' + pose data' : ''}`, model: isPremium ? 'premium' : 'standard', metadata: { userId, jobId, frameCount: frames.length, quality, hasPoseData } });

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
      console.log('[form-check-bg] Gemini responded in', Date.now() - startMs, 'ms using', aiModel);
    } catch (geminiErr) {
      console.warn('[form-check-bg] Gemini failed, falling back to OpenAI:', geminiErr.message);
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
      console.log('[form-check-bg] OpenAI responded in', Date.now() - startMs, 'ms using', aiModel);
    }

    const responseTime = Date.now() - startMs;

    let analysis;
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      analysis = coerceAnalysis(JSON.parse(cleaned));
    } catch (parseErr) {
      console.error('[form-check-bg] JSON parse error:', parseErr.message);
      analysis = null;
    }

    try {
      await db.collection('tokenUsage').add({
        userId,
        feature: 'form-check',
        model: aiModel,
        provider: usedGemini ? 'gemini' : 'openai',
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
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

    console.log('[form-check-bg] Complete:', analysis?.exercise || 'Unknown', analysis?.overallScore || 0, '/10 in', responseTime, 'ms via', aiModel);

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
