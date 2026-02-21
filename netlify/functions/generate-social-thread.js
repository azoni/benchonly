import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import OpenAI from 'openai';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 24000 });
const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

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

export async function handler(event) {
  const cors = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  // Auth: admin Bearer token OR internal key from cron
  const body = JSON.parse(event.body || '{}');
  const isInternal = body._internalKey === INTERNAL_KEY;

  if (!isInternal) {
    const auth = await verifyAuth(event);
    if (!auth || !auth.isAdmin) return UNAUTHORIZED;
  }

  if (!db) {
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Database unavailable' }) };
  }

  try {
    // Load social settings
    const settingsSnap = await db.collection('settings').doc('social').get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {
      topicWeights: { bench_technique: 20, programming: 15, nutrition: 10, recovery: 10, myth_busting: 15, motivation: 5, app_promo: 15, hot_takes: 10 },
      contentTypeMix: { education: 50, promo: 25, engagement: 25 },
      threadLength: { min: 4, max: 8 },
    };

    // Get recent topics to avoid repeats
    const recentSnap = await db.collection('socialThreads')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    const recentTopics = recentSnap.docs.map(d => d.data().topic);

    // Select topic and content type (allow override from body)
    const topic = body.topic || selectTopic(settings.topicWeights || {}, recentTopics);
    const contentType = body.contentType || selectContentType(settings.contentTypeMix || {});
    const threadLength = settings.threadLength || { min: 4, max: 8 };

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

    // Validate and fix tweet lengths
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
      console.error('[social] Failed to log token usage:', e.message);
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: threadRef.id,
        topic,
        contentType,
        tweetCount: tweets.length,
        tweets,
      }),
    };
  } catch (error) {
    console.error('[generate-social-thread] Error:', error);
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Thread generation failed' }),
    };
  }
}
