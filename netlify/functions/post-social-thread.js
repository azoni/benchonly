import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { TwitterApi } from 'twitter-api-v2';

const db = admin.apps.length ? admin.firestore() : null;
const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

function getTwitterClient() {
  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });
}

async function postThread(client, tweets) {
  const postedIds = [];

  // Post first tweet
  const first = await client.v2.tweet(tweets[0].text);
  postedIds.push(first.data.id);
  tweets[0].tweetId = first.data.id;

  // Post subsequent tweets as replies
  let previousId = first.data.id;
  for (let i = 1; i < tweets.length; i++) {
    const reply = await client.v2.reply(tweets[i].text, previousId);
    postedIds.push(reply.data.id);
    tweets[i].tweetId = reply.data.id;
    previousId = reply.data.id;
  }

  return { postedIds, firstTweetId: first.data.id };
}

export async function handler(event) {
  const cors = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const body = JSON.parse(event.body || '{}');
  const isInternal = body._internalKey === INTERNAL_KEY;

  if (!isInternal) {
    const auth = await verifyAuth(event);
    if (!auth || !auth.isAdmin) return UNAUTHORIZED;
  }

  if (!db) {
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Database unavailable' }) };
  }

  const { threadId } = body;
  if (!threadId) {
    return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'threadId required' }) };
  }

  try {
    // Load thread
    const threadDoc = await db.collection('socialThreads').doc(threadId).get();
    if (!threadDoc.exists) {
      return { statusCode: 404, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Thread not found' }) };
    }

    const thread = threadDoc.data();
    if (thread.status === 'posted') {
      return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Thread already posted' }) };
    }

    // Mark as posting
    await db.collection('socialThreads').doc(threadId).update({
      status: 'posting',
    });

    // Check for Twitter credentials
    if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_ACCESS_TOKEN) {
      await db.collection('socialThreads').doc(threadId).update({
        status: 'failed',
        error: 'Twitter API credentials not configured',
      });
      return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Twitter API credentials not configured' }) };
    }

    const client = getTwitterClient();
    const tweets = [...thread.tweets].sort((a, b) => a.index - b.index);

    const { postedIds, firstTweetId } = await postThread(client, tweets);

    // Get X username for thread URL (fall back to generic)
    let threadUrl = `https://x.com/i/status/${firstTweetId}`;
    try {
      const me = await client.v2.me();
      if (me?.data?.username) {
        threadUrl = `https://x.com/${me.data.username}/status/${firstTweetId}`;
      }
    } catch (e) {
      // Non-critical — URL without username still works
    }

    // Update thread doc
    await db.collection('socialThreads').doc(threadId).update({
      status: 'posted',
      tweets,
      threadUrl,
      xTweetIds: postedIds,
      postedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: null,
    });

    // Update social settings
    try {
      await db.collection('settings').doc('social').update({
        lastPostedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalThreadsPosted: admin.firestore.FieldValue.increment(1),
      });
    } catch (e) {
      // Settings doc may not exist yet
      await db.collection('settings').doc('social').set({
        lastPostedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalThreadsPosted: 1,
      }, { merge: true });
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        threadUrl,
        tweetIds: postedIds,
      }),
    };
  } catch (error) {
    console.error('[post-social-thread] Error:', error);

    // Mark thread as failed
    try {
      await db.collection('socialThreads').doc(threadId).update({
        status: 'failed',
        error: error.message || 'Posting failed',
      });
    } catch (e) {
      console.error('[post-social-thread] Failed to update thread status:', e.message);
    }

    // Check for rate limit errors
    const isRateLimit = error.code === 429 || error.message?.includes('rate limit');
    if (isRateLimit) {
      try {
        await db.collection('socialThreads').doc(threadId).update({
          status: 'queued',
          error: 'Rate limited — will retry on next cron cycle',
        });
      } catch (e) { /* ignore */ }
    }

    return {
      statusCode: error.code === 429 ? 429 : 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Posting failed' }),
    };
  }
}
