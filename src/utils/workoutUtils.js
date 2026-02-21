/**
 * Normalize rep range input to standard format
 * Accepts: "6-8", "6 8", "6  8", "6 - 8", "6"
 * Returns: "6-8" or "6"
 */
export function normalizeRepRange(input) {
  if (!input) return ''
  
  const str = String(input).trim()
  
  // Already a single number
  if (/^\d+$/.test(str)) return str
  
  // Match patterns like "6-8", "6 8", "6 - 8", "6  8"
  const match = str.match(/^(\d+)\s*[-\s]\s*(\d+)$/)
  if (match) {
    const [, min, max] = match
    // If both numbers are same, return single number
    if (min === max) return min
    return `${min}-${max}`
  }
  
  // Return original if no pattern matches
  return str
}

/**
 * Format rep range for display
 * Same as normalize but ensures consistent display
 */
export function formatRepRange(input) {
  return normalizeRepRange(input)
}

/**
 * Check if a rep value is a range
 */
export function isRepRange(input) {
  if (!input) return false
  return String(input).includes('-') || /^\d+\s+\d+$/.test(String(input))
}

/**
 * Get the minimum reps from a range (for calculations)
 */
export function getMinReps(input) {
  if (!input) return 0
  const str = String(input).trim()
  const match = str.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Get the maximum reps from a range (for calculations)
 */
export function getMaxReps(input) {
  if (!input) return 0
  const str = String(input).trim()
  const match = str.match(/(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Estimate workout duration in minutes from total sets.
 * Uses ~2.5 min/set (working time + rest). Returns explicit duration if available.
 */
export function estimateDuration(totalSets, explicitDuration) {
  if (explicitDuration && explicitDuration > 0) return Math.round(explicitDuration)
  if (!totalSets || totalSets <= 0) return null
  return Math.round(totalSets * 2.5)
}

/**
 * Format duration for display: "~30 min"
 */
export function formatDuration(totalSets, explicitDuration) {
  const mins = estimateDuration(totalSets, explicitDuration)
  if (!mins) return null
  if (explicitDuration && explicitDuration > 0) return `${mins} min`
  return `~${mins} min`
}

/**
 * Group exercises for display, pairing supersets together.
 * Returns array of:
 *   { type: 'single', exercise, index }
 *   { type: 'superset', exerciseA, exerciseB, indexA, indexB, supersetGroup }
 */
export function groupExercisesForDisplay(exercises) {
  if (!exercises) return []
  const result = []
  const seen = new Set()

  exercises.forEach((ex, i) => {
    if (seen.has(i)) return

    if (ex.supersetGroup != null) {
      const partnerIdx = exercises.findIndex(
        (other, j) => j !== i && !seen.has(j) && other.supersetGroup === ex.supersetGroup
      )
      if (partnerIdx !== -1) {
        seen.add(i)
        seen.add(partnerIdx)
        result.push({
          type: 'superset',
          exerciseA: exercises[i],
          exerciseB: exercises[partnerIdx],
          indexA: i,
          indexB: partnerIdx,
          supersetGroup: ex.supersetGroup,
        })
        return
      }
    }

    seen.add(i)
    result.push({ type: 'single', exercise: ex, index: i })
  })

  return result
}

/**
 * Build a compact exercise summary array for feed items.
 * Returns: [{ name, sets, topWeight, topReps }, ...]
 * Also returns totalSets count.
 */
export function buildExerciseSummary(exercises) {
  if (!exercises || !exercises.length) return { exerciseSummary: [], totalSets: 0 }
  
  let totalSets = 0
  const exerciseSummary = exercises.map(ex => {
    const sets = ex.sets || []
    totalSets += sets.length
    
    // Find the heaviest set (by actual or prescribed weight)
    let topWeight = 0
    let topReps = 0
    sets.forEach(s => {
      const w = parseFloat(s.actualWeight || s.prescribedWeight) || 0
      if (w > topWeight) {
        topWeight = w
        topReps = parseInt(s.actualReps || s.prescribedReps) || 0
      }
    })
    
    return {
      name: ex.name || 'Exercise',
      sets: sets.length,
      topWeight: topWeight || null,
      topReps: topReps || null,
    }
  })
  
  return { exerciseSummary, totalSets }
}