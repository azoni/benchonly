import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { message, context, userId } = JSON.parse(event.body)

    // Check if user is asking for a workout suggestion/generation
    const isWorkoutRequest = /generate|create|make|suggest|give me|plan|recommend/i.test(message) && 
                             /workout|routine|session|exercises|program/i.test(message)

    const systemPrompt = isWorkoutRequest 
      ? `You are a strength training coach for BenchPressOnly. The user wants a workout recommendation.

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

Base the workout on their history and goals. Use appropriate weights based on their recent performance.

${context?.recentWorkouts?.length ? `Recent workouts: ${JSON.stringify(context.recentWorkouts.slice(0, 5))}` : 'No recent workout data.'}
${context?.goals?.length ? `Goals: ${JSON.stringify(context.goals)}` : 'No specific goals set.'}`
      : `You are a strength training assistant for BenchPressOnly. Be brief and direct - 2-3 sentences max unless asked to elaborate.

You help with: workout programs, exercise form, programming, recovery, nutrition basics, and interpreting training data.

Keep responses short and actionable. Skip fluff. Use numbers when relevant. Say "want me to expand?" if there's more to share.

${context?.recentWorkouts?.length ? `Recent: ${context.recentWorkouts.slice(0, 3).map(w => w.name).join(', ')}` : ''}
${context?.goals?.length ? `Goals: ${context.goals.map(g => `${g.lift} ${g.targetWeight || g.targetValue}`).join(', ')}` : ''}`

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

    const tokenLog = {
      userId,
      feature: 'ask-assistant',
      model: 'gpt-4o-mini',
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      responseTimeMs: responseTime,
      createdAt: new Date().toISOString()
    }

    // Clean up the message (remove the JSON block for display)
    const cleanMessage = responseText.replace(/```workout[\s\S]*?```/g, '').trim()

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