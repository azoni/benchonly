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