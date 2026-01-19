import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { workouts, goals, timeframe, userId } = JSON.parse(event.body)

    const systemPrompt = `You are a strength training analyst. Analyze the user's workout data and provide actionable insights.

Respond with a JSON object:
{
  "summary": "Brief overview of the training period",
  "highlights": ["Key achievements or positive trends"],
  "concerns": ["Areas that need attention"],
  "recommendations": ["Specific actionable suggestions"],
  "progressToGoals": [
    {
      "goal": "Goal description",
      "progress": "Progress percentage or description",
      "projection": "Expected timeline to achieve"
    }
  ],
  "stats": {
    "totalWorkouts": 0,
    "totalVolume": 0,
    "avgWorkoutDuration": 0,
    "consistency": "percentage or description"
  }
}

Focus on:
- Volume trends
- Strength progression
- Consistency/adherence
- Recovery patterns
- Goal trajectory`

    const userPrompt = `Analyze this training data for the past ${timeframe || '30 days'}:

Workouts (${workouts?.length || 0} total):
${workouts?.map(w => `
Date: ${w.date}
Exercises: ${w.exercises?.map(e => 
  `${e.name}: ${e.sets?.map(s => `${s.weight || s.prescribedWeight}x${s.reps || s.prescribedReps}`).join(', ')}`
).join(' | ')}
Duration: ${w.duration || 'N/A'} min
`).join('\n') || 'No workouts'}

Goals:
${goals?.map(g => `${g.lift}: ${g.currentWeight}lbs → ${g.targetWeight}lbs by ${g.targetDate}`).join('\n') || 'No goals set'}

Provide detailed analysis and actionable recommendations.`

    const startTime = Date.now()

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6,
      max_tokens: 2000
    })

    const responseTime = Date.now() - startTime
    const usage = completion.usage

    const tokenLog = {
      userId,
      feature: 'analyze',
      model: 'gpt-4-turbo-preview',
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      responseTimeMs: responseTime,
      createdAt: new Date().toISOString()
    }

    const analysis = JSON.parse(completion.choices[0].message.content)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        analysis,
        usage: tokenLog
      })
    }
  } catch (error) {
    console.error('Analyze progress error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to analyze progress' })
    }
  }
}
