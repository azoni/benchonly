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

// For detailed mode: format a single set row
function getSetDetail(set, type, isCompleted) {
  if (type === 'time') {
    const prescribed = set.prescribedTime ? `${set.prescribedTime}s` : null
    const actual = set.actualTime ? `${set.actualTime}s` : null
    if (isCompleted && actual) {
      return { actual, prescribed, hasActual: true }
    }
    return { actual: null, prescribed, hasActual: false }
  }
  if (type === 'bodyweight') {
    const prescribedReps = set.prescribedReps
    const actualReps = set.actualReps
    const weight = isCompleted ? set.actualWeight : set.prescribedWeight
    const reps = isCompleted && actualReps ? actualReps : prescribedReps
    const weightStr = weight ? `BW+${weight}` : 'BW'
    const prescribed = prescribedReps ? `${weightStr} × ${prescribedReps}` : null
    const actual = isCompleted && actualReps ? `${weightStr} × ${actualReps}` : null
    return { actual, prescribed, hasActual: !!(isCompleted && actualReps) }
  }
  // weight
  const prescribedWeight = set.prescribedWeight
  const prescribedReps = set.prescribedReps
  const actualWeight = set.actualWeight
  const actualReps = set.actualReps
  const prescribed = prescribedWeight && prescribedReps ? `${prescribedWeight} × ${prescribedReps}` : prescribedReps ? `× ${prescribedReps}` : null
  const actual = isCompleted && (actualWeight || actualReps)
    ? `${actualWeight || prescribedWeight || '—'} × ${actualReps || '—'}`
    : null
  return { actual, prescribed, hasActual: !!(isCompleted && (actualWeight || actualReps)) }
}

// Estimate total volume (lbs × reps) for completed workouts
function calcVolume(exercises, isCompleted) {
  if (!isCompleted) return null
  let totalSets = 0
  let totalVol = 0
  for (const ex of exercises) {
    const type = getExerciseType(ex)
    if (type !== 'weight') continue
    for (const s of (ex.sets || [])) {
      totalSets++
      const w = parseFloat(s.actualWeight || s.prescribedWeight || 0)
      const r = parseFloat(s.actualReps || s.prescribedReps || 0)
      if (w && r) totalVol += w * r
    }
  }
  return { totalSets, totalVol: Math.round(totalVol) }
}

export default function WorkoutSummaryCard({ exercises, isCompleted, detailed = false, workoutNotes }) {
  if (!exercises || exercises.length === 0) return null

  const vol = detailed ? calcVolume(exercises, isCompleted) : null

  // Parse WOD format from notes (e.g. "AMRAP 20 min\n..." or "For Time\n...")
  let wodHeader = null
  if (detailed && workoutNotes) {
    const firstLine = workoutNotes.split('\n')[0]?.trim()
    if (firstLine && (firstLine.includes('AMRAP') || firstLine.includes('For Time') || firstLine.includes('EMOM'))) {
      wodHeader = firstLine
    }
  }

  return (
    <div className="card-steel p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <ListChecks className="w-5 h-5 text-flame-400" />
        <h3 className="font-semibold text-iron-100 text-base">Workout Summary</h3>
      </div>

      {wodHeader && (
        <div className="mb-3 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <span className="text-sm font-semibold text-yellow-400">{wodHeader}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {groupExercisesForDisplay(exercises).map((group, i) => {
          if (group.type === 'superset') {
            const { exerciseA, exerciseB } = group
            const summaryA = getSummaryText(exerciseA, isCompleted)
            const summaryB = getSummaryText(exerciseB, isCompleted)
            const hasActualA = isCompleted && exerciseA.sets?.some(s => s.actualWeight || s.actualReps || s.actualTime)
            const hasActualB = isCompleted && exerciseB.sets?.some(s => s.actualWeight || s.actualReps || s.actualTime)
            const typeA = getExerciseType(exerciseA)
            const typeB = getExerciseType(exerciseB)

            return (
              <div key={`ss-${group.supersetGroup}`} className="py-2 border-b border-iron-800/50 last:border-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <span className="text-xs text-purple-400 font-semibold uppercase">Superset</span>
                </div>

                {detailed ? (
                  <>
                    <p className="text-base font-semibold text-iron-200 mb-1">{exerciseA.name}</p>
                    {(exerciseA.sets || []).map((set, si) => {
                      const d = getSetDetail(set, typeA, isCompleted)
                      return (
                        <div key={si} className="flex items-center justify-between pl-2 py-1">
                          <span className="text-sm text-iron-500">Set {si + 1}</span>
                          <div className="text-right">
                            {d.hasActual
                              ? <span className="text-sm font-semibold text-flame-400">{d.actual}</span>
                              : <span className="text-sm text-iron-300">{d.prescribed || '—'}</span>
                            }
                          </div>
                        </div>
                      )
                    })}
                    <p className="text-base font-semibold text-iron-200 mt-2.5 mb-1">{exerciseB.name}</p>
                    {(exerciseB.sets || []).map((set, si) => {
                      const d = getSetDetail(set, typeB, isCompleted)
                      return (
                        <div key={si} className="flex items-center justify-between pl-2 py-1">
                          <span className="text-sm text-iron-500">Set {si + 1}</span>
                          <div className="text-right">
                            {d.hasActual
                              ? <span className="text-sm font-semibold text-flame-400">{d.actual}</span>
                              : <span className="text-sm text-iron-300">{d.prescribed || '—'}</span>
                            }
                          </div>
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-base font-medium text-iron-200 truncate">{exerciseA.name}</span>
                      <span className={`text-base font-semibold flex-shrink-0 ml-3 ${isCompleted && hasActualA ? 'text-flame-400' : 'text-iron-300'}`}>{summaryA}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-base font-medium text-iron-200 truncate">{exerciseB.name}</span>
                      <span className={`text-base font-semibold flex-shrink-0 ml-3 ${isCompleted && hasActualB ? 'text-flame-400' : 'text-iron-300'}`}>{summaryB}</span>
                    </div>
                  </>
                )}
              </div>
            )
          }

          const exercise = group.exercise
          const type = getExerciseType(exercise)
          const summary = getSummaryText(exercise, isCompleted)
          const hasActualData = isCompleted && exercise.sets?.some(s =>
            s.actualWeight || s.actualReps || s.actualTime
          )

          if (detailed) {
            return (
              <div key={i} className="py-2.5 border-b border-iron-800/50 last:border-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base font-semibold text-iron-200">{exercise.name}</span>
                  {type === 'time' && (
                    <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded flex-shrink-0">Time</span>
                  )}
                  {type === 'bodyweight' && (
                    <span className="px-1.5 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded flex-shrink-0">BW</span>
                  )}
                </div>
                {(exercise.sets || []).map((set, si) => {
                  const d = getSetDetail(set, type, isCompleted)
                  return (
                    <div key={si} className="flex items-center justify-between pl-2 py-1">
                      <span className="text-sm text-iron-500">Set {si + 1}</span>
                      <div className="flex items-center gap-2">
                        {d.hasActual && d.prescribed && d.actual !== d.prescribed && (
                          <span className="text-sm text-iron-600 line-through">{d.prescribed}</span>
                        )}
                        <span className={`text-sm font-semibold ${d.hasActual ? 'text-flame-400' : 'text-iron-300'}`}>
                          {d.hasActual ? d.actual : (d.prescribed || '—')}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }

          return (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-iron-800/50 last:border-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-base font-medium text-iron-200 truncate">{exercise.name}</span>
                {type === 'time' && (
                  <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded flex-shrink-0">Time</span>
                )}
                {type === 'bodyweight' && (
                  <span className="px-1.5 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded flex-shrink-0">BW</span>
                )}
              </div>
              <span className={`text-base font-semibold flex-shrink-0 ml-3 ${
                isCompleted && hasActualData ? 'text-flame-400' : 'text-iron-300'
              }`}>
                {summary}
              </span>
            </div>
          )
        })}
      </div>

      {vol && (vol.totalVol > 0 || vol.totalSets > 0) && (
        <div className="mt-3 pt-3 border-t border-iron-800/50 flex items-center justify-between text-xs text-iron-500">
          <span>{vol.totalSets} weighted sets</span>
          {vol.totalVol > 0 && <span>~{vol.totalVol.toLocaleString()} lbs total volume</span>}
        </div>
      )}
    </div>
  )
}
