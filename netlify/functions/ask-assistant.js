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

    const systemPrompt = `You are a knowledgeable and supportive strength training assistant for the BENCH ONLY app. You help users with:

- Understanding their workout programs and progress
- Exercise form and technique questions
- Programming and periodization advice
- Recovery and nutrition basics
- Motivation and goal setting
- Interpreting their training data

You have access to the user's workout history and goals. Be concise, practical, and encouraging. Use specific numbers and data when available. If you're unsure about something, say so.

User Context:
${context?.recentWorkouts ? `Recent workouts: ${JSON.stringify(context.recentWorkouts.slice(0, 5))}` : 'No recent workouts'}
${context?.goals ? `Goals: ${JSON.stringify(context.goals)}` : 'No goals set'}
${context?.stats ? `Stats: ${JSON.stringify(context.stats)}` : ''}`

    const startTime = Date.now()

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 1000
    })

    const responseTime = Date.now() - startTime
    const usage = completion.usage

    const tokenLog = {
      userId,
      feature: 'ask-assistant',
      model: 'gpt-4-turbo-preview',
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      responseTimeMs: responseTime,
      createdAt: new Date().toISOString()
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: completion.choices[0].message.content,
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