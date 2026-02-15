import admin from 'firebase-admin';

const db = admin.apps.length ? admin.firestore() : null;

/**
 * Credit costs per feature (source of truth — server-side)
 */
export const CREDIT_COSTS = {
  'ask-assistant': 1,
  'generate-workout': 5,
  'generate-group-workout': 5,
  'generate-program': 10,
  'form-check': 15,
  'suggest-goals': 1,
  'swap-exercise': 1,
  'analyze-progress': 3,
  'autofill-workout': 2,
};

/**
 * Rate limits per feature (requests per window)
 */
const RATE_LIMITS = {
  'ask-assistant':         { max: 30, windowMs: 60000 },   // 30/min
  'generate-workout':      { max: 10, windowMs: 60000 },   // 10/min
  'generate-group-workout': { max: 5, windowMs: 60000 },   // 5/min
  'generate-program':      { max: 5,  windowMs: 60000 },   // 5/min
  'form-check':            { max: 10, windowMs: 60000 },   // 10/min
  'suggest-goals':         { max: 10, windowMs: 60000 },   // 10/min
  'swap-exercise':         { max: 20, windowMs: 60000 },   // 20/min
  'analyze-progress':      { max: 10, windowMs: 60000 },   // 10/min
  'autofill-workout':      { max: 10, windowMs: 60000 },   // 10/min
  default:                 { max: 20, windowMs: 60000 },
};

/**
 * Check rate limit using tokenUsage collection.
 * Returns { allowed: true } or { allowed: false, retryAfterMs }
 */
export async function checkRateLimit(userId, feature) {
  if (!db) return { allowed: true };

  const limit = RATE_LIMITS[feature] || RATE_LIMITS.default;
  const cutoff = new Date(Date.now() - limit.windowMs);

  try {
    const snapshot = await db.collection('tokenUsage')
      .where('userId', '==', userId)
      .where('feature', '==', feature)
      .where('createdAt', '>', cutoff)
      .count()
      .get();

    const count = snapshot.data().count;
    if (count >= limit.max) {
      return { allowed: false, retryAfterMs: limit.windowMs };
    }
    return { allowed: true };
  } catch (err) {
    // If rate limit check fails, allow the request (fail open)
    console.error('[credits] Rate limit check failed:', err.message);
    return { allowed: true };
  }
}

/**
 * Deduct credits server-side. Returns { success, balance, cost } or { success: false, error }
 * Admins bypass credit checks.
 */
export async function deductCredits(userId, feature, customCost = null, isAdmin = false) {
  if (isAdmin) return { success: true, balance: Infinity, cost: 0 };
  if (!db) return { success: false, error: 'Database unavailable' };

  const cost = customCost !== null ? customCost : (CREDIT_COSTS[feature] || 1);

  try {
    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();
    const balance = snap.exists ? (snap.data().credits || 0) : 0;

    if (balance < cost) {
      return { success: false, balance, cost, error: 'insufficient_credits' };
    }

    await userRef.update({ credits: admin.firestore.FieldValue.increment(-cost) });
    return { success: true, balance: balance - cost, cost };
  } catch (err) {
    console.error('[credits] Deduction failed:', err.message);
    return { success: false, error: 'Credit deduction failed' };
  }
}

/**
 * Refund credits on failure
 */
export async function refundCredits(userId, amount, isAdmin = false) {
  if (isAdmin || !db || amount <= 0) return;
  try {
    const userRef = db.collection('users').doc(userId);
    await userRef.update({ credits: admin.firestore.FieldValue.increment(amount) });
  } catch (err) {
    console.error('[credits] Refund failed:', err.message);
  }
}
