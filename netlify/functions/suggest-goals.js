import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, CORS_HEADERS, OPTIONS_RESPONSE, admin } from './utils/auth.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return OPTIONS_RESPONSE;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  const rateCheck = await checkRateLimit(auth.uid, 'suggest-goals');
  if (!rateCheck.allowed) {
    return { statusCode: 429, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Too many requests.' }) };
  }
  const creditResult = await deductCredits(auth.uid, 'suggest-goals', null, auth.isAdmin);
  if (!creditResult.success) {
    return { statusCode: 402, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not enough credits.' }) };
  }

  try {
    const { maxLifts, currentGoals, recentWorkouts } = JSON.parse(event.body);

    const liftEntries = Object.entries(maxLifts || {});
    const hasData = liftEntries.length > 0;

    if (!hasData) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({
          suggestions: [],
          noData: true,
          message: 'Not enough training data to suggest goals yet. Log a few workouts so we can analyze your lifts and suggest meaningful targets.',
        }),
      };
    }

    // Build context
    let context = 'CURRENT MAXES:\n';
    liftEntries.sort((a, b) => b[1].e1rm - a[1].e1rm).forEach(([name, data]) => {
      context += `  ${name}: ${data.e1rm}lb e1RM (best: ${data.weight}x${data.reps})\n`;
    });

    if (currentGoals?.length) {
      context += '\nEXISTING GOALS (do NOT suggest duplicates):\n';
      currentGoals.forEach(g => {
        context += `  ${g.lift}: ${g.currentValue || '?'} → ${g.targetValue} (${g.metricType || 'weight'})\n`;
      });
    }

    if (recentWorkouts?.length) {
      context += `\nRECENT ACTIVITY: ${recentWorkouts.length} workouts in last 30 days\n`;
    }

    const systemPrompt = `You are a strength coach suggesting realistic training goals.

Given the athlete's current maxes and training history, suggest 2-4 achievable goals.

RULES:
- Goals should be achievable in 4-12 weeks
- Base targets on realistic progression (5-15% improvement for intermediates, 10-25% for beginners)
- Include a mix: primary lifts AND accessory/secondary lifts when relevant
- Do NOT duplicate any existing goals
- Each goal needs: exercise name, metric type (weight/reps/time), current value, target value, and a brief reason
- For weight goals, round targets to nearest 5 lbs
- For rep goals, use reasonable rep ranges

OUTPUT JSON only, no markdown:
{
  "suggestions": [
    {
      "lift": "Bench Press",
      "metricType": "weight",
      "currentValue": 225,
      "targetValue": 245,
      "reason": "You've been consistently hitting 225 — a 20lb jump over 8 weeks is realistic with progressive overload."
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1000,
    });

    let result;
    try {
      result = JSON.parse(completion.choices[0].message.content);
    } catch {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: 'AI returned invalid response' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({
        suggestions: result.suggestions || [],
        noData: false,
      }),
    };

  } catch (error) {
    console.error('Error suggesting goals:', error);
    await refundCredits(auth.uid, creditResult.cost || 1, auth.isAdmin);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: error.message }),
    };
  }
}
