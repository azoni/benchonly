import OpenAI from 'openai'
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

/**
 * Build the full user context string from the context object.
 */
function buildContextString(context) {
  const userContext = []

  // Profile info
  if (context?.profile) {
    const p = context.profile
    const bits = []
    if (p.displayName) bits.push(`Name: ${p.displayName}`)
    if (p.weight) bits.push(`Weight: ${p.weight}lbs`)
    if (p.height) bits.push(`Height: ${p.height}`)
    if (p.age) bits.push(`Age: ${p.age}`)
    if (p.activityLevel) bits.push(`Activity level: ${p.activityLevel}`)
    if (bits.length) userContext.push(bits.join(' | '))
  }

  // Max lifts
  if (context?.maxLifts && Object.keys(context.maxLifts).length > 0) {
    const lifts = Object.entries(context.maxLifts)
      .sort((a, b) => b[1].e1rm - a[1].e1rm)
      .slice(0, 8)
      .map(([name, d]) => `${name}: ${d.e1rm}lb e1RM (${d.weight}x${d.reps})`)
    userContext.push(`MAX LIFTS:\n${lifts.join('\n')}`)
  }

  // Pain history
  if (context?.painHistory && Object.keys(context.painHistory).length > 0) {
    const pains = Object.entries(context.painHistory)
      .map(([name, d]) => {
        let s = `${name}: ${d.maxPain}/10 pain (${d.count}x`
        if (d.lastDaysAgo != null) s += `, last ${d.lastDaysAgo}d ago`
        if (d.recentCount) s += `, ${d.recentCount}x in 30d`
        s += ')'
        return s
      })
    userContext.push(`PAIN HISTORY:\n${pains.join('\n')}`)
  }

  // RPE averages
  if (context?.rpeAverages && Object.keys(context.rpeAverages).length > 0) {
    const rpes = Object.entries(context.rpeAverages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, avg]) => `${name}: avg RPE ${avg}`)
    userContext.push(`RPE AVERAGES:\n${rpes.join('\n')}`)
  }

  // Full recent workout details (set-by-set) — last 3
  if (context?.recentWorkoutsFull?.length) {
    const details = context.recentWorkoutsFull.slice(0, 3).map(w => {
      let s = `--- ${w.name || 'Workout'} (${w.date}) ---`
      ;(w.exercises || []).forEach(ex => {
        s += `\n  ${ex.name} [${ex.type || 'weight'}]:`
        ;(ex.sets || []).forEach((set, i) => {
          const parts = []
          if (set.prescribedWeight) parts.push(`target: ${set.prescribedWeight}lbs x ${set.prescribedReps || '?'}`)
          if (set.actualWeight) parts.push(`actual: ${set.actualWeight}lbs x ${set.actualReps || '?'}`)
          else if (set.actualReps) parts.push(`actual: ${set.actualReps} reps`)
          if (set.prescribedTime) parts.push(`target: ${set.prescribedTime}s`)
          if (set.actualTime) parts.push(`actual: ${set.actualTime}s`)
          if (set.rpe) parts.push(`RPE ${set.rpe}`)
          if (set.painLevel > 0) parts.push(`pain ${set.painLevel}/10`)
          s += `\n    Set ${i + 1}: ${parts.join(' | ')}`
        })
      })
      return s
    }).join('\n\n')
    userContext.push(`RECENT WORKOUTS (FULL DETAIL):\n${details}`)
  }

  // Workout summaries (older workouts beyond the 3 detailed ones)
  if (context?.recentWorkouts?.length) {
    const summary = context.recentWorkouts.slice(0, 5).map(w => {
      const exNames = w.exercises?.map(e => e.name).join(', ') || ''
      return `${w.date}: ${w.name}${exNames ? ` [${exNames}]` : ''}`
    }).join('\n')
    userContext.push(`OLDER WORKOUTS (SUMMARY):\n${summary}`)
  }

  // Recent cardio
  if (context?.cardioWorkouts?.length) {
    const cardioSummary = context.cardioWorkouts.slice(0, 5).map(w =>
      `${w.date}: ${w.name || w.cardioType || 'Cardio'} (${w.duration}min${w.distance ? `, ${w.distance}mi` : ''}${w.calories ? `, ${w.calories}cal` : ''})`
    ).join('\n')
    userContext.push(`RECENT CARDIO:\n${cardioSummary}`)
  }

  // Goals
  if (context?.goals?.length) {
    const goalsSummary = context.goals.map(g => {
      const current = g.currentWeight || g.currentValue || '?'
      const target = g.targetWeight || g.targetValue || '?'
      return `${g.lift || g.metricType}: ${current} -> ${target}${g.targetDate ? ` by ${g.targetDate}` : ''}`
    }).join('\n')
    userContext.push(`ACTIVE GOALS:\n${goalsSummary}`)
  }

  // Health data
  if (context?.health && Object.keys(context.health).length > 0) {
    const h = context.health
    const info = []
    if (h.recentWeight) info.push(`Current weight: ${h.recentWeight}lbs`)
    if (h.avgSleep) info.push(`Avg sleep: ${h.avgSleep}hrs`)
    if (h.avgProtein) info.push(`Avg protein: ${h.avgProtein}g`)
    if (h.avgCalories) info.push(`Avg calories: ${h.avgCalories}`)
    if (info.length) userContext.push(`HEALTH METRICS:\n${info.join('\n')}`)
  }

  // Oura data
  if (context?.ouraData) {
    const { latest, averages } = context.ouraData
    const info = []
    if (latest?.readiness?.score) info.push(`Today readiness: ${latest.readiness.score}/100`)
    if (latest?.sleep?.score) info.push(`Last sleep: ${latest.sleep.score}/100`)
    if (latest?.activity?.score) info.push(`Activity score: ${latest.activity.score}/100`)
    if (averages?.readinessScore) info.push(`7-day avg readiness: ${averages.readinessScore}`)
    if (info.length) userContext.push(`OURA RING:\n${info.join('\n')}`)
  }

  // Schedules
  if (context?.schedules?.length) {
    const s = context.schedules.map(s =>
      `${s.name}${s.days ? ` (${Array.isArray(s.days) ? s.days.join(', ') : s.days})` : ''}${s.duration ? ` ${s.duration}min` : ''}`
    ).join(', ')
    userContext.push(`SCHEDULED ACTIVITIES: ${s}`)
  }

  // Recurring
  if (context?.recurringActivities?.length) {
    const r = context.recurringActivities.map(r =>
      `${r.name} (${r.type || 'activity'}${r.days ? `, ${Array.isArray(r.days) ? r.days.join(', ') : r.days}` : ''})`
    ).join(', ')
    userContext.push(`RECURRING HABITS: ${r}`)
  }

  // Form check history
  if (context?.formChecks?.length) {
    const fc = context.formChecks.map(f => {
      let s = `${f.exercise}: ${f.score}/10 (${f.date})`
      if (f.focusCue) s += ` — Focus: "${f.focusCue}"`
      if (f.injuryRisks?.length) {
        s += ` — Risks: ${f.injuryRisks.map(r => `${r.area} (${r.severity})`).join(', ')}`
      }
      return s
    }).join('\n')
    userContext.push(`FORM CHECK HISTORY:\n${fc}`)
  }

  // Admin/trainer notes
  if (context?.adminNotes) {
    userContext.push(`TRAINER NOTES:\n${context.adminNotes}`)
  }

  return userContext.length ? `\n\nUser data:\n${userContext.join('\n\n')}` : ''
}

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

    // Personality modifiers
    const PERSONALITY_PROMPTS = {
      'coach': 'You are a direct, knowledgeable strength coach. Warm but professional. Keep advice clear and actionable.',
      'drill-sergeant': 'You are a tough-love coach. Blunt, no sugar-coating, hold them accountable. Short sentences. If they skipped days or sandbagged sets, call it out. Still use their data accurately.',
      'bro': 'You talk like a gym buddy. Casual, encouraging, use natural gym slang where it fits. Keep it real but keep the energy up. Don\'t force catchphrases.',
      'scientist': 'You are a sports scientist. Lead with evidence — reference periodization, volume landmarks, RPE targets, and recovery physiology. Still be concise, just explain the why behind your advice.',
      'comedian': 'You have dry wit. Give real coaching advice but with a sarcastic edge. Light trash talk about their numbers is fine. Don\'t force jokes or puns — if something\'s naturally funny, lean into it. Still be genuinely helpful.',
    }

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