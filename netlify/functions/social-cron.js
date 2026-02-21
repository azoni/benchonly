import { admin } from './utils/auth.js';

const db = admin.apps.length ? admin.firestore() : null;
const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';
const SITE_URL = process.env.URL || 'https://benchpressonly.com';

export async function handler(event) {
  console.log('[social-cron] Running scheduled check...');

  if (!db) {
    console.error('[social-cron] Database unavailable');
    return { statusCode: 500, body: 'Database unavailable' };
  }

  try {
    // 1. Load social settings
    const settingsSnap = await db.collection('settings').doc('social').get();
    if (!settingsSnap.exists) {
      console.log('[social-cron] No social settings found — skipping');
      return { statusCode: 200, body: 'No social settings configured' };
    }

    const settings = settingsSnap.data();
    if (!settings.enabled) {
      console.log('[social-cron] Social posting is disabled');
      return { statusCode: 200, body: 'Social posting disabled' };
    }

    // 2. Check if enough time has elapsed
    const lastPosted = settings.lastPostedAt?.toMillis() || 0;
    const hoursSince = (Date.now() - lastPosted) / (1000 * 60 * 60);
    const frequencyHours = settings.frequencyHours || 12;

    if (hoursSince < frequencyHours) {
      console.log(`[social-cron] Too soon: ${hoursSince.toFixed(1)}h / ${frequencyHours}h`);
      return { statusCode: 200, body: `Too soon (${hoursSince.toFixed(1)}h elapsed, need ${frequencyHours}h)` };
    }

    // 3. Check if there's already a queued thread
    const queuedSnap = await db.collection('socialThreads')
      .where('status', '==', 'queued')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();

    let threadId;

    if (!queuedSnap.empty) {
      // Use existing queued thread
      threadId = queuedSnap.docs[0].id;
      console.log(`[social-cron] Found queued thread: ${threadId}`);
    } else {
      // 4. Generate a new thread
      console.log('[social-cron] No queued threads — generating new one...');
      try {
        const genRes = await fetch(`${SITE_URL}/.netlify/functions/generate-social-thread`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _internalKey: INTERNAL_KEY }),
        });

        if (!genRes.ok) {
          const err = await genRes.text();
          console.error('[social-cron] Generation failed:', err);
          return { statusCode: 500, body: `Generation failed: ${err}` };
        }

        const genData = await genRes.json();
        threadId = genData.threadId;
        console.log(`[social-cron] Generated thread: ${threadId} (${genData.topic})`);
      } catch (genError) {
        console.error('[social-cron] Generation fetch failed:', genError.message);
        return { statusCode: 500, body: `Generation failed: ${genError.message}` };
      }
    }

    // 5. Post the thread
    console.log(`[social-cron] Posting thread: ${threadId}`);
    try {
      const postRes = await fetch(`${SITE_URL}/.netlify/functions/post-social-thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, _internalKey: INTERNAL_KEY }),
      });

      if (!postRes.ok) {
        const err = await postRes.text();
        console.error('[social-cron] Posting failed:', err);
        return { statusCode: 500, body: `Posting failed: ${err}` };
      }

      const postData = await postRes.json();
      console.log(`[social-cron] Posted successfully: ${postData.threadUrl}`);
      return { statusCode: 200, body: `Posted: ${postData.threadUrl}` };
    } catch (postError) {
      console.error('[social-cron] Post fetch failed:', postError.message);
      return { statusCode: 500, body: `Posting failed: ${postError.message}` };
    }
  } catch (error) {
    console.error('[social-cron] Unexpected error:', error);
    return { statusCode: 500, body: `Error: ${error.message}` };
  }
}
