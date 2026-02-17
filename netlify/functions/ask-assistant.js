import OpenAI from 'openai'
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';
import { buildContextString, PERSONALITY_PROMPTS } from './utils/promptBuilder.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function handler(event) {
  const cors = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' }
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  // Rate limit
  const rateCheck = await checkRateLimit(auth.uid, 'ask-assistant');
  if (!rateCheck.allowed) {
    return { statusCode: 429, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many requests. Please wait a moment.' }) };
  }

  let creditCost = 0;

  try {
    const { message, context, mode } = JSON.parse(event.body)
    const userId = auth.uid;

    // Greetings are free; regular chat costs 1 credit
    if (mode !== 'greeting') {
      creditCost = 1;
      const creditResult = await deductCredits(userId, 'ask-assistant', creditCost, auth.isAdmin);
      if (!creditResult.success) {
        return { statusCode: 402, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Not enough credits.` }) };
      }
    }

    const contextString = buildContextString(context)
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const personality = context?.personality || 'coach'

    const personalityPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS['coach']

    // ─── GREETING MODE ───
    if (mode === 'greeting') {
      const greetingPrompt = `${personalityPrompt} You know this athlete intimately. Today is ${today}.

Based on the user's data below, generate a personalized greeting and 4 suggested quick actions.

Respond with ONLY valid JSON (no markdown, no backticks, no extra text):
{
  "greeting": "A 1-2 sentence personalized greeting matching your personality. Reference something specific from their data — their last workout, a pain concern, a goal they're close to, how many days since they trained, their readiness score, or a recent PR. Use their first name if available.",
  "quickActions": ["action1", "action2", "action3", "action4"]
}

Quick actions rules:
- Each must be under 8 words
- All 4 must be specific to THIS user's current situation
- Reference their actual exercises, pain areas, goals, or recent data
- Examples: "Why does my elbow hurt?", "Am I on track for 315 squat?", "Light session after yesterday's push day", "Review my deadlift progression"
${contextString}`

      const startTime = Date.now()
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: greetingPrompt },
          { role: 'user', content: 'Generate my greeting and quick actions.' }
        ],
        temperature: 0.8,
        max_tokens: 300
      })

      const responseTime = Date.now() - startTime
      const usage = completion.usage
      const raw = completion.choices[0].message.content

      // Defaults
      let greeting = "Hey! Ready to train? I've got your full history — ask me anything."
      let quickActions = ["What should I do today?", "How's my progress?", "Generate a workout", "Review my last session"]

      try {
        const cleaned = raw.replace(/```json|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (parsed.greeting) greeting = parsed.greeting
        if (parsed.quickActions?.length) quickActions = parsed.quickActions.slice(0, 5)
      } catch (e) {
        console.error('[ask-assistant] Failed to parse greeting:', e, raw)
      }

      const cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60
      logActivity({
        type: 'assistant_greeting',
        title: 'AI Coach Greeting',
        model: 'gpt-4o-mini',
        tokens: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
        cost,
      })

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ greeting, quickActions, usage: {
          userId, feature: 'ask-assistant-greeting', model: 'gpt-4o-mini',
          promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens, estimatedCost: cost, responseTimeMs: responseTime,
          userMessage: '[greeting request]',
          assistantResponse: greeting,
          createdAt: new Date().toISOString()
        }})
      }
    }

    // ─── REGULAR CHAT / WORKOUT GENERATION ───
    const isWorkoutRequest = /generate|create|make|suggest|give me|plan|recommend/i.test(message) &&
                             /workout|routine|session|exercises|program/i.test(message)

    const systemPrompt = isWorkoutRequest
      ? `${personalityPrompt} Today is ${today}. You have full access to the user's training data including set-by-set detail from recent sessions.

Generate a workout and respond with BOTH:
1. A brief explanation (2-3 sentences in your personality style) referencing their specific data — mention actual numbers, recent performance, pain to avoid, recovery status
2. A JSON workout block in this exact format:

\`\`\`workout
{
  "name": "Workout Name",
  "exercises": [
    {
      "name": "Exercise Name",
      "sets": [
        { "prescribedWeight": 135, "prescribedReps": "8" },
        { "prescribedWeight": 135, "prescribedReps": "8" },
        { "prescribedWeight": 135, "prescribedReps": "8" },
        { "prescribedWeight": 135, "prescribedReps": "8" }
      ]
    }
  ]
}
\`\`\`

Each exercise MUST have 3-5 set objects. Use e1RM data for working weights (70-85%). Avoid exercises with pain. Consider recent training to avoid overtraining.
${contextString}`
      : `${personalityPrompt} Today is ${today}. You know this athlete well and have full access to their training data including set-by-set performance from recent workouts.

When they mention pain, discomfort, or soreness: analyze their recent workout data to identify likely causes. Look at weight jumps, high RPE sets, exercises they haven't done in a while, or volume spikes. Be specific — cite actual weights, reps, and RPE from their sessions.

When they ask about progress: reference actual numbers and trends.

Answer using their real data. Be direct — 2-3 sentences unless they ask for detail. Stay in character.
${contextString}`

    const startTime = Date.now()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: isWorkoutRequest ? 1200 : 500
    })

    const responseTime = Date.now() - startTime
    const usage = completion.usage
    const responseText = completion.choices[0].message.content

    let workout = null
    const workoutMatch = responseText.match(/```workout\s*([\s\S]*?)\s*```/)
    if (workoutMatch) {
      try { workout = JSON.parse(workoutMatch[1]) } catch (e) { console.error('Failed to parse workout JSON:', e) }
    }

    const cleanMessage = responseText.replace(/```workout[\s\S]*?```/g, '').trim()
    const cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60

    logActivity({
      type: 'assistant_chat',
      title: workout ? 'Assistant Generated Workout' : 'Assistant Answered Question',
      description: message.slice(0, 120),
      model: 'gpt-4o-mini',
      tokens: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
      cost,
    })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({
        message: cleanMessage, workout,
        usage: {
          userId, feature: 'ask-assistant', model: 'gpt-4o-mini',
          promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens, estimatedCost: cost, responseTimeMs: responseTime,
          userMessage: (message || '').slice(0, 500),
          assistantResponse: cleanMessage.slice(0, 1000),
          createdAt: new Date().toISOString()
        }
      })
    }
  } catch (error) {
    console.error('Ask assistant error:', error)
    logError('ask-assistant', error, 'high', { action: 'chat' });
    await refundCredits(auth.uid, creditCost, auth.isAdmin);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({ error: 'Failed to get response', detail: error.message })
    }
  }
}