import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
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
  ChevronDown,
  ChevronUp
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

export default function WorkoutDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isGuest } = useAuth()
  const [workout, setWorkout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showMenu, setShowMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  const [exercises, setExercises] = useState([])
  const [saving, setSaving] = useState(false)
  const [expandedExercises, setExpandedExercises] = useState({})

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
        // Initialize exercises with current data for logging
        if (data?.exercises) {
          setExercises(data.exercises.map(ex => ({
            ...ex,
            sets: ex.sets?.map(set => ({ ...set })) || []
          })))
          // Expand all exercises by default
          const expanded = {}
          data.exercises.forEach((_, i) => expanded[i] = true)
          setExpandedExercises(expanded)
        }
      } catch (error) {
        console.error('Error fetching workout:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchWorkout()
  }, [id, user, isGuest])

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this workout?')) return
    
    setDeleting(true)
    if (isGuest) {
      navigate('/workouts')
      return
    }
    try {
      await workoutService.delete(id)
      navigate('/workouts')
    } catch (error) {
      console.error('Error deleting workout:', error)
      setDeleting(false)
    }
  }

  const updateSetActual = (exerciseIndex, setIndex, field, value) => {
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

  const handleCompleteWorkout = async () => {
    setSaving(true)
    try {
      if (!isGuest) {
        await workoutService.update(id, {
          exercises,
          status: 'completed'
        })
      }
      setWorkout(prev => ({ ...prev, exercises, status: 'completed' }))
      setIsLogging(false)
    } catch (error) {
      console.error('Error completing workout:', error)
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
        <div className="w-16 h-16 bg-iron-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <Activity className="w-8 h-8 text-iron-600" />
        </div>
        <h2 className="text-xl font-display text-iron-200 mb-2">Workout Not Found</h2>
        <p className="text-iron-500 mb-6">This workout may have been deleted or doesn't exist.</p>
        <Link to="/workouts" className="btn-primary">
          Back to Workouts
        </Link>
      </div>
    )
  }

  const isScheduled = workout.status === 'scheduled'
  const isCardio = workout.workoutType === 'cardio'

  // Clean View Mode (default)
  if (!isLogging) {
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
            
            <div className="flex items-center gap-1">
              {/* Status Badge */}
              {isCardio ? (
                <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs font-medium">
                  Cardio
                </span>
              ) : isScheduled ? (
                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-medium">
                  Scheduled
                </span>
              ) : (
                <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">
                  Done
                </span>
              )}
              
              {/* Menu */}
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
                        className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Workout Header Card */}
        <div className="card-steel p-5 mb-4">
          <h1 className="text-2xl font-display text-iron-50 mb-3">
            {workout.name || 'Untitled Workout'}
          </h1>
          
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="flex items-center gap-2 text-iron-400">
              <Calendar className="w-4 h-4 text-flame-400" />
              <span>{workout.date ? format(getDisplayDate(workout.date), 'EEE, MMM d') : 'No date'}</span>
            </div>
            
            {workout.duration && (
              <div className="flex items-center gap-2 text-iron-400">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>{workout.duration} min</span>
              </div>
            )}
            
            {workout.distance && (
              <div className="flex items-center gap-2 text-iron-400">
                <MapPin className="w-4 h-4 text-purple-400" />
                <span>{workout.distance} mi</span>
              </div>
            )}
          </div>
          
          {workout.notes && (
            <p className="mt-3 text-iron-400 text-sm">{workout.notes}</p>
          )}
        </div>

        {/* Cardio Details */}
        {isCardio && (
          <div className="card-steel p-5 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-iron-800/50 rounded-xl p-4 text-center">
                <Activity className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                <p className="text-lg font-medium text-iron-100">
                  {ACTIVITY_METS[workout.activityType]?.label || workout.activityType || 'Activity'}
                </p>
                <p className="text-xs text-iron-500">Activity</p>
              </div>
              
              {workout.estimatedCalories > 0 && (
                <div className="bg-flame-500/10 rounded-xl p-4 text-center">
                  <Flame className="w-6 h-6 text-flame-400 mx-auto mb-2" />
                  <p className="text-lg font-medium text-flame-400">{workout.estimatedCalories}</p>
                  <p className="text-xs text-iron-500">Calories</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Exercises - Clean Mobile View */}
        {!isCardio && workout.exercises?.length > 0 && (
          <div className="space-y-3">
            {workout.exercises.map((exercise, exerciseIndex) => (
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
                            ) : isScheduled ? (
                              <span className="text-iron-600 text-sm">Not logged yet</span>
                            ) : null}
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
                
                {exercise.notes && expandedExercises[exerciseIndex] && (
                  <div className="px-4 pb-4">
                    <p className="text-sm text-iron-500 italic bg-iron-800/30 rounded-lg p-3">
                      {exercise.notes}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* No Exercises */}
        {!isCardio && (!workout.exercises || workout.exercises.length === 0) && (
          <div className="card-steel p-8 text-center">
            <Activity className="w-12 h-12 text-iron-700 mx-auto mb-3" />
            <p className="text-iron-500">No exercises in this workout</p>
          </div>
        )}

        {/* Action Button - Fixed at Bottom */}
        {isScheduled && !isCardio && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800">
            <button
              onClick={() => setIsLogging(true)}
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

  // Logging Mode
  return (
    <div className="max-w-2xl mx-auto pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-iron-950/95 backdrop-blur-sm border-b border-iron-800 -mx-4 px-4 py-3 mb-4">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setIsLogging(false)}
            className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h1 className="font-display text-lg text-iron-100">Log Workout</h1>
          <div className="w-9" /> {/* Spacer */}
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
                        onChange={(e) => updateSetActual(exerciseIndex, setIndex, 'actualWeight', e.target.value)}
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
                        onChange={(e) => updateSetActual(exerciseIndex, setIndex, 'actualReps', e.target.value)}
                        placeholder={set.prescribedReps || '—'}
                        className="w-full input-field text-lg py-3 px-4 text-center"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-iron-500 mb-1">RPE (optional)</label>
                      <select
                        value={set.rpe || ''}
                        onChange={(e) => updateSetActual(exerciseIndex, setIndex, 'rpe', e.target.value)}
                        className="w-full input-field py-2 px-3"
                      >
                        <option value="">—</option>
                        {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-iron-500 mb-1">Pain (optional)</label>
                      <select
                        value={set.painLevel || ''}
                        onChange={(e) => updateSetActual(exerciseIndex, setIndex, 'painLevel', parseInt(e.target.value) || 0)}
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
          </div>
        ))}
      </div>

      {/* Complete Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800 flex gap-3">
        <button
          onClick={() => setIsLogging(false)}
          className="btn-secondary flex-1 py-3"
        >
          Cancel
        </button>
        <button
          onClick={handleCompleteWorkout}
          disabled={saving}
          className="btn-primary flex-1 py-3 flex items-center justify-center gap-2"
        >
          {saving ? 'Saving...' : (
            <>
              <Check className="w-5 h-5" />
              Complete
            </>
          )}
        </button>
      </div>
    </div>
  )
}