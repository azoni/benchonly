import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, 
  Edit2, 
  Trash2, 
  Calendar, 
  Clock, 
  MoreVertical,
  Check,
  Play,
  Flame,
  Activity,
  MapPin,
  X,
  MessageSquare,
  Pencil,
  Dumbbell,
  Target,
  Plus,
  Brain,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react'
import { workoutService } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { getDisplayDate } from '../utils/dateUtils'
import { ACTIVITY_METS } from '../services/calorieService'

// Calculate estimated 1RM using Epley formula
const calculateE1RM = (weight, reps) => {
  if (!weight || !reps || reps < 1) return null
  if (reps === 1) return weight
  if (reps > 30) return null
  return Math.round(weight * (1 + reps / 30))
}

// Determine exercise type from data
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

export default function WorkoutDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isGuest } = useAuth()
  const [workout, setWorkout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showMenu, setShowMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  const [exercises, setExercises] = useState([])
  const [saving, setSaving] = useState(false)
  const [workoutNotes, setWorkoutNotes] = useState('')
  const [rpeModalOpen, setRpeModalOpen] = useState(false)
  const [aiNotesExpanded, setAiNotesExpanded] = useState(false)

  useEffect(() => {
    async function fetchWorkout() {
      if (!id || !user) return
      try {
        let data
        if (isGuest) {
          const { getSampleWorkouts } = await import('../context/AuthContext')
          data = getSampleWorkouts().find(w => w.id === id)
        } else {
          data = await workoutService.getById(id)
        }
        setWorkout(data)
        setWorkoutNotes(data?.notes || '')
        if (data?.exercises) {
          setExercises(data.exercises.map(ex => ({
            ...ex,
            notes: ex.notes || '',
            sets: ex.sets?.map(set => ({ ...set })) || []
          })))
        }
      } catch (error) {
        console.error('Error fetching workout:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchWorkout()
  }, [id, user, isGuest])

  const handleBack = () => {
    if (location.state?.from) {
      navigate(location.state.from)
    } else {
      navigate(-1)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      if (isGuest) {
        navigate('/workouts')
        return
      }
      await workoutService.delete(id)
      navigate('/workouts')
    } catch (error) {
      console.error('Error deleting workout:', error)
      setDeleting(false)
      setConfirmDelete(false)
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

  const addSet = (exerciseIndex) => {
    setExercises(prev => {
      const newExercises = [...prev]
      const exercise = newExercises[exerciseIndex]
      const lastSet = exercise.sets[exercise.sets.length - 1]
      const type = getExerciseType(exercise)

      let newSet = { rpe: '', painLevel: 0, completed: false }

      if (type === 'time') {
        newSet = { ...newSet, prescribedTime: lastSet?.prescribedTime || '', actualTime: '' }
      } else if (type === 'bodyweight') {
        newSet = { ...newSet, prescribedReps: lastSet?.prescribedReps || '', actualReps: '' }
      } else {
        newSet = {
          ...newSet,
          prescribedWeight: lastSet?.prescribedWeight || '',
          prescribedReps: lastSet?.prescribedReps || '',
          actualWeight: '', actualReps: '',
        }
      }

      newExercises[exerciseIndex] = { ...exercise, sets: [...exercise.sets, newSet] }
      return newExercises
    })
  }

  const removeSet = (exerciseIndex, setIndex) => {
    setExercises(prev => {
      const newExercises = [...prev]
      const exercise = newExercises[exerciseIndex]
      if (exercise.sets.length <= 1) return prev
      newExercises[exerciseIndex] = {
        ...exercise,
        sets: exercise.sets.filter((_, i) => i !== setIndex),
      }
      return newExercises
    })
  }

  // Build save payload preserving AI-generated fields
  const buildSavePayload = (exerciseData) => {
    const payload = { exercises: exerciseData, notes: workoutNotes }
    if (workout?.coachingNotes) payload.coachingNotes = workout.coachingNotes
    if (workout?.personalNotes) payload.personalNotes = workout.personalNotes
    if (workout?.description) payload.description = workout.description
    return payload
  }

  const handleSaveProgress = async () => {
    setSaving(true)
    try {
      const payload = buildSavePayload(exercises)
      if (!isGuest) {
        await workoutService.update(id, payload)
      }
      setWorkout(prev => ({ ...prev, ...payload }))
      setIsLogging(false)
    } catch (error) {
      console.error('Error saving:', error)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleComplete = async () => {
    setSaving(true)
    try {
      // Auto-fill blank fields with prescribed values
      const filledExercises = exercises.map(ex => {
        const type = getExerciseType(ex)
        return {
          ...ex,
          sets: ex.sets.map(set => {
            if (type === 'time') {
              return { ...set, actualTime: set.actualTime || set.prescribedTime || '' }
            }
            if (type === 'bodyweight') {
              return { ...set, actualReps: set.actualReps || set.prescribedReps || '' }
            }
            return {
              ...set,
              actualWeight: set.actualWeight || set.prescribedWeight || '',
              actualReps: set.actualReps || set.prescribedReps || ''
            }
          })
        }
      })
      
      if (!isGuest) {
        const payload = buildSavePayload(filledExercises)
        await workoutService.complete(id, payload)
      }
      setWorkout(prev => ({ ...prev, exercises: filledExercises, notes: workoutNotes, status: 'completed',
        ...(workout?.coachingNotes && { coachingNotes: workout.coachingNotes }),
        ...(workout?.personalNotes && { personalNotes: workout.personalNotes }),
        ...(workout?.description && { description: workout.description }),
      }))
      setExercises(filledExercises)
      setIsLogging(false)
    } catch (error) {
      console.error('Error completing:', error)
      alert('Failed to complete')
    } finally {
      setSaving(false)
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
        <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!workout) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <Dumbbell className="w-16 h-16 text-iron-700 mx-auto mb-4" />
        <h2 className="text-xl font-display text-iron-200 mb-2">Workout Not Found</h2>
        <button onClick={handleBack} className="btn-primary mt-4">Go Back</button>
      </div>
    )
  }

  const isScheduled = workout.status === 'scheduled'
  const isCardio = workout.workoutType === 'cardio'
  const backLabel = location.state?.fromLabel || 'Back'

  // Calculate totals for summary
  const totalSets = workout.exercises?.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0) || 0
  const totalExercises = workout.exercises?.length || 0

  // ============ VIEW MODE ============
  if (!isLogging) {
    return (
      <div className="max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-iron-950/95 backdrop-blur-sm border-b border-iron-800 -mx-4 px-4 py-3 mb-6">
          <div className="flex items-center justify-between">
            <button onClick={handleBack} className="flex items-center gap-2 text-iron-400 hover:text-iron-200 transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">{backLabel}</span>
            </button>
            
            <div className="flex items-center gap-2">
              {isScheduled ? (
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">
                  To Do
                </span>
              ) : (
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">
                  Completed
                </span>
              )}
              
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 text-iron-400 hover:text-iron-200 transition-colors"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
                
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 w-44 bg-iron-800 border border-iron-700 rounded-xl shadow-xl z-20 overflow-hidden">
                      <Link
                        to={`/workouts/${id}/edit`}
                        className="flex items-center gap-3 px-4 py-3 text-iron-300 hover:bg-iron-700 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </Link>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className={`w-full flex items-center gap-3 px-4 py-3 transition-colors disabled:opacity-50 ${
                          confirmDelete 
                            ? 'text-white bg-red-500 hover:bg-red-600' 
                            : 'text-red-400 hover:bg-red-500/10'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                        {deleting ? 'Deleting...' : confirmDelete ? 'Tap to confirm' : 'Delete'}
                      </button>
                      {confirmDelete && (
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-iron-400 hover:bg-iron-700 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Workout Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-display text-iron-50 mb-3">
            {workout.name || 'Untitled Workout'}
          </h1>
          
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-iron-400">
              <Calendar className="w-4 h-4 text-flame-400" />
              <span>{workout.date ? format(getDisplayDate(workout.date), 'EEEE, MMM d') : 'No date'}</span>
            </div>
            {!isCardio && (
              <div className="flex items-center gap-2 text-iron-400">
                <Dumbbell className="w-4 h-4 text-blue-400" />
                <span>{totalExercises} exercises · {totalSets} sets</span>
              </div>
            )}
          </div>
        </div>

        {/* AI Coaching Notes */}
        {(workout.coachingNotes || workout.personalNotes) && (
          <div className="card-steel mb-6 overflow-hidden">
            <button
              onClick={() => setAiNotesExpanded(!aiNotesExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-iron-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-flame-400" />
                <span className="text-sm font-medium text-iron-200">AI Coaching Notes</span>
              </div>
              {aiNotesExpanded ? <ChevronUp className="w-4 h-4 text-iron-500" /> : <ChevronDown className="w-4 h-4 text-iron-500" />}
            </button>
            <AnimatePresence>
              {aiNotesExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 max-h-64 overflow-y-auto space-y-3">
                    {workout.coachingNotes && (
                      <div>
                        <p className="text-xs text-iron-500 uppercase tracking-wider mb-1">Coaching Notes</p>
                        <p className="text-sm text-iron-300 leading-relaxed">{workout.coachingNotes}</p>
                      </div>
                    )}
                    {workout.personalNotes && (
                      <div>
                        <p className="text-xs text-iron-500 uppercase tracking-wider mb-1">Your Notes</p>
                        <p className="text-sm text-iron-300 leading-relaxed">{workout.personalNotes}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Workout Notes */}
        {workout.notes && (
          <div className="card-steel p-4 mb-6">
            <p className="text-iron-300">{workout.notes}</p>
          </div>
        )}

        {/* Cardio Details */}
        {isCardio && (
          <div className="card-steel p-5 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-iron-800/50 rounded-xl p-4 text-center">
                <Activity className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                <p className="text-xl font-semibold text-iron-100">
                  {ACTIVITY_METS[workout.activityType]?.label || workout.activityType || 'Activity'}
                </p>
                <p className="text-xs text-iron-500 mt-1">Activity</p>
              </div>
              
              {workout.estimatedCalories > 0 && (
                <div className="bg-flame-500/10 rounded-xl p-4 text-center">
                  <Flame className="w-8 h-8 text-flame-400 mx-auto mb-2" />
                  <p className="text-xl font-semibold text-flame-400">{workout.estimatedCalories}</p>
                  <p className="text-xs text-iron-500 mt-1">Calories</p>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              {workout.duration && (
                <div className="flex items-center gap-3 p-3 bg-iron-800/30 rounded-lg">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="text-lg font-semibold text-iron-100">{workout.duration} min</p>
                    <p className="text-xs text-iron-500">Duration</p>
                  </div>
                </div>
              )}
              {workout.distance && (
                <div className="flex items-center gap-3 p-3 bg-iron-800/30 rounded-lg">
                  <MapPin className="w-5 h-5 text-purple-400" />
                  <div>
                    <p className="text-lg font-semibold text-iron-100">{workout.distance} mi</p>
                    <p className="text-xs text-iron-500">Distance</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Overview (Scheduled Only) */}
        {isScheduled && !isCardio && workout.exercises?.length > 0 && (
          <div className="card-steel p-4 mb-6 bg-yellow-500/5 border-yellow-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-yellow-400" />
              <h3 className="font-semibold text-iron-100">Today's Targets</h3>
            </div>
            <div className="space-y-2">
              {workout.exercises.map((exercise, i) => {
                const firstSet = exercise.sets?.[0]
                const allSameSets = exercise.sets?.every(s => 
                  s.prescribedWeight === firstSet?.prescribedWeight && 
                  s.prescribedReps === firstSet?.prescribedReps
                )
                
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-iron-800/50 last:border-0">
                    <span className="font-medium text-iron-200">{exercise.name}</span>
                    <span className="text-yellow-400 font-semibold">
                      {exercise.sets?.length}×{' '}
                      {exercise.type === 'time' || firstSet?.prescribedTime
                        ? `${firstSet?.prescribedTime || '—'}s`
                        : allSameSets 
                          ? `${firstSet?.prescribedWeight || '—'}lbs × ${firstSet?.prescribedReps || '—'}`
                          : 'varied'
                      }
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Exercises - Detailed View */}
        {!isCardio && workout.exercises?.length > 0 && (
          <div className="space-y-4">
            {workout.exercises.map((exercise, exerciseIndex) => {
              const isTimeExercise = exercise.type === 'time' || exercise.sets?.some(s => s.prescribedTime || s.actualTime)
              
              return (
              <div key={exerciseIndex} className="card-steel overflow-hidden">
                {/* Exercise Header */}
                <div className="p-4 bg-iron-800/30">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-iron-50">{exercise.name}</h3>
                    {isTimeExercise && (
                      <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">Time</span>
                    )}
                  </div>
                  <p className="text-sm text-iron-500 mt-1">{exercise.sets?.length || 0} sets</p>
                </div>
                
                {/* Sets */}
                <div className="divide-y divide-iron-800/50">
                  {exercise.sets?.map((set, setIndex) => {
                    const hasActual = isTimeExercise 
                      ? set.actualTime 
                      : (set.actualWeight || set.actualReps)
                    const e1rm = !isTimeExercise && hasActual && set.actualWeight && set.actualReps && parseInt(set.actualReps) > 1
                      ? calculateE1RM(parseFloat(set.actualWeight), parseInt(set.actualReps))
                      : null
                    
                    return (
                      <div key={setIndex} className="p-4">
                        <div className="flex items-center gap-4">
                          {/* Set Number */}
                          <div className="w-12 h-12 rounded-xl bg-iron-800 flex items-center justify-center flex-shrink-0">
                            <span className="text-xl font-bold text-iron-400">{setIndex + 1}</span>
                          </div>
                          
                          {/* Set Info */}
                          <div className="flex-1">
                            {isTimeExercise ? (
                              /* TIME EXERCISE */
                              isScheduled ? (
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
                            ) : isScheduled ? (
                              /* SCHEDULED: Show target prominently */
                              <div className="text-2xl font-bold text-iron-100">
                                {set.prescribedWeight || '—'} lbs <span className="text-iron-500">×</span> {set.prescribedReps || '—'} reps
                              </div>
                            ) : (
                              /* COMPLETED: Show target small, actual big */
                              <>
                                <div className="text-sm text-iron-500 mb-1">
                                  Target: {set.prescribedWeight || '—'} × {set.prescribedReps || '—'}
                                </div>
                                {hasActual ? (
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-2xl font-bold text-flame-400">
                                      {set.actualWeight || '—'} lbs × {set.actualReps || '—'}
                                    </span>
                                    {e1rm && (
                                      <span className="text-sm text-iron-500 bg-iron-800 px-2 py-1 rounded-lg">
                                        e1RM: {e1rm} lbs
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-lg text-iron-600">Not logged</span>
                                )}
                              </>
                            )}
                          </div>
                          
                          {/* RPE & Pain */}
                          {!isScheduled && (
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {set.rpe && (
                                <span className={`text-sm font-semibold ${getRPEColor(set.rpe)}`}>
                                  RPE {set.rpe}
                                </span>
                              )}
                              {set.painLevel > 0 && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPainColor(set.painLevel)}`}>
                                  Pain {set.painLevel}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                {/* Exercise Notes */}
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
        )}

        {/* Empty State */}
        {!isCardio && (!workout.exercises || workout.exercises.length === 0) && (
          <div className="card-steel p-8 text-center">
            <Dumbbell className="w-12 h-12 text-iron-700 mx-auto mb-3" />
            <p className="text-iron-500">No exercises in this workout</p>
          </div>
        )}

        {/* Action Button */}
        {!isCardio && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800">
            <button
              onClick={() => setIsLogging(true)}
              className={`w-full py-4 text-lg flex items-center justify-center gap-2 rounded-xl font-semibold ${
                isScheduled 
                  ? 'bg-flame-500 hover:bg-flame-600 text-white' 
                  : 'bg-iron-800 hover:bg-iron-700 text-iron-200'
              }`}
            >
              {isScheduled ? (
                <>
                  <Play className="w-6 h-6" />
                  Start Workout
                </>
              ) : (
                <>
                  <Pencil className="w-5 h-5" />
                  Edit Logged Data
                </>
              )}
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
          <h1 className="font-display text-lg text-iron-100">
            {isScheduled ? 'Log Workout' : 'Edit Log'}
          </h1>
          <button onClick={() => setRpeModalOpen(true)} className="p-2 text-iron-400 hover:text-iron-200">
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Workout Notes */}
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

      {/* Exercises */}
      <div className="space-y-4">
        {exercises.map((exercise, exerciseIndex) => {
          const type = getExerciseType(exercise)
          const typeTag = getTypeTag(type)
          
          return (
          <div key={exerciseIndex} className="card-steel p-4">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="font-semibold text-iron-100 text-xl flex-1">{exercise.name}</h3>
              {typeTag && (
                <span className={`px-2 py-0.5 text-xs rounded ${typeTag.color}`}>{typeTag.label}</span>
              )}
            </div>
            
            <div className="space-y-4">
              {exercise.sets?.map((set, setIndex) => (
                <div key={setIndex} className="bg-iron-800/30 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-medium text-iron-200">Set {setIndex + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-iron-500 bg-iron-800 px-2 py-1 rounded">
                        Target: {type === 'time' 
                          ? `${set.prescribedTime || '—'}s`
                          : type === 'bodyweight'
                            ? `${set.prescribedReps || '—'} reps`
                            : `${set.prescribedWeight || '—'} × ${set.prescribedReps || '—'}`
                        }
                        {set.targetRpe ? ` @ RPE ${set.targetRpe}` : ''}
                      </span>
                      {exercise.sets.length > 1 && (
                        <button
                          onClick={() => removeSet(exerciseIndex, setIndex)}
                          className="p-1 text-iron-600 hover:text-red-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {type === 'time' ? (
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
                  ) : type === 'bodyweight' ? (
                    <div className="mb-3">
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
                        {[1,2,3,4,5,6,7,8,9,10].map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Set Button */}
            <button
              onClick={() => addSet(exerciseIndex)}
              className="mt-3 w-full py-2.5 border border-dashed border-iron-700 rounded-lg
                text-sm text-flame-400 hover:text-flame-300 hover:border-iron-600
                flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Set
            </button>
            
            {/* Exercise Notes */}
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

      {/* Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800">
        <div className="flex gap-3 mb-3">
          <button onClick={() => setIsLogging(false)} className="btn-secondary flex-1 py-3">
            Cancel
          </button>
          <button onClick={handleSaveProgress} disabled={saving} className="btn-secondary flex-1 py-3">
            Save Progress
          </button>
        </div>
        <button
          onClick={handleComplete}
          disabled={saving}
          className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2"
        >
          {saving ? 'Saving...' : (
            <>
              <Check className="w-5 h-5" />
              {isScheduled ? 'Complete Workout' : 'Update'}
            </>
          )}
        </button>
        <p className="text-xs text-iron-500 text-center mt-2">Empty fields filled with targets</p>
      </div>

      {/* RPE Modal */}
      {rpeModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-iron-900 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-iron-100">RPE Scale</h3>
              <button onClick={() => setRpeModalOpen(false)} className="p-2 text-iron-400 hover:text-iron-200">
                <X className="w-5 h-5" />
              </button>
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