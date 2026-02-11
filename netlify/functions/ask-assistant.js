import OpenAI from 'openai'
import { verifyAuth, UNAUTHORIZED, CORS_HEADERS, OPTIONS_RESPONSE } from './utils/auth.js';

// Fire-and-forget activity logger (inlined — Netlify bundles each function independently)
function logActivity({ type, title, description, reasoning, model, tokens, cost, metadata }) {
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  if (!secret) return;
  fetch('https://azoni.ai/.netlify/functions/log-agent-activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type, title, description: description || '', reasoning: reasoning || '',
      source: 'benchpressonly', model, tokens, cost, metadata: metadata || {}, secret,
    }),
  }).catch(e => console.error('[activity-log] Failed:', e.message));
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return OPTIONS_RESPONSE;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' }
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  try {
    const { message, context } = JSON.parse(event.body)
    const userId = auth.uid;

    // Build rich user context summary
    const userContext = []
    
    // Profile info
    if (context?.profile) {
      const p = context.profile
      const profileBits = []
      if (p.displayName) profileBits.push(`Name: ${p.displayName}`)
      if (p.weight) profileBits.push(`Weight: ${p.weight}lbs`)
      if (p.height) profileBits.push(`Height: ${p.height}`)
      if (p.age) profileBits.push(`Age: ${p.age}`)
      if (p.activityLevel) profileBits.push(`Activity level: ${p.activityLevel}`)
      if (profileBits.length) userContext.push(profileBits.join(' | '))
    }
    
    // Max lifts (most useful for the AI)
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
        .map(([name, d]) => `${name}: ${d.maxPain}/10 pain (${d.count} occurrences)`)
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
    
    // Recent strength workouts
    const strengthWorkouts = context?.recentWorkouts || []
    if (strengthWorkouts.length) {
      const summary = strengthWorkouts.slice(0, 5).map(w => {
        const exNames = w.exercises?.map(e => e.name).join(', ') || ''
        return `${w.date}: ${w.name}${exNames ? ` [${exNames}]` : ''}`
      }).join('\n')
      userContext.push(`RECENT WORKOUTS:\n${summary}`)
    }
    
    // Recent cardio
    const cardioWorkouts = context?.cardioWorkouts || context?.recentWorkouts?.filter(w => w.workoutType === 'cardio') || []
    if (cardioWorkouts.length) {
      const cardioSummary = cardioWorkouts.slice(0, 5).map(w => 
        `${w.date}: ${w.name || w.cardioType || 'Cardio'} (${w.duration}min${w.distance ? `, ${w.distance}mi` : ''}${w.calories ? `, ${w.calories}cal` : ''})`
      ).join('\n')
      userContext.push(`RECENT CARDIO:\n${cardioSummary}`)
    }
    
    // Goals
    if (context?.goals?.length) {
      const goalsSummary = context.goals.map(g => {
        const current = g.currentWeight || g.currentValue || '?'
        const target = g.targetWeight || g.targetValue || '?'
        return `${g.lift || g.metricType}: ${current} → ${target}${g.targetDate ? ` by ${g.targetDate}` : ''}`
      }).join('\n')
      userContext.push(`ACTIVE GOALS:\n${goalsSummary}`)
    }
    
    // Health data
    if (context?.health && Object.keys(context.health).length > 0) {
      const h = context.health
      const healthInfo = []
      if (h.recentWeight) healthInfo.push(`Current weight: ${h.recentWeight}lbs`)
      if (h.avgSleep) healthInfo.push(`Avg sleep: ${h.avgSleep}hrs`)
      if (h.avgProtein) healthInfo.push(`Avg protein: ${h.avgProtein}g`)
      if (h.avgCalories) healthInfo.push(`Avg calories: ${h.avgCalories}`)
      if (healthInfo.length) userContext.push(`HEALTH METRICS:\n${healthInfo.join('\n')}`)
    }
    
    // Scheduled activities
    if (context?.schedules?.length) {
      const schedSummary = context.schedules.map(s => 
        `${s.name}${s.days ? ` (${Array.isArray(s.days) ? s.days.join(', ') : s.days})` : ''}${s.duration ? ` ${s.duration}min` : ''}`
      ).join(', ')
      userContext.push(`SCHEDULED ACTIVITIES: ${schedSummary}`)
    }
    
    // Recurring activities
    if (context?.recurringActivities?.length) {
      const recurSummary = context.recurringActivities.map(r => 
        `${r.name} (${r.type || 'activity'}${r.days ? `, ${Array.isArray(r.days) ? r.days.join(', ') : r.days}` : ''})`
      ).join(', ')
      userContext.push(`RECURRING HABITS: ${recurSummary}`)
    }

    const contextString = userContext.length ? `\n\nUser data:\n${userContext.join('\n\n')}` : ''

    // Check if user is asking for a workout suggestion/generation
    const isWorkoutRequest = /generate|create|make|suggest|give me|plan|recommend/i.test(message) && 
                             /workout|routine|session|exercises|program/i.test(message)

    const systemPrompt = isWorkoutRequest 
      ? `You are a knowledgeable strength training coach. You have full access to the user's training data.

Generate a workout and respond with BOTH:
1. A brief explanation (2-3 sentences) referencing their specific data
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
${contextString}

${context?.recentWorkouts?.length ? `\nRecent workout details: ${JSON.stringify((context.recentWorkouts || []).slice(0, 2).map(w => ({ name: w.name, date: w.date, exercises: w.exercises?.slice(0, 4) })))}` : ''}`
      : `You are a strength training assistant with access to the user's training data. Answer using their real numbers. Be direct — 2-3 sentences unless asked for detail.
${contextString}`

    const startTime = Date.now()

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: isWorkoutRequest ? 1200 : 400
    })

    const responseTime = Date.now() - startTime
    const usage = completion.usage
    const responseText = completion.choices[0].message.content

    // Parse workout from response if present
    let workout = null
    const workoutMatch = responseText.match(/```workout\s*([\s\S]*?)\s*```/)
    if (workoutMatch) {
      try {
        workout = JSON.parse(workoutMatch[1])
      } catch (e) {
        console.error('Failed to parse workout JSON:', e)
      }
    }

    // Clean up the message (remove the JSON block for display)
    const cleanMessage = responseText.replace(/```workout[\s\S]*?```/g, '').trim()

    // GPT-4o-mini: $0.15/$0.60 per 1M tokens
    const cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60

    const tokenLog = {
      userId,
      feature: 'ask-assistant',
      model: 'gpt-4o-mini',
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      estimatedCost: cost,
      responseTimeMs: responseTime,
      createdAt: new Date().toISOString()
    }

    // Log to portfolio activity feed
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: cleanMessage,
        workout,
        usage: tokenLog
      })
    }
  } catch (error) {
    console.error('Ask assistant error:', error)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to get response', detail: error.message })
    }
  }
}
