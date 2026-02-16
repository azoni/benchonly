import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;

/**
 * Synchronous dispatcher for form check.
 * 1. CORS, auth, credits, validation
 * 2. Stores frames in Firestore (background function has 256KB request limit)
 * 3. Fires background function with just the jobId
 * 4. Returns jobId for client to listen on via Firestore
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
  let userId;

  try {
    const { frames, note, targetUserId, model, quality } = JSON.parse(event.body);
    userId = (auth.isAdmin && targetUserId) ? targetUserId : auth.uid;

    const isPremium = model === 'premium' && auth.isAdmin;
    const QUALITY_COSTS = { quick: 10, standard: 15, detailed: 25 };
    creditCost = isPremium ? 50 : (QUALITY_COSTS[quality] || 15);

    // Deduct credits
    const creditResult = await deductCredits(userId, 'form-check', creditCost, auth.isAdmin);
    if (!creditResult.success) {
      return { statusCode: 402, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Not enough credits. Need ${creditCost}, have ${creditResult.balance}.` }) };
    }

    // Validate
    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      await refundCredits(userId, creditCost, auth.isAdmin);
      return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No frames provided' }) };
    }
    if (frames.length > 25) {
      await refundCredits(userId, creditCost, auth.isAdmin);
      return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many frames (max 25)' }) };
    }

    const jobId = `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Store job metadata
    await db.collection('formCheckJobs').doc(jobId).set({
      userId,
      status: 'processing',
      quality: quality || 'standard',
      frameCount: frames.length,
      note: note || null,
      model: model || 'standard',
      isAdmin: auth.isAdmin,
      creditCost,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Store frames separately (background function has 256KB request limit)
    // Split into chunks of 5 to stay under Firestore's 1MB doc limit
    const CHUNK_SIZE = 5;
    const chunks = [];
    for (let i = 0; i < frames.length; i += CHUNK_SIZE) {
      chunks.push(frames.slice(i, i + CHUNK_SIZE));
    }
    const batch = db.batch();
    chunks.forEach((chunk, i) => {
      const ref = db.collection('formCheckFrames').doc(`${jobId}_chunk${i}`);
      batch.set(ref, { jobId, chunkIndex: i, frames: chunk, userId });
    });
    await batch.commit();

    logActivity({ type: 'form-check', title: 'Form Check', description: `Queued ${frames.length} frames (${quality || 'standard'})`, metadata: { userId, frameCount: frames.length, quality: quality || 'standard' } });

    // Fire background function with just the jobId (small payload, under 256KB)
    const siteUrl = process.env.URL || 'https://benchpressonly.com';
    fetch(`${siteUrl}/.netlify/functions/analyze-form-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _internalKey: process.env.OPENAI_API_KEY, jobId }),
    }).catch(err => {
      console.error('[analyze-form] Failed to invoke background function:', err.message);
    });

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    };

  } catch (error) {
    console.error('Form analysis dispatch error:', error);
    if (creditCost > 0 && userId) {
      await refundCredits(userId, creditCost, auth.isAdmin).catch(() => {});
    }
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to start analysis. Please try again.' }),
    };
  }
}