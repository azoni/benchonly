import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Users, Dumbbell, MessageSquare, HelpCircle, Activity } from 'lucide-react'
import { groupWorkoutService, groupService } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { getDisplayDate } from '../utils/dateUtils'
import usePageTitle from '../utils/usePageTitle'
import WorkoutSummaryCard from '../components/WorkoutSummaryCard'
import ExerciseInfoModal from '../components/ExerciseInfoModal'

const getExerciseType = (exercise) => {
  if (exercise.type) return exercise.type
  const sets = exercise.sets || []
  if (sets.some(s => s.prescribedTime || s.actualTime)) return 'time'
  const hasWeight = sets.some(s => s.prescribedWeight || s.actualWeight)
  if (!hasWeight && sets.some(s => s.prescribedReps || s.actualReps)) return 'bodyweight'
  return 'weight'
}

const getTypeTag = (type) => {
  switch (type) {
    case 'time': return { label: 'Time', color: 'bg-blue-500/20 text-blue-400' }
    case 'bodyweight': return { label: 'BW', color: 'bg-emerald-500/20 text-emerald-400' }
    default: return null
  }
}

const calculateE1RM = (weight, reps) => {
  if (!weight || !reps || reps < 1) return null
  if (reps === 1) return weight
  if (reps > 30) return null
  return Math.round(weight * (1 + reps / 30))
}

const safeFormatDate = (date, formatStr = 'MMM d, yyyy') => {
  if (!date) return ''
  try {
    const dateObj = getDisplayDate(date)
    if (isNaN(dateObj.getTime())) return ''
    return format(dateObj, formatStr)
  } catch {
    return ''
  }
}

const getRPEColor = (rpe) => {
  if (rpe >= 9) return 'text-red-400'
  if (rpe >= 7) return 'text-yellow-400'
  return 'text-green-400'
}

const getPainColor = (level) => {
  if (level >= 7) return 'bg-red-500/20 text-red-400'
  if (level >= 4) return 'bg-yellow-500/20 text-yellow-400'
  return 'bg-green-500/20 text-green-400'
}

export default function GroupBatchViewPage() {
  const { groupId, batchKey } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  usePageTitle('Group Workout Batch')

  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [batchWorkouts, setBatchWorkouts] = useState([])
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [infoExercise, setInfoExercise] = useState(null)

  const decodedKey = decodeURIComponent(batchKey)

  useEffect(() => {
    async function loadData() {
      if (!groupId || !user) return
      try {
        const [groupData, allWorkouts] = await Promise.all([
          groupService.getById(groupId),
          groupWorkoutService.getByGroup(groupId, user.uid)
        ])
        setGroup(groupData)

        // Load member details
        if (groupData?.members) {
          const memberData = await groupService.getMemberDetails(groupData.members)
          setMembers(memberData)
        }

        // Filter to matching batch
        const matched = allWorkouts.filter(w => {
          const dateStr = safeFormatDate(w.date, 'yyyy-MM-dd')
          const key = `${w.name}-${dateStr}`
          return key === decodedKey
        })
        setBatchWorkouts(matched)
      } catch (err) {
        console.error('Error loading batch view:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [groupId, batchKey, user, decodedKey])

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (batchWorkouts.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate(`/groups/${groupId}`)} className="flex items-center gap-2 text-iron-400 hover:text-iron-200 mb-6">
          <ArrowLeft className="w-5 h-5" />
          Back to Group
        </button>
        <div className="card-steel p-8 text-center">
          <Dumbbell className="w-12 h-12 text-iron-700 mx-auto mb-3" />
          <p className="text-iron-500">No workouts found for this batch</p>
        </div>
      </div>
    )
  }

  const workoutName = batchWorkouts[0]?.name || 'Workout'
  const workoutDate = safeFormatDate(batchWorkouts[0]?.date, 'EEE, MMM d')
  const completedCount = batchWorkouts.filter(w => w.status === 'completed').length
  const activeWorkout = batchWorkouts[activeTab] || batchWorkouts[0]
  const activeMember = members.find(m => m.uid === activeWorkout?.assignedTo)
  const isCompleted = activeWorkout?.status === 'completed'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(`/groups/${groupId}`, { state: { activeTab: 'workouts' } })}
          className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-iron-50 truncate">{workoutName}</h1>
          <div className="flex items-center gap-2 text-sm text-iron-500">
            <span>{workoutDate}</span>
            <span>·</span>
            <span className={completedCount === batchWorkouts.length ? 'text-green-400' : ''}>
              {completedCount}/{batchWorkouts.length} done
            </span>
          </div>
        </div>
      </div>

      {/* Member Tabs */}
      <div className="mb-6 -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {batchWorkouts.map((workout, idx) => {
            const member = members.find(m => m.uid === workout.assignedTo)
            const isActive = idx === activeTab
            const done = workout.status === 'completed'

            return (
              <button
                key={workout.id}
                onClick={() => setActiveTab(idx)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all flex-shrink-0 ${
                  isActive
                    ? 'bg-flame-500 text-white shadow-lg shadow-flame-500/20'
                    : 'bg-iron-800/50 text-iron-400 hover:bg-iron-800 hover:text-iron-200'
                }`}
              >
                {member?.photoURL ? (
                  <img src={member.photoURL} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isActive ? 'bg-white/20' : 'bg-iron-700'
                  }`}>
                    {member?.displayName?.[0] || '?'}
                  </div>
                )}
                <span className="text-sm font-medium">{member?.displayName?.split(' ')[0] || 'Unknown'}</span>
                {done && (
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-green-300' : 'bg-green-500'}`} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active Member's Workout */}
      {activeWorkout && (
        <div>
          {/* Status + Link to individual workout */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {activeMember?.photoURL ? (
                <img src={activeMember.photoURL} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-iron-700 flex items-center justify-center">
                  <span className="text-sm text-iron-400">{activeMember?.displayName?.[0] || '?'}</span>
                </div>
              )}
              <div>
                <p className="font-semibold text-iron-100">{activeMember?.displayName || 'Unknown'}</p>
                <p className="text-xs text-iron-500">
                  {isCompleted ? 'Completed' : 'Pending'}
                  {activeWorkout.completedAt && ` · ${safeFormatDate(activeWorkout.completedAt, 'MMM d, h:mm a')}`}
                </p>
              </div>
            </div>
            <Link
              to={`/workouts/group/${activeWorkout.id}`}
              state={{ from: `/groups/${groupId}/batch/${batchKey}`, fromLabel: 'Back to Batch' }}
              className="text-sm text-flame-400 hover:text-flame-300 font-medium"
            >
              View Full →
            </Link>
          </div>

          {/* Coaching Notes */}
          {activeWorkout.coachingNotes && (
            <div className="card-steel p-4 mb-4 bg-flame-500/5 border-flame-500/10">
              <p className="text-xs text-flame-400 mb-1.5">AI Coaching Notes</p>
              <p className="text-sm text-iron-400 leading-relaxed">{activeWorkout.coachingNotes}</p>
            </div>
          )}

          {/* Workout Notes */}
          {activeWorkout.notes && (
            <div className="card-steel p-4 mb-4">
              <p className="text-iron-300 text-sm">{activeWorkout.notes}</p>
            </div>
          )}

          {/* Summary Card */}
          {activeWorkout.exercises?.length > 0 && (
            <WorkoutSummaryCard exercises={activeWorkout.exercises} isCompleted={isCompleted} />
          )}

          {/* Exercise Details */}
          <div className="space-y-4">
            {activeWorkout.exercises?.map((exercise, exerciseIndex) => {
              const type = getExerciseType(exercise)
              const typeTag = getTypeTag(type)

              return (
                <div key={exerciseIndex} className="card-steel overflow-hidden">
                  <div className="p-4 border-b border-iron-800">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setInfoExercise(exercise)}
                        className="text-lg font-semibold text-iron-50 hover:text-flame-400 transition-colors text-left flex items-center gap-1.5"
                      >
                        {exercise.name}
                        <HelpCircle className="w-3.5 h-3.5 text-iron-600 flex-shrink-0" />
                      </button>
                      {typeTag && (
                        <span className={`px-2 py-0.5 text-xs rounded ${typeTag.color}`}>{typeTag.label}</span>
                      )}
                    </div>
                    <p className="text-sm text-iron-500 mt-1">{exercise.sets?.length || 0} sets</p>
                  </div>
                  <div className="divide-y divide-iron-800/50">
                    {exercise.sets?.map((set, setIndex) => {
                      const hasActual = type === 'time'
                        ? set.actualTime
                        : type === 'bodyweight'
                          ? set.actualReps
                          : (set.actualWeight || set.actualReps)
                      const e1rm = type === 'weight' && hasActual && set.actualWeight && set.actualReps && parseInt(set.actualReps) > 1
                        ? calculateE1RM(parseFloat(set.actualWeight), parseInt(set.actualReps))
                        : null

                      return (
                        <div key={setIndex} className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-iron-800 flex items-center justify-center flex-shrink-0">
                              <span className="text-lg font-bold text-iron-400">{setIndex + 1}</span>
                            </div>
                            <div className="flex-1">
                              {type === 'time' ? (
                                !isCompleted ? (
                                  <div className="text-2xl font-bold text-iron-100">{set.prescribedTime || '—'} seconds</div>
                                ) : (
                                  <>
                                    <div className="text-sm text-iron-500 mb-1">Target: {set.prescribedTime || '—'}s</div>
                                    {hasActual ? (
                                      <span className="text-2xl font-bold text-flame-400">{set.actualTime || '—'} seconds</span>
                                    ) : (
                                      <span className="text-lg text-iron-600">Not logged</span>
                                    )}
                                  </>
                                )
                              ) : type === 'bodyweight' ? (
                                !isCompleted ? (
                                  <div className="text-2xl font-bold text-iron-100">{set.prescribedReps || '—'} reps</div>
                                ) : (
                                  <>
                                    <div className="text-sm text-iron-500 mb-1">Target: {set.prescribedReps || '—'} reps</div>
                                    {hasActual ? (
                                      <span className="text-2xl font-bold text-flame-400">{set.actualReps || '—'} reps</span>
                                    ) : (
                                      <span className="text-lg text-iron-600">Not logged</span>
                                    )}
                                  </>
                                )
                              ) : !isCompleted ? (
                                <span className="text-2xl font-bold text-iron-100">
                                  {set.prescribedWeight || '—'} lbs × {set.prescribedReps || '—'}
                                  {set.targetRpe && <span className="text-sm text-iron-500 font-normal ml-2">@ RPE {set.targetRpe}</span>}
                                </span>
                              ) : (
                                <>
                                  <div className="text-sm text-iron-500 mb-1">
                                    Target: {set.prescribedWeight || '—'} lbs × {set.prescribedReps || '—'} reps
                                  </div>
                                  {hasActual ? (
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <span className="text-2xl font-bold text-flame-400">
                                        {set.actualWeight || '—'} lbs × {set.actualReps || '—'}
                                      </span>
                                      {e1rm && (
                                        <span className="text-sm text-iron-500 bg-iron-800 px-2 py-1 rounded-lg">e1RM: {e1rm} lbs</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-lg text-iron-600">Not logged</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* RPE & Pain */}
                  {isCompleted && (exercise.rpe || exercise.painLevel > 0 || exercise.sets?.some(s => s.rpe || s.painLevel > 0)) && (
                    <div className="px-4 pb-2 flex items-center gap-3">
                      {(exercise.rpe || exercise.sets?.some(s => s.rpe)) && (() => {
                        const maxRpe = exercise.rpe || Math.max(0, ...(exercise.sets || []).map(s => parseFloat(s.rpe) || 0))
                        return (
                          <span className={`text-sm font-semibold ${getRPEColor(maxRpe)}`}>
                            RPE {maxRpe}
                          </span>
                        )
                      })()}
                      {(exercise.painLevel > 0 || exercise.sets?.some(s => s.painLevel > 0)) && (() => {
                        const maxPain = exercise.painLevel || Math.max(0, ...(exercise.sets || []).map(s => s.painLevel || 0))
                        return (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPainColor(maxPain)}`}>
                            Pain {maxPain}
                          </span>
                        )
                      })()}
                    </div>
                  )}
                  {exercise.notes && (
                    <div className="px-4 pb-2">
                      <div className="flex items-start gap-2 bg-iron-800/30 rounded-lg p-3">
                        <MessageSquare className="w-4 h-4 text-iron-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-iron-400">{exercise.notes}</p>
                      </div>
                    </div>
                  )}
                  {exercise.userNotes && (
                    <div className="px-4 pb-4">
                      <div className="flex items-start gap-2 bg-flame-500/5 border border-flame-500/10 rounded-lg p-3">
                        <MessageSquare className="w-4 h-4 text-flame-400/60 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-iron-500 mb-0.5">Their Notes</p>
                          <p className="text-sm text-iron-400">{exercise.userNotes}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {(!activeWorkout.exercises || activeWorkout.exercises.length === 0) && (
            <div className="card-steel p-8 text-center">
              <Dumbbell className="w-12 h-12 text-iron-700 mx-auto mb-3" />
              <p className="text-iron-500">No exercises in this workout</p>
            </div>
          )}
        </div>
      )}

      {/* Exercise Info Modal */}
      {infoExercise && (
        <ExerciseInfoModal
          exercise={infoExercise}
          onClose={() => setInfoExercise(null)}
        />
      )}
    </div>
  )
}
