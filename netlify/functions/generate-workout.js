import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { goals, recentWorkouts, preferences, userId } = JSON.parse(event.body)

    const systemPrompt = `You are an expert strength training coach. Generate a detailed workout plan based on the user's goals, recent training history, and preferences.

Format your response as a JSON object with this structure:
{
  "name": "Workout name",
  "description": "Brief description",
  "estimatedDuration": 60,
  "exercises": [
    {
      "name": "Exercise name",
      "sets": [
        { "prescribedReps": 8, "prescribedWeight": 135 }
      ],
      "notes": "Optional form cues or notes",
      "restSeconds": 90
    }
  ],
  "notes": "General workout notes"
}

Consider:
- Progressive overload principles
- Proper exercise selection and order
- Appropriate volume and intensity
- Recovery between sessions
- User's stated goals and preferences`

    const userPrompt = `Generate a workout plan with the following context:

Goals: ${goals?.map(g => `${g.lift}: ${g.currentWeight}lbs → ${g.targetWeight}lbs by ${g.targetDate}`).join(', ') || 'General strength'}

Recent workouts: ${recentWorkouts?.slice(0, 3).map(w => 
  `${w.name} (${w.date}): ${w.exercises?.map(e => e.name).join(', ')}`
).join('\n') || 'None provided'}

Preferences: ${preferences || 'No specific preferences'}

Generate an appropriate workout that progresses from recent training.`

    const startTime = Date.now()
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1500
    })

    const responseTime = Date.now() - startTime
    const usage = completion.usage

    // Log token usage
    const tokenLog = {
      userId,
      feature: 'generate-workout',
      model: 'gpt-4o-mini',
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      responseTimeMs: responseTime,
      createdAt: new Date().toISOString()
    }

    // Parse the workout from the response
    const workout = JSON.parse(completion.choices[0].message.content)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        workout,
        usage: tokenLog
      })
    }
  } catch (error) {
    console.error('Generate workout error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate workout' })
    }
  }
}