import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';
import { buildSystemPrompt, buildUserMessage, formatPoseContext } from './utils/formCheckPrompt.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120000 });

const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

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
    const content = buildUserMessage(frames, timestamps, exercise, note, imageDetail, poseContext);

    logActivity({ type: 'form-check', title: 'Form Check Processing', description: `${frames.length} frames (${quality})${hasPoseData ? ' + pose data' : ''}`, model: isPremium ? 'premium' : 'standard', metadata: { userId, jobId, frameCount: frames.length, quality, hasPoseData } });

    const aiModel = isPremium ? 'gpt-4o' : 'gpt-4o-mini';

    console.log('[form-check-bg] Calling OpenAI...', aiModel, hasPoseData ? '(with pose data)' : '(no pose data)');
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