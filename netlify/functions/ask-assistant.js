import OpenAI from 'openai'
import { logActivity } from './utils/log-activity.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { message, context, userId } = JSON.parse(event.body)

    // Build user context summary
    const userContext = []
    
    // Profile info
    if (context?.profile) {
      const p = context.profile
      if (p.weight) userContext.push(`Weight: ${p.weight}lbs`)
      if (p.age) userContext.push(`Age: ${p.age}`)
      if (p.activityLevel) userContext.push(`Activity level: ${p.activityLevel}`)
    }
    
    // Recent strength workouts
    const strengthWorkouts = context?.recentWorkouts?.filter(w => w.workoutType !== 'cardio') || []
    if (strengthWorkouts.length) {
      userContext.push(`Recent strength: ${strengthWorkouts.slice(0, 3).map(w => w.name).join(', ')}`)
    }
    
    // Recent cardio
    const cardioWorkouts = context?.recentWorkouts?.filter(w => w.workoutType === 'cardio') || []
    if (cardioWorkouts.length) {
      const cardioSummary = cardioWorkouts.slice(0, 5).map(w => 
        `${w.name || 'Cardio'} (${w.duration}min)`
      ).join(', ')
      userContext.push(`Recent cardio: ${cardioSummary}`)
    }
    
    // Goals
    if (context?.goals?.length) {
      userContext.push(`Goals: ${context.goals.map(g => `${g.lift} ${g.targetWeight || g.targetValue}`).join(', ')}`)
    }
    
    // Health data
    if (context?.health) {
      const h = context.health
      const healthInfo = []
      if (h.avgSleep) healthInfo.push(`${h.avgSleep}hrs sleep avg`)
      if (h.avgProtein) healthInfo.push(`${h.avgProtein}g protein avg`)
      if (healthInfo.length) userContext.push(`Health: ${healthInfo.join(', ')}`)
    }

    const contextString = userContext.length ? `\n\nUser context:\n${userContext.join('\n')}` : ''

    // Check if user is asking for a workout suggestion/generation
    const isWorkoutRequest = /generate|create|make|suggest|give me|plan|recommend/i.test(message) && 
                             /workout|routine|session|exercises|program/i.test(message)

    const systemPrompt = isWorkoutRequest 
      ? `You are a strength training coach for Bench Only. The user wants a workout recommendation.

Generate a workout and respond with BOTH:
1. A brief explanation (2-3 sentences)
2. A JSON workout block in this exact format:

\`\`\`workout
{
  "name": "Workout Name",
  "exercises": [
    {
      "name": "Exercise Name",
      "sets": [
        { "prescribedWeight": 135, "prescribedReps": "8" },
        { "prescribedWeight": 135, "prescribedReps": "8" }
      ]
    }
  ]
}
\`\`\`

Base the workout on their history, goals, and recovery needs. Consider their cardio activity when programming volume. Use appropriate weights based on their recent performance.
${contextString}

${context?.recentWorkouts?.length ? `\nDetailed recent workouts: ${JSON.stringify(strengthWorkouts.slice(0, 3))}` : ''}`
      : `You are a strength training assistant for Bench Only. Be brief and direct - 2-3 sentences max unless asked to elaborate.

You help with: workout programs, exercise form, programming, recovery, nutrition basics, cardio integration, and interpreting training data.

Keep responses short and actionable. Skip fluff. Use numbers when relevant. Consider their full activity picture (strength + cardio) when giving advice. Say "want me to expand?" if there's more to share.
${contextString}`

    const startTime = Date.now()

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: isWorkoutRequest ? 800 : 300
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

    const tokenLog = {
      userId,
      feature: 'ask-assistant',
      model: 'gpt-4o-mini',
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      responseTimeMs: responseTime,
      userMessage: message,
      assistantResponse: cleanMessage,
      createdAt: new Date().toISOString()
    }

    // GPT-4o-mini: $0.15/$0.60 per 1M tokens
    const cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60

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
      body: JSON.stringify({ error: 'Failed to get response' })
    }
  }
}
