import { ListChecks, Zap } from 'lucide-react'
import { groupExercisesForDisplay } from '../utils/workoutUtils'

const getExerciseType = (exercise) => {
  if (exercise.type) return exercise.type
  const sets = exercise.sets || []
  if (sets.some(s => s.prescribedTime || s.actualTime)) return 'time'
  const hasWeight = sets.some(s => s.prescribedWeight || s.actualWeight)
  if (!hasWeight && sets.some(s => s.prescribedReps || s.actualReps)) return 'bodyweight'
  return 'weight'
}

function getSummaryText(exercise, isCompleted) {
  const type = getExerciseType(exercise)
  const sets = exercise.sets || []
  if (sets.length === 0) return '—'

  if (type === 'time') {
    const field = isCompleted ? 'actualTime' : 'prescribedTime'
    const first = sets[0]?.[field]
    const allSame = sets.every(s => s[field] === first)
    if (allSame && first) return `${sets.length}×${first}s`
    return `${sets.length} sets (varied)`
  }

  if (type === 'bodyweight') {
    const repsField = isCompleted ? 'actualReps' : 'prescribedReps'
    const weightField = isCompleted ? 'actualWeight' : 'prescribedWeight'
    const firstReps = sets[0]?.[repsField]
    const firstWeight = sets[0]?.[weightField]
    const allSame = sets.every(s => s[repsField] === firstReps && s[weightField] === firstWeight)
    if (allSame && firstReps) {
      if (firstWeight) return `${sets.length}×BW+${firstWeight}×${firstReps}`
      return `${sets.length}×${firstReps} reps`
    }
    return `${sets.length} sets (varied)`
  }

  // Weight type
  const weightField = isCompleted ? 'actualWeight' : 'prescribedWeight'
  const repsField = isCompleted ? 'actualReps' : 'prescribedReps'
  const firstWeight = sets[0]?.[weightField]
  const firstReps = sets[0]?.[repsField]
  const allSame = sets.every(s => s[weightField] === firstWeight && s[repsField] === firstReps)

  if (allSame && firstWeight && firstReps) {
    return `${sets.length}×${firstWeight}×${firstReps}`
  }
  if (sets.length > 0) {
    return `${sets.length} sets (varied)`
  }
  return '—'
}

export default function WorkoutSummaryCard({ exercises, isCompleted }) {
  if (!exercises || exercises.length === 0) return null

  return (
    <div className="card-steel p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <ListChecks className="w-5 h-5 text-flame-400" />
        <h3 className="font-semibold text-iron-100 text-sm">Workout Summary</h3>
      </div>
      <div className="space-y-1.5">
        {groupExercisesForDisplay(exercises).map((group, i) => {
          if (group.type === 'superset') {
            const { exerciseA, exerciseB } = group
            const summaryA = getSummaryText(exerciseA, isCompleted)
            const summaryB = getSummaryText(exerciseB, isCompleted)
            const hasActualA = isCompleted && exerciseA.sets?.some(s => s.actualWeight || s.actualReps || s.actualTime)
            const hasActualB = isCompleted && exerciseB.sets?.some(s => s.actualWeight || s.actualReps || s.actualTime)
            return (
              <div key={`ss-${group.supersetGroup}`} className="py-1.5 border-b border-iron-800/50 last:border-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="w-3 h-3 text-purple-400 flex-shrink-0" />
                  <span className="text-[10px] text-purple-400 font-semibold uppercase">Superset</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-iron-200 truncate">{exerciseA.name}</span>
                  <span className={`text-sm font-semibold flex-shrink-0 ml-3 ${isCompleted && hasActualA ? 'text-flame-400' : 'text-iron-300'}`}>{summaryA}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-sm font-medium text-iron-200 truncate">{exerciseB.name}</span>
                  <span className={`text-sm font-semibold flex-shrink-0 ml-3 ${isCompleted && hasActualB ? 'text-flame-400' : 'text-iron-300'}`}>{summaryB}</span>
                </div>
              </div>
            )
          }

          const exercise = group.exercise
          const type = getExerciseType(exercise)
          const summary = getSummaryText(exercise, isCompleted)
          const hasActualData = isCompleted && exercise.sets?.some(s =>
            s.actualWeight || s.actualReps || s.actualTime
          )

          return (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-iron-800/50 last:border-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-sm font-medium text-iron-200 truncate">{exercise.name}</span>
                {type === 'time' && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded flex-shrink-0">Time</span>
                )}
                {type === 'bodyweight' && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded flex-shrink-0">BW</span>
                )}
              </div>
              <span className={`text-sm font-semibold flex-shrink-0 ml-3 ${
                isCompleted && hasActualData ? 'text-flame-400' : 'text-iron-300'
              }`}>
                {summary}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
