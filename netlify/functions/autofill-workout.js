import OpenAI from 'openai'
import { verifyAuth, UNAUTHORIZED, CORS_HEADERS, OPTIONS_RESPONSE } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return OPTIONS_RESPONSE;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  try {
    const { partialWorkout, recentWorkouts, goals } = JSON.parse(event.body)
    const userId = auth.uid;

    const systemPrompt = `You are a strength training AI that helps complete partially filled workout logs. Based on the user's recent training history, goals, and the exercises already logged, suggest appropriate weights, reps, and sets.

Respond with a JSON object matching this structure:
{
  "exercises": [
    {
      "name": "Exercise name",
      "sets": [
        { "prescribedWeight": 185, "prescribedReps": 5 }
      ]
    }
  ],
  "suggestions": ["Any relevant suggestions or notes"]
}

Base your recommendations on:
- Progressive overload (slightly increase from last session when appropriate)
- The user's recent performance on similar exercises
- Their stated goals
- Standard rep ranges for different goals (strength: 1-5, hypertrophy: 6-12, endurance: 12+)`

    const userPrompt = `Complete this partial workout:

Current workout data:
${JSON.stringify(partialWorkout, null, 2)}

Recent relevant workouts:
${recentWorkouts?.slice(0, 3).map(w => JSON.stringify(w)).join('\n') || 'None'}

Goals:
${goals?.map(g => `${g.lift}: targeting ${g.targetWeight}lbs`).join(', ') || 'General strength'}

Fill in missing weights and reps based on progression from recent workouts.`

    const startTime = Date.now()

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 1000
    })

    const responseTime = Date.now() - startTime
    const usage = completion.usage

    const tokenLog = {
      userId,
      feature: 'autofill',
      model: 'gpt-4o-mini',
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      responseTimeMs: responseTime,
      createdAt: new Date().toISOString()
    }

    const result = JSON.parse(completion.choices[0].message.content)

    // GPT-4o-mini: $0.15/$0.60 per 1M tokens
    const cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60

    // Log to portfolio activity feed
    logActivity({
      type: 'workout_autofilled',
      title: 'Autofilled Workout Data',
      description: `${result.exercises?.length || 0} exercises filled with predicted weights/reps`,
      model: 'gpt-4o-mini',
      tokens: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
      cost,
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ...result,
        usage: tokenLog
      })
    }
  } catch (error) {
    console.error('Autofill workout error:', error)
    logError('autofill-workout', error, 'high', { action: 'autofill' });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to autofill workout' })
    }
  }
}