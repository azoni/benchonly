// ============ CALORIE & ACTIVITY ESTIMATION SERVICE ============

// MET (Metabolic Equivalent of Task) values for common activities
// Higher MET = more calories burned
export const ACTIVITY_METS = {
  // Running
  running_easy: { met: 8.3, label: 'Running (easy pace)', category: 'running' },
  running_moderate: { met: 9.8, label: 'Running (moderate)', category: 'running' },
  running_hard: { met: 11.0, label: 'Running (hard)', category: 'running' },
  
  // Cycling
  cycling_easy: { met: 5.8, label: 'Cycling (easy)', category: 'cycling' },
  cycling_moderate: { met: 7.5, label: 'Cycling (moderate)', category: 'cycling' },
  cycling_hard: { met: 10.0, label: 'Cycling (hard)', category: 'cycling' },
  
  // Swimming
  swimming_easy: { met: 5.8, label: 'Swimming (easy)', category: 'swimming' },
  swimming_moderate: { met: 7.0, label: 'Swimming (moderate)', category: 'swimming' },
  swimming_hard: { met: 9.8, label: 'Swimming (hard)', category: 'swimming' },
  
  // Walking
  walking_slow: { met: 2.8, label: 'Walking (slow)', category: 'walking' },
  walking_moderate: { met: 3.5, label: 'Walking (moderate)', category: 'walking' },
  walking_brisk: { met: 4.3, label: 'Walking (brisk)', category: 'walking' },
  
  // Sports
  tennis: { met: 7.3, label: 'Tennis', category: 'sports' },
  basketball: { met: 6.5, label: 'Basketball', category: 'sports' },
  soccer: { met: 7.0, label: 'Soccer', category: 'sports' },
  volleyball: { met: 4.0, label: 'Volleyball', category: 'sports' },
  golf: { met: 3.5, label: 'Golf (walking)', category: 'sports' },
  baseball: { met: 5.0, label: 'Baseball/Softball', category: 'sports' },
  hockey: { met: 8.0, label: 'Hockey', category: 'sports' },
  boxing: { met: 7.8, label: 'Boxing', category: 'sports' },
  martial_arts: { met: 7.0, label: 'Martial Arts', category: 'sports' },
  rock_climbing: { met: 7.5, label: 'Rock Climbing', category: 'sports' },
  
  // Gym/Fitness
  hiit: { met: 8.0, label: 'HIIT', category: 'gym' },
  rowing: { met: 7.0, label: 'Rowing Machine', category: 'gym' },
  elliptical: { met: 5.0, label: 'Elliptical', category: 'gym' },
  stairmaster: { met: 9.0, label: 'Stair Climber', category: 'gym' },
  jump_rope: { met: 11.0, label: 'Jump Rope', category: 'gym' },
  yoga: { met: 2.5, label: 'Yoga', category: 'gym' },
  pilates: { met: 3.0, label: 'Pilates', category: 'gym' },
  stretching: { met: 2.3, label: 'Stretching', category: 'gym' },
  weightlifting_light: { met: 3.5, label: 'Weights (light)', category: 'gym' },
  weightlifting_moderate: { met: 5.0, label: 'Weights (moderate)', category: 'gym' },
  weightlifting_vigorous: { met: 6.0, label: 'Weights (vigorous)', category: 'gym' },
  
  // Outdoor
  hiking_easy: { met: 4.5, label: 'Hiking (easy)', category: 'outdoor' },
  hiking_moderate: { met: 6.0, label: 'Hiking (moderate)', category: 'outdoor' },
  hiking_hard: { met: 7.5, label: 'Hiking (strenuous)', category: 'outdoor' },
  kayaking: { met: 5.0, label: 'Kayaking', category: 'outdoor' },
  skiing: { met: 7.0, label: 'Skiing', category: 'outdoor' },
  snowboarding: { met: 5.3, label: 'Snowboarding', category: 'outdoor' },
  skating: { met: 7.0, label: 'Ice/Roller Skating', category: 'outdoor' },
  surfing: { met: 3.0, label: 'Surfing', category: 'outdoor' },
  
  // Dance
  dancing_casual: { met: 3.5, label: 'Dancing (casual)', category: 'dance' },
  dancing_aerobic: { met: 6.5, label: 'Aerobic Dance', category: 'dance' },
  dancing_vigorous: { met: 7.8, label: 'Dancing (vigorous)', category: 'dance' },
  
  // Other
  other_light: { met: 3.0, label: 'Other (light)', category: 'other' },
  other_moderate: { met: 5.0, label: 'Other (moderate)', category: 'other' },
  other_vigorous: { met: 7.0, label: 'Other (vigorous)', category: 'other' },
}

// Activity categories for UI grouping
export const ACTIVITY_CATEGORIES = [
  { id: 'running', label: 'Running', icon: '🏃' },
  { id: 'cycling', label: 'Cycling', icon: '🚴' },
  { id: 'swimming', label: 'Swimming', icon: '🏊' },
  { id: 'walking', label: 'Walking', icon: '🚶' },
  { id: 'sports', label: 'Sports', icon: '🎾' },
  { id: 'gym', label: 'Gym/Fitness', icon: '💪' },
  { id: 'outdoor', label: 'Outdoor', icon: '🏔️' },
  { id: 'dance', label: 'Dance', icon: '💃' },
  { id: 'other', label: 'Other', icon: '⭐' },
]

// Daily activity level multipliers for TDEE
export const ACTIVITY_LEVELS = {
  sedentary: { multiplier: 1.2, label: 'Sedentary', description: 'Desk job, little exercise' },
  light: { multiplier: 1.375, label: 'Lightly Active', description: 'Light exercise 1-3 days/week' },
  moderate: { multiplier: 1.55, label: 'Moderately Active', description: 'Moderate exercise 3-5 days/week' },
  active: { multiplier: 1.725, label: 'Very Active', description: 'Hard exercise 6-7 days/week' },
  athlete: { multiplier: 1.9, label: 'Athlete', description: 'Very hard exercise, physical job' },
}

// Default values when user hasn't provided info
const DEFAULTS = {
  weight: 170, // lbs
  height: 70, // inches (5'10")
  age: 30,
  gender: 'male',
  activityLevel: 'light'
}

/**
 * Calculate BMR using Mifflin-St Jeor equation
 * Most accurate for modern populations
 */
export function calculateBMR(profile) {
  const weight = profile?.weight || DEFAULTS.weight
  const height = profile?.height || DEFAULTS.height
  const age = profile?.age || DEFAULTS.age
  const gender = profile?.gender || DEFAULTS.gender
  
  // Convert to metric
  const weightKg = weight * 0.453592
  const heightCm = height * 2.54
  
  // Mifflin-St Jeor formula
  if (gender === 'female') {
    return Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161)
  }
  return Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5)
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 * BMR * activity level multiplier
 */
export function calculateTDEE(profile) {
  const bmr = calculateBMR(profile)
  const activityLevel = profile?.activityLevel || DEFAULTS.activityLevel
  const multiplier = ACTIVITY_LEVELS[activityLevel]?.multiplier || 1.375
  
  return Math.round(bmr * multiplier)
}

/**
 * Calculate calories burned for a specific activity
 * Formula: MET × weight(kg) × duration(hours)
 */
export function calculateActivityCalories(activityType, durationMinutes, weightLbs) {
  const activity = ACTIVITY_METS[activityType]
  if (!activity) return 0
  
  const weightKg = (weightLbs || DEFAULTS.weight) * 0.453592
  const durationHours = durationMinutes / 60
  
  return Math.round(activity.met * weightKg * durationHours)
}

/**
 * Estimate calories burned from a strength workout
 * Based on duration and intensity
 */
export function calculateStrengthWorkoutCalories(workout, weightLbs) {
  // Estimate duration from number of sets
  const totalSets = workout.exercises?.reduce((acc, ex) => acc + (ex.sets?.length || 0), 0) || 0
  const estimatedMinutes = totalSets * 2.5 // ~2.5 min per set including rest
  
  // Use moderate weightlifting MET (5.0)
  const weightKg = (weightLbs || DEFAULTS.weight) * 0.453592
  const durationHours = estimatedMinutes / 60
  
  return Math.round(5.0 * weightKg * durationHours)
}

/**
 * Calculate total calories for a day
 * Includes base TDEE + exercise calories
 */
export function calculateDailyCalories(profile, activities = [], workouts = []) {
  const tdee = calculateTDEE(profile)
  const weight = profile?.weight || DEFAULTS.weight
  
  // Sum up activity calories
  const activityCalories = activities.reduce((sum, activity) => {
    return sum + calculateActivityCalories(activity.activityType, activity.duration, weight)
  }, 0)
  
  // Sum up strength workout calories
  const workoutCalories = workouts.reduce((sum, workout) => {
    return sum + calculateStrengthWorkoutCalories(workout, weight)
  }, 0)
  
  return {
    base: tdee,
    exercise: activityCalories + workoutCalories,
    total: tdee + activityCalories + workoutCalories - calculateBMR(profile), // Don't double count BMR
    breakdown: {
      bmr: calculateBMR(profile),
      neat: tdee - calculateBMR(profile), // Non-exercise activity
      cardio: activityCalories,
      strength: workoutCalories
    }
  }
}

/**
 * Get activities grouped by category for UI
 */
export function getActivitiesByCategory() {
  const grouped = {}
  
  Object.entries(ACTIVITY_METS).forEach(([key, activity]) => {
    if (!grouped[activity.category]) {
      grouped[activity.category] = []
    }
    grouped[activity.category].push({ id: key, ...activity })
  })
  
  return grouped
}

/**
 * Get default activity MET based on category and intensity
 */
export function getDefaultActivityForCategory(category, intensity = 'moderate') {
  const activities = Object.entries(ACTIVITY_METS)
    .filter(([_, a]) => a.category === category)
    .map(([id, a]) => ({ id, ...a }))
  
  if (activities.length === 0) return 'other_moderate'
  if (activities.length === 1) return activities[0].id
  
  // Try to find matching intensity
  const byIntensity = activities.find(a => 
    a.id.includes(intensity) || 
    a.label.toLowerCase().includes(intensity)
  )
  
  return byIntensity?.id || activities[Math.floor(activities.length / 2)].id
}

/**
 * Check if user has complete profile for accurate calorie calculation
 */
export function hasCompleteProfile(profile) {
  return !!(profile?.weight && profile?.height && profile?.age && profile?.gender)
}

/**
 * Get profile completeness percentage
 */
export function getProfileCompleteness(profile) {
  const fields = ['weight', 'height', 'age', 'gender', 'activityLevel']
  const filled = fields.filter(f => profile?.[f]).length
  return Math.round((filled / fields.length) * 100)
}
