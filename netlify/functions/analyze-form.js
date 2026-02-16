import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;

/**
 * Sync dispatcher — handles CORS, auth, credits, stores frames in Firestore,
 * invokes background function, and returns jobId immediately.
 */
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

  try {
    const { jobId, frames, note, targetUserId, model, quality } = JSON.parse(event.body);
    const userId = (auth.isAdmin && targetUserId) ? targetUserId : auth.uid;

    if (!jobId) {
      return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing jobId' }) };
    }

    const isPremium = model === 'premium' && auth.isAdmin;
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

    // Store frames in Firestore chunks (5 per chunk, stays under 1MB doc limit)
    const CHUNK_SIZE = 5;
    const chunks = [];
    for (let i = 0; i < frames.length; i += CHUNK_SIZE) {
      chunks.push(frames.slice(i, i + CHUNK_SIZE));
    }

    const batch = db.batch();
    chunks.forEach((chunk, idx) => {
      const chunkRef = db.collection('formCheckFrames').doc(`${jobId}_chunk${idx}`);
      batch.set(chunkRef, {
        jobId,
        userId,
        chunkIndex: idx,
        frames: chunk,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Update the job doc (client already created it with status: pending)
    const jobRef = db.collection('formCheckJobs').doc(jobId);
    batch.set(jobRef, {
      userId,
      status: 'processing',
      quality: quality || 'standard',
      frameCount: frames.length,
      chunkCount: chunks.length,
      note: note || '',
      model: isPremium ? 'premium' : 'standard',
      imageDetail: isPremium ? 'high' : 'low',
      creditCost,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: false });

    await batch.commit();

    logActivity({ type: 'form-check', title: 'Form Check Queued', description: `${frames.length} frames (${quality || 'standard'})`, metadata: { userId, frameCount: frames.length, quality: quality || 'standard' } });

    // Fire background function — just the jobId, no frames in payload
    const siteUrl = process.env.URL || 'https://benchpressonly.com';
    fetch(`${siteUrl}/.netlify/functions/analyze-form-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        _internalKey: process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal',
      }),
    }).catch(err => {
      console.error('[form-check-dispatch] Failed to invoke background:', err.message);
    });

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    };
  } catch (error) {
    console.error('[form-check-dispatch] Error:', error);
    logError('analyze-form', error, 'high', { userId: auth.uid });
    if (creditCost > 0) {
      await refundCredits(auth.uid, creditCost, auth.isAdmin).catch(() => {});
    }
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to start analysis. Please try again.' }),
    };
  }
}