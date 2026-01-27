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