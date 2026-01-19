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

    const systemPrompt = `You are a strength training assistant for BENCH ONLY. Be brief and direct - 2-3 sentences max unless asked to elaborate.

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
      max_tokens: 300
    })

    const responseTime = Date.now() - startTime
    const usage = completion.usage

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