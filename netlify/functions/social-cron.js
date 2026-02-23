import { admin } from './utils/auth.js';
import OpenAI from 'openai';
import { TwitterApi } from 'twitter-api-v2';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000 });

const TOPIC_CONFIG = {
  bench_technique: 'Form cues, grip width, arch, leg drive, bar path, pause reps, touch point, elbow tuck, scapula retraction',
  programming: 'Periodization, frequency, volume, intensity, deload protocols, peaking, wave loading, RPE-based training',
  nutrition: 'Protein timing, caloric surplus for strength, creatine, caffeine, supplements that actually have evidence',
  recovery: 'Sleep optimization, deload weeks, managing fatigue, overtraining signs, mobility, active recovery',
  myth_busting: 'Debunk common gym myths with evidence. Decline bench targeting, muscle confusion, spot reduction, etc.',
  motivation: 'Mindset shifts, consistency over perfection, progress timelines, plateaus are normal, long-term thinking',
  app_promo: 'BenchOnly feature spotlight — AI workout generation, form check with video, progress tracking, AI coach chat',
  hot_takes: 'Strong controversial opinions designed to spark debate. Challenge conventional wisdom. Be bold but defensible.',
};

function selectTopic(topicWeights, recentTopics) {
  const available = Object.entries(topicWeights)
    .filter(([topic]) => !recentTopics.slice(0, 3).includes(topic));
  const pool = available.length > 0 ? available : Object.entries(topicWeights);
  const totalWeight = pool.reduce((sum, [, w]) => sum + w, 0);
  let random = Math.random() * totalWeight;
  for (const [topic, weight] of pool) {
    random -= weight;
    if (random <= 0) return topic;
  }
  return pool[0][0];
}

function selectContentType(contentTypeMix) {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (const [type, pct] of Object.entries(contentTypeMix)) {
    cumulative += pct;
    if (rand <= cumulative) return type;
  }
  return 'education';
}

function buildPrompt(topic, contentType, threadLength) {
  return `You are BenchOnly's social media manager. You must ONLY talk about things that are true.

ABOUT BENCHONLY (benchpressonly.com):
BenchOnly is a free AI-powered strength training app. Here is EXACTLY what it does — do not claim it does anything else:
- Generates personalized strength training workouts using AI (bench press focused but supports all lifts)
- Tracks workout history and progress over time with charts and stats
- Analyzes lifting form via video upload (AI form check)
- Has an AI coach you can chat with for training advice
- Supports group workouts where a coach can assign workouts to athletes
- Tracks goals (weight targets, rep targets, time targets)
- Calendar view of training history
- Superset exercise support
- Works on web and mobile (iOS/Android)

WHAT BENCHONLY DOES NOT DO (never mention these):
- No meal plans, nutrition tracking, calorie counting, or diet features
- No supplement store or product sales
- No social feed or community features for public users
- No wearable/smartwatch integration (except optional Oura Ring sleep data)
- No video library or exercise demonstration videos
- No personal training marketplace
- No payment or subscription (it's free)

CRITICAL: Never invent or imply features that aren't listed above. When mentioning the app, only reference real features.

Generate a Twitter/X thread on the topic below. The thread must be ${threadLength.min}-${threadLength.max} tweets long.

RULES:
1. Each tweet MUST be 280 characters or fewer. This is CRITICAL — count carefully. Prefer 200-260 chars for safety.
2. First tweet = HOOK. Bold statement, surprising stat, or provocative question that stops the scroll.
3. Use a natural, confident tone — like a coach who knows their stuff, not a corporate account.
4. Include specific numbers, percentages, or timeframes when possible. Specificity = credibility.
5. Use line breaks within tweets for readability.
6. Last tweet = summary takeaway or call-to-action.
7. NO hashtags anywhere (they reduce engagement on modern X).
8. NO emojis in the first tweet (hook should feel serious/authoritative).
9. Emojis sparingly in later tweets — max 1-2 per tweet, only where they add tone.
10. Write in a way that makes people want to bookmark and share.
11. For nutrition/supplement topics: share general fitness knowledge only. Do NOT claim BenchOnly has any nutrition features.

CONTENT TYPE: ${contentType}
${contentType === 'education' ? '- Pure value. Teach something actionable. No app mention at all.' : ''}
${contentType === 'promo' ? '- 80% value, 20% subtle plug. Only mention BenchOnly in the LAST tweet as a natural CTA referencing a REAL feature. Example: "If you want help programming this, BenchOnly generates personalized bench programs for free → benchpressonly.com"' : ''}
${contentType === 'engagement' ? '- Take a strong, bold stance. Designed to spark debate in replies. Controversial but defensible. Can mention the app in the last tweet but only reference REAL features.' : ''}

TOPIC: ${topic}
Topic details: ${TOPIC_CONFIG[topic] || topic}

Respond with valid JSON only:
{
  "tweets": [
    { "index": 0, "text": "First tweet (the hook)" },
    { "index": 1, "text": "Second tweet" }
  ]
}`;
}

function getTwitterClient() {
  return new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });
}

async function generateThread(settings) {
  const topicWeights = settings.topicWeights || {
    bench_technique: 20, programming: 15, nutrition: 10, recovery: 10,
    myth_busting: 15, motivation: 5, app_promo: 15, hot_takes: 10,
  };
  const contentTypeMix = settings.contentTypeMix || { education: 50, promo: 25, engagement: 25 };
  const threadLength = settings.threadLength || { min: 4, max: 8 };

  // Get recent topics to avoid repeats
  const recentSnap = await db.collection('socialThreads')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
  const recentTopics = recentSnap.docs.map(d => d.data().topic);

  const topic = selectTopic(topicWeights, recentTopics);
  const contentType = selectContentType(contentTypeMix);
  const systemPrompt = buildPrompt(topic, contentType, threadLength);
  const startTime = Date.now();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate a ${contentType} thread about: ${topic.replace(/_/g, ' ')}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9,
    max_tokens: 3000,
  });

  const responseTimeMs = Date.now() - startTime;
  const usage = completion.usage || {};
  const raw = completion.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);

  if (!parsed.tweets || !Array.isArray(parsed.tweets) || parsed.tweets.length < 3) {
    throw new Error('Invalid thread format from LLM');
  }

  const tweets = parsed.tweets.map((t, i) => ({
    index: i,
    text: t.text.length > 280 ? t.text.substring(0, 277) + '...' : t.text,
    tweetId: null,
  }));

  // Save to Firestore
  const threadRef = await db.collection('socialThreads').add({
    topic,
    contentType,
    tweets,
    tweetCount: tweets.length,
    status: 'queued',
    error: null,
    threadUrl: null,
    scheduledFor: admin.firestore.FieldValue.serverTimestamp(),
    postedAt: null,
    impressions: 0,
    likes: 0,
    retweets: 0,
    replies: 0,
    model: 'gpt-4o-mini',
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    estimatedCost: ((usage.prompt_tokens || 0) * 0.00000015 + (usage.completion_tokens || 0) * 0.0000006),
    generationTimeMs: responseTimeMs,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Log token usage
  try {
    await db.collection('tokenUsage').add({
      feature: 'social-thread',
      model: 'gpt-4o-mini',
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      estimatedCost: ((usage.prompt_tokens || 0) * 0.00000015 + (usage.completion_tokens || 0) * 0.0000006),
      responseTimeMs,
      userId: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('[social-cron] Failed to log token usage:', e.message);
  }

  console.log(`[social-cron] Generated thread: ${threadRef.id} (${topic} / ${contentType})`);
  return threadRef.id;
}

async function postThread(threadId) {
  if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_ACCESS_TOKEN) {
    await db.collection('socialThreads').doc(threadId).update({
      status: 'failed',
      error: 'Twitter API credentials not configured',
    });
    throw new Error('Twitter API credentials not configured');
  }

  const threadDoc = await db.collection('socialThreads').doc(threadId).get();
  if (!threadDoc.exists) throw new Error('Thread not found');

  const thread = threadDoc.data();
  if (thread.status === 'posted') {
    console.log(`[social-cron] Thread ${threadId} already posted — skipping`);
    return thread.threadUrl;
  }

  // Mark as posting
  await db.collection('socialThreads').doc(threadId).update({ status: 'posting' });

  const client = getTwitterClient();
  const tweets = [...thread.tweets].sort((a, b) => a.index - b.index);
  const postedIds = [];

  // Post first tweet
  const first = await client.v2.tweet(tweets[0].text);
  postedIds.push(first.data.id);
  tweets[0].tweetId = first.data.id;

  // Post replies
  let previousId = first.data.id;
  for (let i = 1; i < tweets.length; i++) {
    const reply = await client.v2.reply(tweets[i].text, previousId);
    postedIds.push(reply.data.id);
    tweets[i].tweetId = reply.data.id;
    previousId = reply.data.id;
  }

  // Get username for thread URL
  let threadUrl = `https://x.com/i/status/${first.data.id}`;
  try {
    const me = await client.v2.me();
    if (me?.data?.username) {
      threadUrl = `https://x.com/${me.data.username}/status/${first.data.id}`;
    }
  } catch (e) {
    // Non-critical
  }

  // Update thread
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
    await db.collection('settings').doc('social').set({
      lastPostedAt: admin.firestore.FieldValue.serverTimestamp(),
      totalThreadsPosted: 1,
    }, { merge: true });
  }

  return threadUrl;
}

export async function handler() {
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

    // 3. Check if there's already a queued thread ready to post
    const queuedSnap = await db.collection('socialThreads')
      .where('status', '==', 'queued')
      .orderBy('createdAt', 'asc')
      .limit(1)
      .get();

    if (!queuedSnap.empty) {
      // Queued thread exists — post it (this cycle)
      const threadId = queuedSnap.docs[0].id;
      console.log(`[social-cron] Posting queued thread: ${threadId}`);
      const threadUrl = await postThread(threadId);
      console.log(`[social-cron] Posted successfully: ${threadUrl}`);
      return { statusCode: 200, body: `Posted: ${threadUrl}` };
    }

    // 4. No queued thread — generate one now, post it next cycle
    //    This split keeps each cycle well within the 26s timeout
    console.log('[social-cron] No queued threads — generating for next cycle...');
    const threadId = await generateThread(settings);
    console.log(`[social-cron] Generated thread: ${threadId} — will post next cycle`);
    return { statusCode: 200, body: `Generated: ${threadId} (will post next cycle)` };

  } catch (error) {
    console.error('[social-cron] Error:', error);

    // Handle rate limits — re-queue the thread for next cycle
    const isRateLimit = error.code === 429 || error.message?.includes('rate limit');
    if (isRateLimit) {
      console.log('[social-cron] Rate limited — will retry next cycle');
    }

    return { statusCode: 500, body: `Error: ${error.message}` };
  }
}