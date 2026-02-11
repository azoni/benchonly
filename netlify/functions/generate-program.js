import OpenAI from 'openai'
import { verifyAuth, UNAUTHORIZED, CORS_HEADERS, OPTIONS_RESPONSE } from './utils/auth.js';

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
  if (event.httpMethod === 'OPTIONS') return OPTIONS_RESPONSE;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  try {
    const {
      goal,             // { lifts: [], current, target, type }
      weeks,            // number of weeks (4-12)
      trainingDays,     // ['monday', 'wednesday', 'friday']
      workoutDuration,  // minutes (20, 30, 45, 60, 90)
      programType,      // 'strength' | 'bodyweight' | 'mixed'
      prompt,           // optional user instructions
      context,          // { maxLifts, painHistory, rpeAverages }
      model,            // 'standard' or 'premium'
    } = JSON.parse(event.body)
    const userId = auth.uid;

    if (!trainingDays?.length) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: 'Missing required fields: trainingDays' }),
      }
    }

    const numWeeks = Math.min(Math.max(weeks || 6, 3), 12)
    const daysPerWeek = trainingDays.length
    const duration = workoutDuration || 45
    const type = programType || 'strength'
    const selectedModel = model === 'premium' ? 'gpt-4o' : 'gpt-4o-mini'

    // Normalize goal — support both old {lift} and new {lifts[]} format
    const lifts = goal?.lifts?.length > 0 ? goal.lifts : (goal?.lift ? [goal.lift] : [])
    const primaryLift = lifts[0] || (type === 'bodyweight' ? 'Pull-ups' : 'Bench Press')
    const currentLevel = goal?.current || null
    const targetLevel = goal?.target || null

    // Build context from athlete data
    const contextParts = []
    
    if (context?.maxLifts && Object.keys(context.maxLifts).length > 0) {
      const liftData = Object.entries(context.maxLifts)
        .sort((a, b) => b[1].e1rm - a[1].e1rm)
        .slice(0, 10)
        .map(([name, d]) => `${name}: ${d.e1rm}lb e1RM (${d.weight}lb × ${d.reps})`)
      contextParts.push(`Current strength levels:\n${liftData.join('\n')}`)
    }
    
    if (context?.painHistory && Object.keys(context.painHistory).length > 0) {
      const pains = Object.entries(context.painHistory)
        .map(([name, d]) => {
          let status
          if (d.recentCount > 0) {
            status = `ACTIVE — last reported ${d.lastDaysAgo}d ago, ${d.recentCount} in last 30d`
          } else if (d.lastDaysAgo !== null && d.lastDaysAgo > 60) {
            status = `RECOVERING — last reported ${d.lastDaysAgo}d ago, none recently. Consider cautious reintroduction.`
          } else if (d.lastDaysAgo !== null) {
            status = `FADING — last reported ${d.lastDaysAgo}d ago, none in last 30d`
          } else {
            status = `${d.count} total occurrences`
          }
          return `${name}: ${d.maxPain}/10 peak pain — ${status}`
        })
      contextParts.push(`⚠️ Pain history:\n${pains.join('\n')}

PAIN GUIDELINES:
- ACTIVE pain (reported in last 30 days): AVOID this exercise. Substitute a similar movement pattern that doesn't aggravate it.
- FADING pain (31-60 days ago, no recent reports): Include cautiously at REDUCED intensity/volume. Add a note like "Stop if any discomfort."
- RECOVERING pain (60+ days, no recent reports): OK to program normally, but note it in coaching cues. Athlete may have moved past this.`)
    }

    if (context?.rpeAverages && Object.keys(context.rpeAverages).length > 0) {
      const rpes = Object.entries(context.rpeAverages)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, avg]) => `${name}: avg RPE ${avg}`)
      contextParts.push(`RPE history: ${rpes.join(', ')}`)
    }

    const contextStr = contextParts.length ? `\n\nATHLETE DATA:\n${contextParts.join('\n\n')}` : ''

    // Build goal description
    let goalDescription
    const liftScheduleHint = lifts.length > 1
      ? `\nIMPORTANT: You have ${lifts.length} focus lifts. Rotate them as primary lifts across training days each week. ${
          daysPerWeek >= lifts.length 
            ? `Each lift should appear as the primary lift at least once per week.`
            : `Alternate which lift is primary each week since there are fewer days than lifts.`
        }`
      : ''

    if (type === 'bodyweight') {
      goalDescription = lifts.length > 0
        ? `Focus exercises: ${lifts.join(', ')}`
        : 'General bodyweight/calisthenics progression'
      if (currentLevel) goalDescription += `\nCurrent level: ${currentLevel}`
      if (targetLevel) goalDescription += `\nTarget: ${targetLevel}`
    } else if (type === 'mixed') {
      goalDescription = lifts.length > 0
        ? `Focus on: ${lifts.join(', ')} (mix of barbell and bodyweight)`
        : 'Mixed strength and bodyweight training'
      if (currentLevel) goalDescription += `\nCurrent max (barbell lifts): ${currentLevel}lb`
      if (targetLevel) goalDescription += `\nTarget (barbell lifts): ${targetLevel}lb`
    } else {
      goalDescription = lifts.length > 0
        ? `Primary lifts: ${lifts.join(', ')}`
        : 'General strength training'
      if (currentLevel) goalDescription += `\nCurrent max: ${currentLevel}lb`
      if (targetLevel) goalDescription += `\nTarget: ${targetLevel}lb`
    }
    goalDescription += liftScheduleHint

    // Build example days showing rotation
    let exampleDays
    if (lifts.length > 1 && daysPerWeek > 1) {
      const examples = lifts.slice(0, Math.min(daysPerWeek, 3)).map((lift, i) => {
        const dayOfWeek = trainingDays[i] || trainingDays[0]
        const isBodyweight = ['Pull-ups', 'Push-ups', 'Dips', 'Plank', 'Handstand Hold', 'Muscle-ups', 'L-sit', 'Pistol Squats'].includes(lift)
        return `{
          "dayOfWeek": "${dayOfWeek}",
          "label": "${isBodyweight ? lift + ' Focus' : 'Heavy ' + lift}",
          "type": "primary",
          "intensity": "${isBodyweight ? 'hard' : '75%'}",
          "primaryLift": "${lift}",
          "primaryScheme": "${isBodyweight ? '5x5' : '4x6'}",
          "accessories": ["${isBodyweight ? 'Accessory 3x10' : 'Close variation 3x8'}", "Supporting movement 3x10"],
          "notes": "Focus on ${lift}. Accessories should support this lift."
        }`
      })
      exampleDays = examples.join(',\n        ')
    } else if (type === 'bodyweight') {
      exampleDays = `{
          "dayOfWeek": "${trainingDays[0]}",
          "label": "Upper Body Pull",
          "type": "primary",
          "intensity": "moderate",
          "primaryLift": "${primaryLift}",
          "primaryScheme": "5x5",
          "accessories": ["Inverted Rows 3x10", "Dead Hangs 3x30s", "Band Pull-Aparts 3x15"],
          "notes": "Focus on full ROM. Scale with bands if needed."
        }`
    } else {
      exampleDays = `{
          "dayOfWeek": "${trainingDays[0]}",
          "label": "Heavy ${primaryLift}",
          "type": "primary",
          "intensity": "75%",
          "primaryLift": "${primaryLift}",
          "primaryScheme": "4x6",
          "accessories": ["Close Grip Bench 3x8", "Tricep Dips 3x10"],
          "notes": "Focus on bar speed. RPE 7-8."
        }`
    }

    const systemPrompt = `You are an expert ${type === 'bodyweight' ? 'calisthenics and bodyweight' : type === 'mixed' ? 'strength and calisthenics' : 'strength'} coach designing a ${numWeeks}-week training program.

PROGRAM TYPE: ${type}
GOAL: ${goalDescription}
TRAINING DAYS: ${trainingDays.join(', ')} (${daysPerWeek} days/week)
WORKOUT DURATION: ${duration} minutes per session — this is CRITICAL. Every workout must be completable within ~${duration} minutes including warm-up. ${duration <= 30 ? 'Keep it focused: 1 main movement + 1-2 accessories max.' : duration <= 45 ? 'Moderate volume: main compound + 2-3 accessories.' : 'Full session: main compound + 3-4 accessories with adequate rest.'}
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
        ${exampleDays}
      ]
    }
  ]
}

CRITICAL RULES:
- Each week MUST have exactly ${daysPerWeek} days matching ${JSON.stringify(trainingDays)}
${lifts.length > 1 ? `- LIFT ROTATION: The athlete selected ${lifts.length} focus lifts (${lifts.join(', ')}). Each training day should have a DIFFERENT primaryLift. Rotate through all of them across the week. Every focus lift must appear as primaryLift regularly.` : ''}
- WEEKLY VARIATION: Each week MUST be different from the previous week. Change at least one of: intensity, rep scheme, volume, or accessories. DO NOT copy-paste weeks.
- PROGRESSIVE OVERLOAD: Intensity and/or volume must increase week to week within each phase.
- Include proper periodization: accumulation → intensification → peak/test
- Include at least one deload week (reduce volume 40-50%)
${type === 'strength' && currentLevel ? `- Intensity percentages are based on the athlete's CURRENT max of ${currentLevel}lb` : ''}
${type === 'bodyweight' ? `- For bodyweight exercises, "intensity" should be descriptive (e.g. "moderate", "hard", "max effort", "submaximal")
- "primaryScheme" should use reps for strength moves (e.g. "5x5") and time for holds (e.g. "5x30s", "3x45s")
- Suggest progressions: add reps, add sets, slow tempo, add weight vest, harder variations` : ''}
${type === 'mixed' ? '- Balance barbell/dumbbell work with bodyweight movements across the week\n- Use percentage-based intensity for weighted exercises, descriptive for bodyweight' : ''}
- "accessories" should DIRECTLY support the primaryLift. E.g. bench day accessories: close-grip bench, tricep work, dumbbell press — NOT squats or deadlifts.
- Accessories should also vary week to week — don't use the exact same list every week.
- CRITICAL: Every session must fit within ${duration} minutes. Scale volume accordingly.
- Follow the PAIN GUIDELINES above if pain history is provided — use the ACTIVE/FADING/RECOVERING categories to decide whether to avoid, modify, or cautiously include exercises
- The final week should include a test/assessment day
- Day "type" must be one of: "primary", "volume", "speed", "accessories", "deload", "test"
- RESPOND WITH ONLY THE JSON, NO MARKDOWN FENCES, NO EXPLANATION`

    const startTime = Date.now()

    // Scale max_tokens to program size
    const estimatedTokensPerWeek = daysPerWeek * 200
    const neededTokens = Math.min(Math.max(numWeeks * estimatedTokensPerWeek + 500, 4000), 12000)

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Create the ${numWeeks}-week ${type} program now. Remember: each week must be DIFFERENT with progressive overload.${lifts.length > 1 ? ` Rotate through ${lifts.join(', ')} as primary lifts.` : ''}` }
      ],
      temperature: 0.7,
      max_tokens: neededTokens,
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
        if (!week.days) week.days = []
        while (week.days.length < daysPerWeek) {
          week.days.push({
            dayOfWeek: trainingDays[week.days.length],
            label: 'Training Day',
            type: 'accessories',
            intensity: type === 'bodyweight' ? 'moderate' : '65%',
            primaryLift: primaryLift,
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

    const goalSummary = lifts.length > 0 ? lifts.join(', ') : type
    logActivity({
      type: 'program_generated',
      title: `Program: ${program.name || goalSummary + ' Program'}`,
      description: `${numWeeks} weeks, ${daysPerWeek}x/week, ${duration}min sessions. ${type} program. ${currentLevel ? currentLevel + '→' + targetLevel : 'No targets set.'}`,
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
