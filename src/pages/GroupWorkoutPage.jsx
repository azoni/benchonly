import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Users,
  Check,
  Loader2,
  Info,
  X,
  Play,
  Calendar,
  MessageSquare,
  Pencil
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { groupWorkoutService, groupService } from '../services/firestore'
import { getDisplayDate } from '../utils/dateUtils'

// Calculate estimated 1RM using Epley formula
const calculateE1RM = (weight, reps) => {
  if (!weight || !reps || reps < 1) return null
  if (reps === 1) return weight
  if (reps > 30) return null
  return Math.round(weight * (1 + reps / 30))
}

export default function GroupWorkoutPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [workout, setWorkout] = useState(null)
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  const [exercises, setExercises] = useState([])
  const [workoutNotes, setWorkoutNotes] = useState('')
  const [rpeModalOpen, setRpeModalOpen] = useState(false)

  useEffect(() => {
    loadWorkout()
  }, [id])

  const loadWorkout = async () => {
    try {
      const data = await groupWorkoutService.get(id)
      if (data) {
        setWorkout(data)
        setWorkoutNotes(data.notes || '')
        if (data.exercises) {
          setExercises(data.exercises.map(ex => ({
            ...ex,
            notes: ex.notes || '',
            sets: ex.sets?.map(set => ({ ...set })) || []
          })))
        }
        const groupData = await groupService.get(data.groupId)
        setGroup(groupData)
      }
    } catch (error) {
      console.error('Error loading workout:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    // If we came from a group page, go back there with the right tab
    if (location.state?.from) {
      navigate(location.state.from, { state: location.state?.backState })
    } else if (workout?.groupId) {
      // Default: go to group workouts tab
      navigate(`/groups/${workout.groupId}`, { state: { activeTab: 'workouts' } })
    } else {
      navigate(-1)
    }
  }

  const updateSet = (exerciseIndex, setIndex, field, value) => {
    setExercises(prev => {
      const newExercises = [...prev]
      newExercises[exerciseIndex] = {
        ...newExercises[exerciseIndex],
        sets: newExercises[exerciseIndex].sets.map((set, i) =>
          i === setIndex ? { ...set, [field]: value } : set
        )
      }
      return newExercises
    })
  }

  const updateExerciseNotes = (exerciseIndex, notes) => {
    setExercises(prev => {
      const newExercises = [...prev]
      newExercises[exerciseIndex] = { ...newExercises[exerciseIndex], notes }
      return newExercises
    })
  }

  const handleSaveProgress = async () => {
    setSaving(true)
    try {
      await groupWorkoutService.update(id, { exercises, notes: workoutNotes })
      setWorkout(prev => ({ ...prev, exercises, notes: workoutNotes }))
      setIsLogging(false)
    } catch (error) {
      console.error('Error saving workout:', error)
      alert('Failed to save workout')
    } finally {
      setSaving(false)
    }
  }

  const handleComplete = async () => {
    setSaving(true)
    try {
      // Auto-fill blank fields with prescribed values
      const filledExercises = exercises.map(ex => ({
        ...ex,
        sets: ex.sets.map(set => {
          const isTimeExercise = ex.type === 'time' || set.prescribedTime || set.actualTime
          if (isTimeExercise) {
            return {
              ...set,
              actualTime: set.actualTime || set.prescribedTime || ''
            }
          }
          return {
            ...set,
            actualWeight: set.actualWeight || set.prescribedWeight || '',
            actualReps: set.actualReps || set.prescribedReps || ''
          }
        })
      }))
      await groupWorkoutService.complete(id, { exercises: filledExercises, notes: workoutNotes })
      setWorkout(prev => ({ ...prev, exercises: filledExercises, notes: workoutNotes, status: 'completed' }))
      setExercises(filledExercises)
      setIsLogging(false)
    } catch (error) {
      console.error('Error completing workout:', error)
      alert('Failed to complete workout')
    } finally {
      setSaving(false)
    }
  }

  const safeFormatDate = (date) => {
    if (!date) return ''
    try {
      const dateObj = getDisplayDate(date)
      if (isNaN(dateObj.getTime())) return ''
      return format(dateObj, 'EEEE, MMM d')
    } catch {
      return ''
    }
  }

  const getRPEColor = (rpe) => {
    if (rpe >= 9) return 'text-red-400'
    if (rpe >= 7) return 'text-yellow-400'
    return 'text-green-400'
  }

  const getPainColor = (pain) => {
    if (pain >= 7) return 'bg-red-500/20 text-red-400'
    if (pain >= 4) return 'bg-yellow-500/20 text-yellow-400'
    return 'bg-green-500/20 text-green-400'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-flame-500 animate-spin" />
      </div>
    )
  }

  if (!workout) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 bg-iron-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-iron-600" />
        </div>
        <h2 className="text-xl font-display text-iron-200 mb-2">Workout Not Found</h2>
        <p className="text-iron-500 mb-6">This workout may have been deleted or you don't have access.</p>
        <button onClick={handleBack} className="btn-primary">Go Back</button>
      </div>
    )
  }

  const isCompleted = workout.status === 'completed'
  const isOwner = workout.assignedTo === user?.uid
  const isAdmin = group?.admins?.includes(user?.uid)
  const canLog = isOwner || isAdmin

  // ============ VIEW MODE ============
  if (!isLogging) {
    return (
      <div className="max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-iron-950/95 backdrop-blur-sm border-b border-iron-800 -mx-4 px-4 py-3 mb-6">
          <div className="flex items-center justify-between">
            <button onClick={handleBack} className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-sm font-medium">Group</span>
              {isCompleted ? (
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">Completed</span>
              ) : (
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">Assigned</span>
              )}
            </div>
          </div>
        </div>

        {/* Workout Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-display text-iron-50 mb-2">{workout.name}</h1>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-iron-400">
              <Calendar className="w-4 h-4 text-flame-400" />
              <span>{safeFormatDate(workout.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-iron-400">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>{group?.name || 'Group Workout'}</span>
            </div>
          </div>
        </div>

        {/* Info Messages */}
        {!isOwner && !isAdmin && (
          <div className="card-steel p-4 mb-6 border-iron-700">
            <p className="text-sm text-iron-400">This workout was assigned to another member. You can view but not edit.</p>
          </div>
        )}
        {!isOwner && isAdmin && (
          <div className="card-steel p-4 mb-6 border-cyan-500/30 bg-cyan-500/5">
            <p className="text-sm text-cyan-400">You're viewing as admin. You can log this workout on behalf of the member.</p>
          </div>
        )}

        {workout.notes && (
          <div className="card-steel p-4 mb-6">
            <p className="text-iron-300 text-sm">{workout.notes}</p>
          </div>
        )}

        {/* Exercises */}
        <div className="space-y-4">
          {workout.exercises?.map((exercise, exerciseIndex) => {
            const isTimeExercise = exercise.type === 'time' || exercise.sets?.some(s => s.prescribedTime || s.actualTime)
            
            return (
            <div key={exerciseIndex} className="card-steel overflow-hidden">
              <div className="p-4 border-b border-iron-800">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold text-iron-50">{exercise.name}</h3>
                  {isTimeExercise && (
                    <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">Time</span>
                  )}
                </div>
                <p className="text-sm text-iron-500 mt-1">{exercise.sets?.length || 0} sets</p>
              </div>
              <div className="divide-y divide-iron-800/50">
                {exercise.sets?.map((set, setIndex) => {
                  const hasActual = isTimeExercise ? set.actualTime : (set.actualWeight || set.actualReps)
                  const e1rm = !isTimeExercise && hasActual && set.actualWeight && set.actualReps && parseInt(set.actualReps) > 1
                    ? calculateE1RM(parseFloat(set.actualWeight), parseInt(set.actualReps))
                    : null
                  return (
                    <div key={setIndex} className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-iron-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-lg font-bold text-iron-400">{setIndex + 1}</span>
                        </div>
                        <div className="flex-1">
                          {isTimeExercise ? (
                            /* TIME EXERCISE */
                            !isCompleted ? (
                              <div className="text-2xl font-bold text-iron-100">
                                {set.prescribedTime || '—'} seconds
                              </div>
                            ) : (
                              <>
                                <div className="text-sm text-iron-500 mb-1">
                                  Target: {set.prescribedTime || '—'}s
                                </div>
                                {hasActual ? (
                                  <span className="text-2xl font-bold text-flame-400">
                                    {set.actualTime || '—'} seconds
                                  </span>
                                ) : (
                                  <span className="text-lg text-iron-600">Not logged</span>
                                )}
                              </>
                            )
                          ) : !isCompleted ? (
                            /* SCHEDULED: Show target prominently */
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-2xl font-bold text-iron-100">
                                {set.prescribedWeight || '—'} lbs × {set.prescribedReps || '—'}
                              </span>
                            </div>
                          ) : (
                            /* COMPLETED: Show target small, actual big */
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
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {set.rpe && <span className={`text-sm font-semibold ${getRPEColor(set.rpe)}`}>RPE {set.rpe}</span>}
                          {set.painLevel > 0 && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPainColor(set.painLevel)}`}>Pain {set.painLevel}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {exercise.notes && (
                <div className="px-4 pb-4">
                  <div className="flex items-start gap-2 bg-iron-800/30 rounded-lg p-3">
                    <MessageSquare className="w-4 h-4 text-iron-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-iron-400">{exercise.notes}</p>
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>

        {(!workout.exercises || workout.exercises.length === 0) && (
          <div className="card-steel p-8 text-center">
            <Users className="w-12 h-12 text-iron-700 mx-auto mb-3" />
            <p className="text-iron-500">No exercises in this workout</p>
          </div>
        )}

        {/* Action Button */}
        {canLog && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800">
            <button
              onClick={() => setIsLogging(true)}
              className={`w-full py-4 text-lg flex items-center justify-center gap-2 ${isCompleted ? 'btn-secondary' : 'btn-primary'}`}
            >
              {isCompleted ? <Pencil className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              {isCompleted ? 'Edit Logged Data' : 'Log This Workout'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ============ LOG MODE ============
  return (
    <div className="max-w-2xl mx-auto pb-36">
      <div className="sticky top-0 z-10 bg-iron-950/95 backdrop-blur-sm border-b border-iron-800 -mx-4 px-4 py-3 mb-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setIsLogging(false)} className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <h1 className="font-display text-lg text-iron-100">{isCompleted ? 'Edit Log' : 'Log Workout'}</h1>
          <button onClick={() => setRpeModalOpen(true)} className="p-2 text-iron-400 hover:text-iron-200 transition-colors">
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="card-steel p-4 mb-4">
        <label className="block text-sm text-iron-400 mb-2">Workout Notes</label>
        <textarea
          value={workoutNotes}
          onChange={(e) => setWorkoutNotes(e.target.value)}
          placeholder="How did the workout go?"
          rows={2}
          className="w-full input-field text-sm resize-none"
        />
      </div>

      <div className="space-y-4">
        {exercises.map((exercise, exerciseIndex) => {
          const isTimeExercise = exercise.type === 'time' || exercise.sets?.some(s => s.prescribedTime || s.actualTime)
          
          return (
          <div key={exerciseIndex} className="card-steel p-4">
            <h3 className="font-semibold text-iron-100 text-xl mb-4">{exercise.name}</h3>
            <div className="space-y-4">
              {exercise.sets?.map((set, setIndex) => (
                <div key={setIndex} className="bg-iron-800/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-medium text-iron-200">Set {setIndex + 1}</span>
                    <span className="text-sm text-iron-500 bg-iron-800 px-2 py-1 rounded">
                      Target: {isTimeExercise 
                        ? `${set.prescribedTime || '—'}s`
                        : `${set.prescribedWeight || '—'} × ${set.prescribedReps || '—'}`
                      }
                    </span>
                  </div>
                  {isTimeExercise ? (
                    <div className="mb-3">
                      <label className="block text-xs text-flame-400 mb-1 font-medium">Time (seconds)</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={set.actualTime || ''}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualTime', e.target.value)}
                        placeholder={set.prescribedTime || '—'}
                        className="w-full input-field text-xl py-3 px-4 text-center font-semibold"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs text-flame-400 mb-1 font-medium">Weight</label>
                        <input
                          type="text"
                          value={set.actualWeight || ''}
                          onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualWeight', e.target.value)}
                          placeholder={set.prescribedWeight || 'lbs'}
                          className="w-full input-field text-xl py-3 px-4 text-center font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-flame-400 mb-1 font-medium">Reps</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={set.actualReps || ''}
                          onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualReps', e.target.value)}
                          placeholder={set.prescribedReps || '—'}
                          className="w-full input-field text-xl py-3 px-4 text-center font-semibold"
                        />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-iron-500 mb-1">RPE</label>
                      <select
                        value={set.rpe || ''}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'rpe', e.target.value)}
                        className="w-full input-field py-2 px-3"
                      >
                        <option value="">—</option>
                        {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-iron-500 mb-1">Pain Level</label>
                      <select
                        value={set.painLevel || 0}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'painLevel', parseInt(e.target.value) || 0)}
                        className="w-full input-field py-2 px-3"
                      >
                        <option value="0">None</option>
                        {[1,2,3,4,5,6,7,8,9,10].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <label className="block text-xs text-iron-500 mb-1">Notes for {exercise.name}</label>
              <textarea
                value={exercise.notes || ''}
                onChange={(e) => updateExerciseNotes(exerciseIndex, e.target.value)}
                placeholder="How did this exercise feel?"
                rows={2}
                className="w-full input-field text-sm resize-none"
              />
            </div>
          </div>
        )})}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800">
        <div className="flex gap-3 mb-3">
          <button onClick={() => setIsLogging(false)} className="btn-secondary flex-1 py-3">Cancel</button>
          <button onClick={handleSaveProgress} disabled={saving} className="btn-secondary flex-1 py-3">Save Progress</button>
        </div>
        <button onClick={handleComplete} disabled={saving} className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2">
          {saving ? 'Saving...' : <><Check className="w-5 h-5" />{isCompleted ? 'Update' : 'Complete'}</>}
        </button>
        <p className="text-xs text-iron-500 text-center mt-2">Empty fields filled with targets</p>
      </div>

      {/* RPE Info Modal */}
      {rpeModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-iron-900 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-iron-100">RPE Scale</h3>
              <button onClick={() => setRpeModalOpen(false)} className="p-2 text-iron-400 hover:text-iron-200"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-iron-400 text-sm mb-4">Rate of Perceived Exertion</p>
            <div className="space-y-2">
              {[
                { value: 10, label: 'Max effort - could not do more' },
                { value: 9, label: 'Very hard - 1 rep left' },
                { value: 8, label: 'Hard - 2 reps left' },
                { value: 7, label: 'Challenging - 3 reps left' },
                { value: 6, label: 'Moderate - 4+ reps left' },
              ].map(({ value, label }) => (
                <div key={value} className="flex items-center gap-3 text-sm">
                  <span className="w-8 h-8 rounded-lg bg-flame-500/20 text-flame-400 flex items-center justify-center font-medium">{value}</span>
                  <span className="text-iron-300">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}