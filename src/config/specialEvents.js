/**
 * Special Events System
 * 
 * Add new events to SPECIAL_EVENTS array. Each event has:
 * - id: unique identifier
 * - name: display name
 * - description: shown in modal/card
 * - emoji: displayed alongside name
 * - startDate / endDate: ISO strings (endDate is exclusive — event ends at midnight)
 * - badgeIcon: emoji for profile badge
 * - badgeName: tooltip text for badge
 * - creditReward: credits awarded on completion
 * - buildWorkout(userContext): returns a workout object scaled to the user
 */

export const SPECIAL_EVENTS = [
    {
      id: 'valentines-2026',
      name: "Valentine's Day Challenge",
      description: "A quick bodyweight workout you can do anywhere — no equipment needed. Scaled to your fitness level.",
      emoji: '❤️',
      startDate: '2026-02-14',
      endDate: '2026-02-17',  // ends midnight Monday
      badgeIcon: '❤️',
      badgeName: "Valentine's Day 2026 — Completed the Valentine's Challenge",
      creditReward: 200,
      dateLabel: 'Feb 14–16',
      theme: {
        bg: 'bg-pink-500/10',
        border: 'border-pink-500/25',
        accent: 'text-pink-400',
        buttonBg: 'bg-pink-500',
        buttonHover: 'hover:bg-pink-600',
      },
      buildWorkout(userContext) {
        // Scale based on user's fitness level
        const maxLifts = userContext?.maxLifts || {}
        const hasData = Object.keys(maxLifts).length > 0
        
        // Determine fitness tier from any data we have
        let tier = 'beginner' // beginner, intermediate, advanced
        if (hasData) {
          const benchMax = maxLifts['Bench Press']?.weight || maxLifts['Dumbbell Bench Press']?.weight || 0
          const anyMax = Math.max(...Object.values(maxLifts).map(m => m.weight || 0), 0)
          if (anyMax > 225 || benchMax > 185) tier = 'advanced'
          else if (anyMax > 135 || benchMax > 95) tier = 'intermediate'
        }
  
        const scale = {
          beginner: { pushups: 8, squats: 12, lunges: 8, burpees: 4, plank: 30, mountainClimbers: 12 },
          intermediate: { pushups: 15, squats: 20, lunges: 12, burpees: 8, plank: 45, mountainClimbers: 20 },
          advanced: { pushups: 25, squats: 30, lunges: 16, burpees: 12, plank: 60, mountainClimbers: 30 },
        }[tier]
  
        return {
          name: "Valentine's Day Challenge ❤️",
          notes: `Happy Valentine's Day! A quick bodyweight circuit — 3 rounds, no equipment needed. Scaled for your level (${tier}). Rest 30–60s between rounds.`,
          eventId: 'valentines-2026',
          workoutType: 'strength',
          exercises: [
            {
              id: 'ex-1',
              name: 'Push-ups',
              type: 'bodyweight',
              notes: 'Hands shoulder-width apart, body in a straight line from head to heels. Lower until chest nearly touches the floor, then push back up. Keep core tight throughout. Too hard? Do knee push-ups or incline push-ups with hands on a chair/counter.',
              sets: [1, 2, 3].map((n, i) => ({
                id: `set-1-${i}`,
                prescribedReps: String(scale.pushups),
                actualWeight: '',
                actualReps: '',
                rpe: '',
                painLevel: 0,
                completed: false,
              })),
            },
            {
              id: 'ex-2',
              name: 'Bodyweight Squats',
              type: 'bodyweight',
              notes: 'Feet shoulder-width apart, toes slightly out. Sit back and down like sitting into a chair — hips below parallel if possible. Drive through your heels to stand. Too hard? Squat to a chair (sit down lightly, then stand back up) or do half squats.',
              sets: [1, 2, 3].map((n, i) => ({
                id: `set-2-${i}`,
                prescribedReps: String(scale.squats),
                actualWeight: '',
                actualReps: '',
                rpe: '',
                painLevel: 0,
                completed: false,
              })),
            },
            {
              id: 'ex-3',
              name: 'Alternating Lunges',
              type: 'bodyweight',
              notes: 'Step forward with one leg, lower until both knees are at ~90°. Front knee stays over the ankle, not past your toes. Push back to standing and alternate legs. Too hard? Do reverse lunges (step backward instead) or hold onto a wall for balance.',
              sets: [1, 2, 3].map((n, i) => ({
                id: `set-3-${i}`,
                prescribedReps: `${scale.lunges} total`,
                actualWeight: '',
                actualReps: '',
                rpe: '',
                painLevel: 0,
                completed: false,
              })),
            },
            {
              id: 'ex-4',
              name: 'Burpees',
              type: 'bodyweight',
              notes: 'From standing: squat down, place hands on the floor, jump feet back into a plank, do a push-up, jump feet forward, then jump up with hands overhead. That\'s one rep. Too hard? Skip the push-up and/or the jump — just step feet back and forward instead.',
              sets: [1, 2, 3].map((n, i) => ({
                id: `set-4-${i}`,
                prescribedReps: String(scale.burpees),
                actualWeight: '',
                actualReps: '',
                rpe: '',
                painLevel: 0,
                completed: false,
              })),
            },
            {
              id: 'ex-5',
              name: 'Mountain Climbers',
              type: 'bodyweight',
              notes: 'Start in a high plank position. Drive one knee toward your chest, then quickly switch legs — like running in place horizontally. Keep hips level and core braced. Too hard? Slow it down — step feet in one at a time instead of jumping.',
              sets: [1, 2, 3].map((n, i) => ({
                id: `set-5-${i}`,
                prescribedReps: `${scale.mountainClimbers} total`,
                actualWeight: '',
                actualReps: '',
                rpe: '',
                painLevel: 0,
                completed: false,
              })),
            },
            {
              id: 'ex-6',
              name: 'Plank',
              type: 'time',
              notes: `Hold for ${scale.plank} seconds per round. Forearms on the ground, elbows under shoulders, body in a straight line. Squeeze your glutes and brace your abs — don't let your hips sag or pike up. Too hard? Drop to your knees or do the plank from your hands instead of forearms.`,
              sets: [1, 2, 3].map((n, i) => ({
                id: `set-6-${i}`,
                prescribedTime: String(scale.plank),
                actualTime: '',
                rpe: '',
                painLevel: 0,
                completed: false,
              })),
            },
          ],
        }
      },
    },
  ]
  
  /**
   * Get the currently active event (if any)
   */
  export function getActiveEvent() {
    const now = new Date()
    return SPECIAL_EVENTS.find(event => {
      const start = new Date(event.startDate + 'T00:00:00')
      const end = new Date(event.endDate + 'T00:00:00')
      return now >= start && now < end
    }) || null
  }
  
  /**
   * Check if a workout belongs to a special event
   */
  export function getEventForWorkout(workout) {
    if (!workout?.eventId) return null
    return SPECIAL_EVENTS.find(e => e.id === workout.eventId) || null
  }
  
  /**
   * Check if a feed item belongs to a special event
   */
  export function getEventForFeedItem(item) {
    if (!item?.data?.eventId) return null
    return SPECIAL_EVENTS.find(e => e.id === item.data.eventId) || null
  }