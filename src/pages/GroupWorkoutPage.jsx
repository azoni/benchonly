import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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
  ChevronDown,
  ChevronUp,
  Save
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { groupWorkoutService, groupService } from '../services/firestore'

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
  const { user } = useAuth()
  const [workout, setWorkout] = useState(null)
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [exercises, setExercises] = useState([])
  const [expandedExercises, setExpandedExercises] = useState({})
  const [rpeModalOpen, setRpeModalOpen] = useState(false)

  useEffect(() => {
    loadWorkout()
  }, [id])

  const loadWorkout = async () => {
    try {
      const data = await groupWorkoutService.get(id)
      if (data) {
        setWorkout(data)
        // Initialize exercises for editing
        if (data.exercises) {
          setExercises(data.exercises.map(ex => ({
            ...ex,
            sets: ex.sets?.map(set => ({ ...set })) || []
          })))
          // Expand all exercises by default
          const expanded = {}
          data.exercises.forEach((_, i) => expanded[i] = true)
          setExpandedExercises(expanded)
        }
        // Load group info
        const groupData = await groupService.get(data.groupId)
        setGroup(groupData)
      }
    } catch (error) {
      console.error('Error loading workout:', error)
    } finally {
      setLoading(false)
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

  const handleSaveProgress = async () => {
    setSaving(true)
    try {
      await groupWorkoutService.update(id, { exercises })
      setWorkout(prev => ({ ...prev, exercises }))
      setIsEditing(false)
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
      await groupWorkoutService.complete(id, { exercises })
      setWorkout(prev => ({ ...prev, exercises, status: 'completed' }))
      setIsEditing(false)
    } catch (error) {
      console.error('Error completing workout:', error)
      alert('Failed to complete workout')
    } finally {
      setSaving(false)
    }
  }

  const toggleExercise = (index) => {
    setExpandedExercises(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  const safeFormatDate = (date) => {
    if (!date) return ''
    try {
      const dateObj = date?.toDate ? date.toDate() : new Date(date)
      if (isNaN(dateObj.getTime())) return ''
      return format(dateObj, 'EEE, MMM d')
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
        <button onClick={() => navigate(-1)} className="btn-primary">
          Go Back
        </button>
      </div>
    )
  }

  const isCompleted = workout.status === 'completed'
  const isOwner = workout.assignedTo === user?.uid
  const isAdmin = workout.groupAdmins?.includes(user?.uid)
  const canEdit = (isOwner || isAdmin) && !isCompleted

  // ============ VIEW MODE ============
  if (!isEditing) {
    return (
      <div className="max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-iron-950/95 backdrop-blur-sm border-b border-iron-800 -mx-4 px-4 py-3 mb-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-xs font-medium">
                Group
              </span>
              {isCompleted ? (
                <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">
                  Done
                </span>
              ) : (
                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-medium">
                  Assigned
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Workout Header Card */}
        <div className="card-steel p-5 mb-4">
          <h1 className="text-2xl font-display text-iron-50 mb-3">
            {workout.name}
          </h1>

          <div className="flex flex-wrap gap-3 text-sm">
            <div className="flex items-center gap-2 text-iron-400">
              <Calendar className="w-4 h-4 text-flame-400" />
              <span>{safeFormatDate(workout.date)}</span>
            </div>

            <div className="flex items-center gap-2 text-iron-400">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>{group?.name || 'Group Workout'}</span>
            </div>
          </div>

          {!isOwner && !isAdmin && (
            <p className="mt-3 text-sm text-iron-500 bg-iron-800/50 rounded-lg p-3">
              This workout was assigned to another member. You can view but not edit.
            </p>
          )}
          
          {!isOwner && isAdmin && (
            <p className="mt-3 text-sm text-cyan-400/80 bg-cyan-500/10 rounded-lg p-3">
              You're viewing as admin. You can log this workout on behalf of the member.
            </p>
          )}
        </div>

        {/* Exercises - Clean View */}
        <div className="space-y-3">
          {workout.exercises?.map((exercise, exerciseIndex) => (
            <div key={exerciseIndex} className="card-steel overflow-hidden">
              {/* Exercise Header */}
              <button
                onClick={() => toggleExercise(exerciseIndex)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div>
                  <h3 className="font-semibold text-iron-100">{exercise.name}</h3>
                  <p className="text-sm text-iron-500">{exercise.sets?.length || 0} sets</p>
                </div>
                {expandedExercises[exerciseIndex] ? (
                  <ChevronUp className="w-5 h-5 text-iron-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-iron-500" />
                )}
              </button>

              {/* Sets - Clean Display */}
              {expandedExercises[exerciseIndex] && (
                <div className="border-t border-iron-800">
                  {exercise.sets?.map((set, setIndex) => {
                    const hasActual = set.actualWeight || set.actualReps
                    const e1rm = hasActual && set.actualWeight && set.actualReps && parseInt(set.actualReps) > 1
                      ? calculateE1RM(parseFloat(set.actualWeight), parseInt(set.actualReps))
                      : null

                    return (
                      <div
                        key={setIndex}
                        className={`p-4 flex items-center gap-4 ${setIndex > 0 ? 'border-t border-iron-800/50' : ''}`}
                      >
                        {/* Set Number */}
                        <div className="w-8 h-8 rounded-lg bg-iron-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-medium text-iron-400">{setIndex + 1}</span>
                        </div>

                        {/* Set Info */}
                        <div className="flex-1 min-w-0">
                          {/* Target */}
                          <div className="text-sm text-iron-500 mb-1">
                            Target: {set.prescribedWeight || '—'} lbs × {set.prescribedReps || '—'}
                          </div>

                          {/* Actual (if exists) */}
                          {hasActual ? (
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-semibold text-flame-400">
                                {set.actualWeight || '—'} × {set.actualReps || '—'}
                              </span>
                              {e1rm && (
                                <span className="text-xs text-iron-500 bg-iron-800 px-2 py-0.5 rounded">
                                  e1RM: {e1rm}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-iron-600 text-sm">Not logged yet</span>
                          )}
                        </div>

                        {/* RPE & Pain */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {set.rpe && (
                            <span className={`text-sm font-medium ${getRPEColor(set.rpe)}`}>
                              @{set.rpe}
                            </span>
                          )}
                          {set.painLevel > 0 && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPainColor(set.painLevel)}`}>
                              P{set.painLevel}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* No Exercises */}
        {(!workout.exercises || workout.exercises.length === 0) && (
          <div className="card-steel p-8 text-center">
            <Users className="w-12 h-12 text-iron-700 mx-auto mb-3" />
            <p className="text-iron-500">No exercises in this workout</p>
          </div>
        )}

        {/* Action Button - Fixed at Bottom */}
        {canEdit && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800">
            <button
              onClick={() => setIsEditing(true)}
              className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              Log This Workout
            </button>
          </div>
        )}
      </div>
    )
  }

  // ============ EDIT MODE ============
  return (
    <div className="max-w-2xl mx-auto pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-iron-950/95 backdrop-blur-sm border-b border-iron-800 -mx-4 px-4 py-3 mb-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsEditing(false)}
            className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h1 className="font-display text-lg text-iron-100">Log Workout</h1>
          <button
            onClick={() => setRpeModalOpen(true)}
            className="p-2 text-iron-400 hover:text-iron-200 transition-colors"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Exercises for Logging */}
      <div className="space-y-4">
        {exercises.map((exercise, exerciseIndex) => (
          <div key={exerciseIndex} className="card-steel p-4">
            <h3 className="font-semibold text-iron-100 text-lg mb-4">{exercise.name}</h3>

            <div className="space-y-4">
              {exercise.sets?.map((set, setIndex) => (
                <div key={setIndex} className="bg-iron-800/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-iron-300">Set {setIndex + 1}</span>
                    <span className="text-xs text-iron-500">
                      Target: {set.prescribedWeight}lbs × {set.prescribedReps}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-flame-400 mb-1">Weight (lbs)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={set.actualWeight || ''}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualWeight', e.target.value)}
                        placeholder={set.prescribedWeight || '—'}
                        className="w-full input-field text-lg py-3 px-4 text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-flame-400 mb-1">Reps</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={set.actualReps || ''}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualReps', e.target.value)}
                        placeholder={set.prescribedReps || '—'}
                        className="w-full input-field text-lg py-3 px-4 text-center"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-iron-500 mb-1">RPE</label>
                      <select
                        value={set.rpe || ''}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'rpe', e.target.value)}
                        className="w-full input-field py-2 px-3"
                      >
                        <option value="">—</option>
                        {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-iron-500 mb-1">Pain</label>
                      <select
                        value={set.painLevel || 0}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'painLevel', parseInt(e.target.value) || 0)}
                        className="w-full input-field py-2 px-3"
                      >
                        <option value="0">None</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800">
        <div className="flex gap-3 mb-3">
          <button
            onClick={() => setIsEditing(false)}
            className="btn-secondary flex-1 py-3"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveProgress}
            disabled={saving}
            className="btn-secondary flex-1 py-3 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Progress
          </button>
        </div>
        <button
          onClick={handleComplete}
          disabled={saving}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          {saving ? 'Saving...' : (
            <>
              <Check className="w-5 h-5" />
              Complete Workout
            </>
          )}
        </button>
      </div>

      {/* RPE Info Modal */}
      {rpeModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-iron-900 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-iron-100">RPE Scale</h3>
              <button
                onClick={() => setRpeModalOpen(false)}
                className="p-2 text-iron-400 hover:text-iron-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-iron-400 text-sm mb-4">
              Rate of Perceived Exertion - how hard did the set feel?
            </p>
            <div className="space-y-2">
              {[
                { value: 10, label: 'Max effort - could not do more' },
                { value: 9, label: 'Very hard - 1 rep left' },
                { value: 8, label: 'Hard - 2 reps left' },
                { value: 7, label: 'Challenging - 3 reps left' },
                { value: 6, label: 'Moderate - 4+ reps left' },
              ].map(({ value, label }) => (
                <div key={value} className="flex items-center gap-3 text-sm">
                  <span className="w-8 h-8 rounded-lg bg-flame-500/20 text-flame-400 flex items-center justify-center font-medium">
                    {value}
                  </span>
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