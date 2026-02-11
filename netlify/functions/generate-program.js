import OpenAI from 'openai'

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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const {
      userId,
      goal,           // { lift, current, target }
      weeks,          // number of weeks (4-12)
      trainingDays,   // ['monday', 'wednesday', 'friday']
      prompt,         // optional user instructions
      context,        // { maxLifts, painHistory, rpeAverages, recentWorkouts }
      model,          // 'standard' or 'premium'
    } = JSON.parse(event.body)

    if (!userId || !goal?.lift || !goal?.current || !goal?.target || !trainingDays?.length) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing required fields: goal (lift, current, target) and trainingDays' }),
      }
    }

    const numWeeks = Math.min(Math.max(weeks || 6, 3), 12)
    const daysPerWeek = trainingDays.length
    const selectedModel = model === 'premium' ? 'gpt-4o' : 'gpt-4o-mini'

    // Build context
    const contextParts = []
    
    if (context?.maxLifts && Object.keys(context.maxLifts).length > 0) {
      const lifts = Object.entries(context.maxLifts)
        .sort((a, b) => b[1].e1rm - a[1].e1rm)
        .slice(0, 8)
        .map(([name, d]) => `${name}: ${d.e1rm}lb e1RM`)
      contextParts.push(`Current maxes: ${lifts.join(', ')}`)
    }
    
    if (context?.painHistory && Object.keys(context.painHistory).length > 0) {
      const pains = Object.entries(context.painHistory)
        .map(([name, d]) => `${name}: ${d.maxPain}/10 pain`)
      contextParts.push(`Pain history: ${pains.join(', ')}`)
    }

    if (context?.rpeAverages && Object.keys(context.rpeAverages).length > 0) {
      const rpes = Object.entries(context.rpeAverages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, avg]) => `${name}: RPE ${avg}`)
      contextParts.push(`RPE averages: ${rpes.join(', ')}`)
    }

    const contextStr = contextParts.length ? `\n\nATHLETE DATA:\n${contextParts.join('\n')}` : ''

    const systemPrompt = `You are an expert strength coach designing a ${numWeeks}-week training program.

GOAL: Increase ${goal.lift} from ${goal.current}lb to ${goal.target}lb in ${numWeeks} weeks.
TRAINING DAYS: ${trainingDays.join(', ')} (${daysPerWeek} days/week)
${prompt ? `ATHLETE NOTES: ${prompt}` : ''}
${contextStr}

Design a periodized program. Respond ONLY with valid JSON matching this exact structure:

{
  "name": "Program Name (short, descriptive)",
  "phases": [
    {
      "name": "Phase Name",
      "weekStart": 1,
      "weekEnd": 3,
      "focus": "Brief description of phase goals"
    }
  ],
  "weeks": [
    {
      "weekNumber": 1,
      "phase": "Phase Name",
      "days": [
        {
          "dayOfWeek": "monday",
          "label": "Heavy ${goal.lift}",
          "type": "primary",
          "intensity": "75%",
          "primaryLift": "${goal.lift}",
          "primaryScheme": "4x6",
          "accessories": ["Close Grip Bench 3x8", "Tricep Dips 3x10"],
          "notes": "Focus on bar speed. RPE 7-8."
        }
      ]
    }
  ]
}

RULES:
- Each week MUST have exactly ${daysPerWeek} days matching ${JSON.stringify(trainingDays)}
- Include proper periodization: accumulation → intensification → peak/test
- Include at least one deload week (reduce volume 40-50%)
- Intensity percentages are based on their CURRENT ${goal.lift} max of ${goal.current}lb
- The "primaryScheme" is the main compound set/rep scheme (e.g. "5x5", "4x3", "3x1")
- "accessories" are 2-4 short strings listing supplemental exercises with set/rep
- Avoid exercises where athlete has reported pain
- Be specific with percentages — they should progress week to week
- The final week should include a test day
- Day "type" must be one of: "primary", "volume", "speed", "accessories", "deload", "test"
- RESPOND WITH ONLY THE JSON, NO MARKDOWN FENCES, NO EXPLANATION`

    const startTime = Date.now()

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Create the ${numWeeks}-week program now.` }
      ],
      temperature: 0.7,
      max_tokens: 4000,
    })

    const responseTime = Date.now() - startTime
    const usage = completion.usage
    const responseText = completion.choices[0].message.content

    // Parse JSON — strip markdown fences if present
    const cleanJson = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    let program
    try {
      program = JSON.parse(cleanJson)
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, '\nRaw:', responseText.slice(0, 500))
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'AI returned invalid program format. Try again.' }),
      }
    }

    // Validate structure
    if (!program.weeks || !Array.isArray(program.weeks) || program.weeks.length === 0) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'AI returned program without weeks. Try again.' }),
      }
    }

    // Ensure all weeks have correct number of days
    for (const week of program.weeks) {
      if (!week.days || week.days.length !== daysPerWeek) {
        // Attempt to pad or trim
        if (!week.days) week.days = []
        while (week.days.length < daysPerWeek) {
          week.days.push({
            dayOfWeek: trainingDays[week.days.length],
            label: 'Training Day',
            type: 'accessories',
            intensity: '65%',
            primaryLift: goal.lift,
            primaryScheme: '3x8',
            accessories: ['Accessory work'],
            notes: 'Light day',
          })
        }
        week.days = week.days.slice(0, daysPerWeek)
      }
    }

    // Calculate cost
    let cost
    if (selectedModel === 'gpt-4o') {
      cost = (usage.prompt_tokens / 1e6) * 2.50 + (usage.completion_tokens / 1e6) * 10.00
    } else {
      cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60
    }

    logActivity({
      type: 'program_generated',
      title: `Program: ${program.name || goal.lift + ' Program'}`,
      description: `${numWeeks} weeks, ${daysPerWeek}x/week. ${goal.current}→${goal.target}lb ${goal.lift}`,
      model: selectedModel,
      tokens: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
      cost,
    })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        program,
        usage: {
          model: selectedModel,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          estimatedCost: cost,
          responseMs: responseTime,
        },
      }),
    }
  } catch (error) {
    console.error('Program generation error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message || 'Failed to generate program' }),
    }
  }
}
