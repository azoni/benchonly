import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { 
  ArrowLeft, 
  Edit2, 
  Trash2, 
  Calendar, 
  Clock, 
  Target,
  TrendingUp,
  AlertCircle,
  Share2,
  MoreVertical,
  Check,
  Play,
  CheckCircle2
} from 'lucide-react'
import { workoutService } from '../services/firestore'
import { useAuth } from '../context/AuthContext'

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
      const updated = [...prev]
      updated[exerciseIndex] = {
        ...updated[exerciseIndex],
        sets: updated[exerciseIndex].sets.map((set, idx) =>
          idx === setIndex ? { ...set, [field]: value } : set
        )
      }
      return updated
    })
  }

  const handleCompleteWorkout = async () => {
    setSaving(true)
    try {
      await workoutService.completeWorkout(id, exercises, user.uid)
      setWorkout(prev => ({ ...prev, status: 'completed', exercises }))
      setIsLogging(false)
      alert('Workout completed!')
    } catch (error) {
      console.error('Error completing workout:', error)
      alert('Failed to save workout')
    } finally {
      setSaving(false)
    }
  }

  const getRPEColor = (rpe) => {
    if (!rpe) return 'text-iron-500'
    if (rpe <= 6) return 'text-green-400'
    if (rpe <= 7) return 'text-yellow-400'
    if (rpe <= 8) return 'text-orange-400'
    return 'text-red-400'
  }

  const getPainColor = (pain) => {
    if (!pain || pain === 0) return 'bg-green-500/20 text-green-400'
    if (pain <= 3) return 'bg-yellow-500/20 text-yellow-400'
    if (pain <= 6) return 'bg-orange-500/20 text-orange-400'
    return 'bg-red-500/20 text-red-400'
  }

  // Check if workout is scheduled (not yet completed)
  const checkIfComplete = (exercises) => {
    if (!exercises || exercises.length === 0) return false
    return exercises.some(exercise => 
      exercise.sets?.some(set => set.actualWeight || set.actualReps)
    )
  }

  const isScheduled = workout?.status === 'scheduled' || (!workout?.status && !checkIfComplete(workout?.exercises))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!workout) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="card-steel p-8 text-center">
          <AlertCircle className="w-12 h-12 text-iron-500 mx-auto mb-4" />
          <h2 className="text-xl font-display text-iron-200 mb-2">Workout Not Found</h2>
          <p className="text-iron-400 mb-6">This workout may have been deleted or doesn't exist.</p>
          <Link to="/workouts" className="btn-primary">
            Back to Workouts
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-iron-400 hover:text-iron-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-lg transition-colors"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          
          {showMenu && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setShowMenu(false)} 
              />
              <div className="absolute right-0 top-full mt-2 w-48 bg-iron-800 border border-iron-700 rounded-lg shadow-xl z-20 overflow-hidden">
                <Link
                  to={`/workouts/${id}/edit`}
                  className="flex items-center gap-3 px-4 py-3 text-iron-300 hover:bg-iron-700 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Workout
                </Link>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? 'Deleting...' : 'Delete Workout'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className="mb-4">
        {isScheduled ? (
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">
            <Calendar className="w-4 h-4" />
            Scheduled
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Completed
          </span>
        )}
      </div>

      {/* Workout Info */}
      <div className="card-steel p-6 mb-6">
        <h1 className="text-2xl font-display text-iron-100 mb-4">
          {workout.name || 'Untitled Workout'}
        </h1>
        
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2 text-iron-400">
            <Calendar className="w-4 h-4" />
            <span>{workout.date ? format(workout.date.toDate ? workout.date.toDate() : new Date(workout.date), 'EEEE, MMMM d, yyyy') : 'No date'}</span>
          </div>
          
          {workout.duration && (
            <div className="flex items-center gap-2 text-iron-400">
              <Clock className="w-4 h-4" />
              <span>{workout.duration} min</span>
            </div>
          )}
        </div>
        
        {workout.notes && (
          <p className="mt-4 text-iron-400 text-sm leading-relaxed">
            {workout.notes}
          </p>
        )}

        {/* Log Workout Button for Scheduled Workouts */}
        {isScheduled && !isLogging && (
          <button
            onClick={() => setIsLogging(true)}
            className="mt-6 btn-primary w-full flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5" />
            Log This Workout
          </button>
        )}
      </div>

      {/* Exercises */}
      <div className="space-y-4">
        <h2 className="text-lg font-display text-iron-300">Exercises</h2>
        
        {(isLogging ? exercises : workout.exercises)?.length > 0 ? (
          (isLogging ? exercises : workout.exercises).map((exercise, exerciseIndex) => (
            <div key={exerciseIndex} className="card-steel p-5">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-iron-100">
                  {exercise.name}
                </h3>
              </div>
              
              {/* Sets Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-iron-500 text-left">
                      <th className="pb-2 pr-4 w-12">Set</th>
                      <th className="pb-2 pr-4">Target</th>
                      {(!isScheduled || isLogging) && <th className="pb-2 pr-4">Actual</th>}
                      {(!isScheduled || isLogging) && <th className="pb-2 pr-4">RPE</th>}
                      {(!isScheduled || isLogging) && <th className="pb-2">Pain</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {exercise.sets?.map((set, setIndex) => (
                      <tr key={setIndex} className="border-t border-iron-800">
                        <td className="py-3 pr-4 text-iron-400">{setIndex + 1}</td>
                        <td className="py-3 pr-4 text-iron-200">
                          {set.prescribedWeight && `${set.prescribedWeight} lbs`}
                          {set.prescribedWeight && set.prescribedReps && ' × '}
                          {set.prescribedReps && `${set.prescribedReps} reps`}
                          {!set.prescribedWeight && !set.prescribedReps && '—'}
                        </td>
                        
                        {/* Actual Values - Show inputs when logging, values when viewing */}
                        {isLogging ? (
                          <>
                            <td className="py-3 pr-4">
                              <div className="flex gap-1 items-center">
                                <input
                                  type="number"
                                  value={set.actualWeight || ''}
                                  onChange={(e) => updateSetActual(exerciseIndex, setIndex, 'actualWeight', e.target.value)}
                                  placeholder={set.prescribedWeight || 'lbs'}
                                  className="w-16 input-field text-sm py-1 px-2"
                                />
                                <span className="text-iron-600">×</span>
                                <input
                                  type="number"
                                  value={set.actualReps || ''}
                                  onChange={(e) => updateSetActual(exerciseIndex, setIndex, 'actualReps', e.target.value)}
                                  placeholder={set.prescribedReps || 'reps'}
                                  className="w-14 input-field text-sm py-1 px-2"
                                />
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              <select
                                value={set.rpe || ''}
                                onChange={(e) => updateSetActual(exerciseIndex, setIndex, 'rpe', e.target.value)}
                                className="input-field text-sm py-1 px-2 w-16"
                              >
                                <option value="">—</option>
                                {[5, 6, 7, 8, 9, 10].map(v => (
                                  <option key={v} value={v}>{v}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3">
                              <select
                                value={set.painLevel || 0}
                                onChange={(e) => updateSetActual(exerciseIndex, setIndex, 'painLevel', parseInt(e.target.value))}
                                className="input-field text-sm py-1 px-2 w-16"
                              >
                                {[0,1,2,3,4,5,6,7,8,9,10].map(v => (
                                  <option key={v} value={v}>{v}</option>
                                ))}
                              </select>
                            </td>
                          </>
                        ) : !isScheduled && (
                          <>
                            <td className="py-3 pr-4">
                              {set.actualWeight || set.actualReps ? (
                                <div>
                                  <span className="text-flame-400 font-medium">
                                    {set.actualWeight && `${set.actualWeight} lbs`}
                                    {set.actualWeight && set.actualReps && ' × '}
                                    {set.actualReps && `${set.actualReps} reps`}
                                  </span>
                                  {set.actualWeight && set.actualReps && parseInt(set.actualReps) > 1 && (
                                    <span className="ml-2 text-xs text-iron-500">
                                      e1RM: {calculateE1RM(parseFloat(set.actualWeight), parseInt(set.actualReps))}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-iron-600">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              {set.rpe ? (
                                <span className={`font-medium ${getRPEColor(set.rpe)}`}>
                                  {set.rpe}
                                </span>
                              ) : (
                                <span className="text-iron-600">—</span>
                              )}
                            </td>
                            <td className="py-3">
                              {set.painLevel > 0 ? (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPainColor(set.painLevel)}`}>
                                  {set.painLevel}
                                </span>
                              ) : (
                                <span className="text-iron-600">—</span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {exercise.notes && (
                <p className="mt-3 text-sm text-iron-500 italic">
                  {exercise.notes}
                </p>
              )}
            </div>
          ))
        ) : (
          <div className="card-steel p-8 text-center">
            <p className="text-iron-500">No exercises recorded</p>
          </div>
        )}
      </div>

      {/* Save Button when Logging */}
      {isLogging && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 border-t border-iron-800 flex gap-3">
          <button
            onClick={() => setIsLogging(false)}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            onClick={handleCompleteWorkout}
            disabled={saving}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {saving ? (
              'Saving...'
            ) : (
              <>
                <Check className="w-5 h-5" />
                Complete Workout
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}