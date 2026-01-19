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
  MoreVertical
} from 'lucide-react'
import { workoutService } from '../services/firestore'
import { useAuth } from '../context/AuthContext'

export default function WorkoutDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [workout, setWorkout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showMenu, setShowMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function fetchWorkout() {
      if (!id || !user) return
      try {
        const data = await workoutService.getById(id)
        setWorkout(data)
      } catch (error) {
        console.error('Error fetching workout:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchWorkout()
  }, [id, user])

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this workout?')) return
    
    setDeleting(true)
    try {
      await workoutService.delete(id)
      navigate('/workouts')
    } catch (error) {
      console.error('Error deleting workout:', error)
      setDeleting(false)
    }
  }

  const getRPEColor = (rpe) => {
    if (rpe <= 6) return 'text-green-400'
    if (rpe <= 7) return 'text-yellow-400'
    if (rpe <= 8) return 'text-orange-400'
    return 'text-red-400'
  }

  const getPainColor = (pain) => {
    if (pain <= 2) return 'bg-green-500/20 text-green-400'
    if (pain <= 4) return 'bg-yellow-500/20 text-yellow-400'
    if (pain <= 6) return 'bg-orange-500/20 text-orange-400'
    return 'bg-red-500/20 text-red-400'
  }

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
                  onClick={() => {
                    // TODO: Implement share functionality
                    setShowMenu(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-iron-300 hover:bg-iron-700 transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </>
          )}
        </div>
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
      </div>

      {/* Exercises */}
      <div className="space-y-4">
        <h2 className="text-lg font-display text-iron-300">Exercises</h2>
        
        {workout.exercises?.length > 0 ? (
          workout.exercises.map((exercise, index) => (
            <div key={index} className="card-steel p-5">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-iron-100">
                  {exercise.name}
                </h3>
                {exercise.pain > 0 && (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getPainColor(exercise.pain)}`}>
                    Pain: {exercise.pain}/10
                  </span>
                )}
              </div>
              
              {/* Sets Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-iron-500 text-left">
                      <th className="pb-2 pr-4 font-medium">Set</th>
                      <th className="pb-2 pr-4 font-medium">Weight</th>
                      <th className="pb-2 pr-4 font-medium">Reps</th>
                      {exercise.sets?.some(s => s.rpe) && (
                        <th className="pb-2 font-medium">RPE</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {exercise.sets?.map((set, setIndex) => (
                      <tr key={setIndex} className="border-t border-iron-800">
                        <td className="py-2 pr-4 text-iron-400">{setIndex + 1}</td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            {set.prescribedWeight && set.weight !== set.prescribedWeight ? (
                              <>
                                <span className="text-iron-500 line-through">
                                  {set.prescribedWeight}
                                </span>
                                <span className="text-iron-100 font-medium">
                                  {set.weight} lbs
                                </span>
                              </>
                            ) : (
                              <span className="text-iron-100 font-medium">
                                {set.weight || set.prescribedWeight || '—'} lbs
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            {set.prescribedReps && set.reps !== set.prescribedReps ? (
                              <>
                                <span className="text-iron-500 line-through">
                                  {set.prescribedReps}
                                </span>
                                <span className="text-iron-100 font-medium">
                                  {set.reps}
                                </span>
                              </>
                            ) : (
                              <span className="text-iron-100 font-medium">
                                {set.reps || set.prescribedReps || '—'}
                              </span>
                            )}
                          </div>
                        </td>
                        {exercise.sets?.some(s => s.rpe) && (
                          <td className="py-2">
                            {set.rpe ? (
                              <span className={`font-medium ${getRPEColor(set.rpe)}`}>
                                {set.rpe}
                              </span>
                            ) : (
                              <span className="text-iron-600">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Exercise Summary */}
              <div className="mt-4 pt-4 border-t border-iron-800 flex gap-6 text-sm">
                <div>
                  <span className="text-iron-500">Total Volume:</span>
                  <span className="ml-2 text-iron-200 font-medium">
                    {exercise.sets?.reduce((acc, s) => acc + ((s.weight || s.prescribedWeight || 0) * (s.reps || s.prescribedReps || 0)), 0).toLocaleString()} lbs
                  </span>
                </div>
                <div>
                  <span className="text-iron-500">Sets:</span>
                  <span className="ml-2 text-iron-200 font-medium">
                    {exercise.sets?.length || 0}
                  </span>
                </div>
              </div>
              
              {exercise.notes && (
                <p className="mt-3 text-iron-400 text-sm">
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

      {/* Workout Summary */}
      {workout.exercises?.length > 0 && (
        <div className="card-steel p-6 mt-6">
          <h3 className="text-sm font-medium text-iron-400 mb-4">Workout Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-display text-iron-100">
                {workout.exercises.length}
              </p>
              <p className="text-sm text-iron-500">Exercises</p>
            </div>
            <div>
              <p className="text-2xl font-display text-iron-100">
                {workout.exercises.reduce((acc, e) => acc + (e.sets?.length || 0), 0)}
              </p>
              <p className="text-sm text-iron-500">Total Sets</p>
            </div>
            <div>
              <p className="text-2xl font-display text-iron-100">
                {workout.exercises.reduce((acc, e) => 
                  acc + (e.sets?.reduce((a, s) => a + (s.reps || s.prescribedReps || 0), 0) || 0), 0
                )}
              </p>
              <p className="text-sm text-iron-500">Total Reps</p>
            </div>
            <div>
              <p className="text-2xl font-display text-flame-400">
                {(workout.exercises.reduce((acc, e) => 
                  acc + (e.sets?.reduce((a, s) => 
                    a + ((s.weight || s.prescribedWeight || 0) * (s.reps || s.prescribedReps || 0)), 0
                  ) || 0), 0
                ) / 1000).toFixed(1)}k
              </p>
              <p className="text-sm text-iron-500">Total Volume (lbs)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}