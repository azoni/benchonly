/**
 * Shared prompt-building utilities for ask-assistant and ask-assistant-stream.
 */

/**
 * Build the full user context string from the context object.
 */
export function buildContextString(context) {
  const userContext = []

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

  if (context?.maxLifts && Object.keys(context.maxLifts).length > 0) {
    const lifts = Object.entries(context.maxLifts)
      .sort((a, b) => b[1].e1rm - a[1].e1rm)
      .slice(0, 8)
      .map(([name, d]) => `${name}: ${d.e1rm}lb e1RM (${d.weight}x${d.reps})`)
    userContext.push(`MAX LIFTS:\n${lifts.join('\n')}`)
  }

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

  if (context?.rpeAverages && Object.keys(context.rpeAverages).length > 0) {
    const rpes = Object.entries(context.rpeAverages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, avg]) => `${name}: avg RPE ${avg}`)
    userContext.push(`RPE AVERAGES:\n${rpes.join('\n')}`)
  }

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

  if (context?.recentWorkouts?.length) {
    const summary = context.recentWorkouts.slice(0, 5).map(w => {
      const exNames = w.exercises?.map(e => e.name).join(', ') || ''
      return `${w.date}: ${w.name}${exNames ? ` [${exNames}]` : ''}`
    }).join('\n')
    userContext.push(`OLDER WORKOUTS (SUMMARY):\n${summary}`)
  }

  if (context?.cardioWorkouts?.length) {
    const cardioSummary = context.cardioWorkouts.slice(0, 5).map(w =>
      `${w.date}: ${w.name || w.cardioType || 'Cardio'} (${w.duration}min${w.distance ? `, ${w.distance}mi` : ''}${w.calories ? `, ${w.calories}cal` : ''})`
    ).join('\n')
    userContext.push(`RECENT CARDIO:\n${cardioSummary}`)
  }

  if (context?.goals?.length) {
    const goalsSummary = context.goals.map(g => {
      const current = g.currentWeight || g.currentValue || '?'
      const target = g.targetWeight || g.targetValue || '?'
      return `${g.lift || g.metricType}: ${current} -> ${target}${g.targetDate ? ` by ${g.targetDate}` : ''}`
    }).join('\n')
    userContext.push(`ACTIVE GOALS:\n${goalsSummary}`)
  }

  if (context?.health && Object.keys(context.health).length > 0) {
    const h = context.health
    const info = []
    if (h.recentWeight) info.push(`Current weight: ${h.recentWeight}lbs`)
    if (h.avgSleep) info.push(`Avg sleep: ${h.avgSleep}hrs`)
    if (h.avgProtein) info.push(`Avg protein: ${h.avgProtein}g`)
    if (h.avgCalories) info.push(`Avg calories: ${h.avgCalories}`)
    if (info.length) userContext.push(`HEALTH METRICS:\n${info.join('\n')}`)
  }

  if (context?.ouraData) {
    const { latest, averages } = context.ouraData
    const info = []
    if (latest?.readiness?.score) info.push(`Today readiness: ${latest.readiness.score}/100`)
    if (latest?.sleep?.score) info.push(`Last sleep: ${latest.sleep.score}/100`)
    if (latest?.activity?.score) info.push(`Activity score: ${latest.activity.score}/100`)
    if (averages?.readinessScore) info.push(`7-day avg readiness: ${averages.readinessScore}`)
    if (info.length) userContext.push(`OURA RING:\n${info.join('\n')}`)
  }

  if (context?.schedules?.length) {
    const s = context.schedules.map(s =>
      `${s.name}${s.days ? ` (${Array.isArray(s.days) ? s.days.join(', ') : s.days})` : ''}${s.duration ? ` ${s.duration}min` : ''}`
    ).join(', ')
    userContext.push(`SCHEDULED ACTIVITIES: ${s}`)
  }

  if (context?.recurringActivities?.length) {
    const r = context.recurringActivities.map(r =>
      `${r.name} (${r.type || 'activity'}${r.days ? `, ${Array.isArray(r.days) ? r.days.join(', ') : r.days}` : ''})`
    ).join(', ')
    userContext.push(`RECURRING HABITS: ${r}`)
  }

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

  if (context?.adminNotes) {
    userContext.push(`TRAINER NOTES:\n${context.adminNotes}`)
  }

  return userContext.length ? `\n\nUser data:\n${userContext.join('\n\n')}` : ''
}

export const PERSONALITY_PROMPTS = {
  'coach': 'You are a direct, knowledgeable strength coach. Warm but professional. Keep advice clear and actionable.',
  'drill-sergeant': 'You are a tough-love coach. Blunt, no sugar-coating, hold them accountable. Short sentences. If they skipped days or sandbagged sets, call it out. Still use their data accurately.',
  'bro': 'You talk like a gym buddy. Casual, encouraging, use natural gym slang where it fits. Keep it real but keep the energy up. Don\'t force catchphrases.',
  'scientist': 'You are a sports scientist. Lead with evidence — reference periodization, volume landmarks, RPE targets, and recovery physiology. Still be concise, just explain the why behind your advice.',
  'comedian': 'You have dry wit. Give real coaching advice but with a sarcastic edge. Light trash talk about their numbers is fine. Don\'t force jokes or puns — if something\'s naturally funny, lean into it. Still be genuinely helpful.',
}

/**
 * Build the system prompt for regular chat or workout generation.
 */
export function buildSystemPrompt(message, context, personality) {
  const contextString = buildContextString(context)
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const personalityPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS['coach']

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

  return { systemPrompt, isWorkoutRequest }
}
