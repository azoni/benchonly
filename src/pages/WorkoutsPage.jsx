import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  Dumbbell,
  ChevronRight,
  Calendar,
  Clock,
  Sparkles,
  MoreVertical,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Users
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { workoutService, groupWorkoutService } from '../services/firestore'
import { format, isToday, isPast, isFuture } from 'date-fns'
import { getDisplayDate, toDateString } from '../utils/dateUtils'

export default function WorkoutsPage() {
  const { user, isGuest } = useAuth()
  const [workouts, setWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMenu, setActiveMenu] = useState(null)
  const [activeTab, setActiveTab] = useState('todo') // 'todo' or 'completed'

  useEffect(() => {
    if (user) {
      loadWorkouts()
    }
  }, [user])

  const loadWorkouts = async () => {
    try {
      if (isGuest) {
        const { getSampleWorkouts } = await import('../context/AuthContext')
        setWorkouts(getSampleWorkouts())
        setLoading(false)
        return
      }
      
      // Load both personal and group workouts
      const [personalWorkouts, groupWorkouts] = await Promise.all([
        workoutService.getByUser(user.uid, 100),
        groupWorkoutService.getByUser(user.uid).catch(() => [])
      ])
      
      // Mark group workouts so we can link to correct page
      const markedGroupWorkouts = groupWorkouts.map(w => ({
        ...w,
        isGroupWorkout: true
      }))
      
      // Merge and sort by date
      const allWorkouts = [...personalWorkouts, ...markedGroupWorkouts].sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date)
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date)
        return dateB - dateA
      })
      
      setWorkouts(allWorkouts)
    } catch (error) {
      console.error('Error loading workouts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (workoutId) => {
    if (window.confirm('Are you sure you want to delete this workout?')) {
      if (isGuest) {
        setWorkouts((prev) => prev.filter((w) => w.id !== workoutId))
        setActiveMenu(null)
        return
      }
      try {
        await workoutService.delete(workoutId)
        setWorkouts((prev) => prev.filter((w) => w.id !== workoutId))
        setActiveMenu(null)
      } catch (error) {
        console.error('Error deleting workout:', error)
      }
    }
  }

  // Filter workouts based on search
  const filteredWorkouts = workouts.filter((workout) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    const nameMatch = workout.name?.toLowerCase().includes(query)
    const exerciseMatch = workout.exercises?.some((e) =>
      e.name?.toLowerCase().includes(query)
    )
    return nameMatch || exerciseMatch
  })

  // Separate into to-do and completed
  const todoWorkouts = filteredWorkouts.filter(w => {
    // Group workouts: check status
    if (w.isGroupWorkout) {
      return w.status !== 'completed'
    }
    // Personal workouts: check status
    return w.status === 'scheduled'
  })

  const completedWorkouts = filteredWorkouts.filter(w => {
    if (w.isGroupWorkout) {
      return w.status === 'completed'
    }
    return w.status !== 'scheduled'
  })

  // Sort todo workouts by date (oldest first - most urgent)
  const sortedTodoWorkouts = [...todoWorkouts].sort((a, b) => {
    const dateA = getDisplayDate(a.date)
    const dateB = getDisplayDate(b.date)
    return dateA - dateB
  })

  // Sort completed workouts by date (newest first)
  const sortedCompletedWorkouts = [...completedWorkouts].sort((a, b) => {
    const dateA = getDisplayDate(a.date)
    const dateB = getDisplayDate(b.date)
    return dateB - dateA
  })

  const getDateLabel = (date) => {
    const dateObj = getDisplayDate(date)
    if (isToday(dateObj)) return 'Today'
    if (isPast(dateObj)) return format(dateObj, 'EEE, MMM d')
    return format(dateObj, 'EEE, MMM d')
  }

  const isOverdue = (date) => {
    const dateObj = getDisplayDate(date)
    return isPast(dateObj) && !isToday(dateObj)
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-iron-800 rounded-lg w-1/3"></div>
          <div className="h-12 bg-iron-800 rounded-lg"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-iron-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const displayedWorkouts = activeTab === 'todo' ? sortedTodoWorkouts : sortedCompletedWorkouts

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display text-iron-50">Workouts</h1>
        <div className="flex items-center gap-2">
          <Link to="/workouts/generate" className="btn-secondary flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">AI Generate</span>
          </Link>
          <Link to="/workouts/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            New
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-iron-500" />
        <input
          type="text"
          placeholder="Search workouts or exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field pl-12"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('todo')}
          className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'todo'
              ? 'bg-flame-500 text-white'
              : 'bg-iron-800 text-iron-400 hover:text-iron-200'
          }`}
        >
          <AlertCircle className="w-5 h-5" />
          To Do
          {todoWorkouts.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-sm ${
              activeTab === 'todo' ? 'bg-white/20' : 'bg-flame-500/20 text-flame-400'
            }`}>
              {todoWorkouts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 py-3 px-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'completed'
              ? 'bg-green-500 text-white'
              : 'bg-iron-800 text-iron-400 hover:text-iron-200'
          }`}
        >
          <CheckCircle2 className="w-5 h-5" />
          Completed
          <span className={`px-2 py-0.5 rounded-full text-sm ${
            activeTab === 'completed' ? 'bg-white/20' : 'bg-iron-700'
          }`}>
            {completedWorkouts.length}
          </span>
        </button>
      </div>

      {/* Workouts List */}
      {displayedWorkouts.length > 0 ? (
        <div className="space-y-3">
          {displayedWorkouts.map((workout, index) => {
            const overdue = activeTab === 'todo' && isOverdue(workout.date)
            
            return (
              <motion.div
                key={workout.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`card-steel rounded-xl overflow-hidden group relative ${
                  overdue ? 'border-red-500/50' : ''
                }`}
              >
                <Link
                  to={workout.isGroupWorkout ? `/workouts/group/${workout.id}` : `/workouts/${workout.id}`}
                  state={{ from: '/workouts', fromLabel: 'Back to Workouts' }}
                  className="flex items-center gap-4 p-4 pr-12"
                >
                  {/* Icon */}
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    workout.isGroupWorkout
                      ? 'bg-cyan-500/10'
                      : overdue
                        ? 'bg-red-500/10'
                        : activeTab === 'todo'
                          ? 'bg-yellow-500/10'
                          : workout.workoutType === 'cardio'
                            ? 'bg-orange-500/10'
                            : 'bg-green-500/10'
                  }`}>
                    {workout.isGroupWorkout ? (
                      <Users className="w-7 h-7 text-cyan-400" />
                    ) : (
                      <Dumbbell className={`w-7 h-7 ${
                        overdue
                          ? 'text-red-400'
                          : activeTab === 'todo'
                            ? 'text-yellow-400'
                            : workout.workoutType === 'cardio'
                              ? 'text-orange-400'
                              : 'text-green-400'
                      }`} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-iron-100 group-hover:text-flame-400 transition-colors">
                        {workout.name || 'Untitled Workout'}
                      </h3>
                      {workout.isGroupWorkout && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-cyan-500/20 text-cyan-400 rounded">
                          Group
                        </span>
                      )}
                      {overdue && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 rounded">
                          Overdue
                        </span>
                      )}
                      {workout.workoutType === 'cardio' && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-orange-500/20 text-orange-400 rounded">
                          Cardio
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 mt-1 text-sm text-iron-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {getDateLabel(workout.date)}
                      </span>
                      {workout.workoutType === 'cardio' ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {workout.duration} min
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Dumbbell className="w-3.5 h-3.5" />
                          {workout.exercises?.length || 0} exercises
                        </span>
                      )}
                    </div>

                    {/* Exercise preview */}
                    {workout.exercises?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {workout.exercises.slice(0, 3).map((exercise, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-xs bg-iron-800 text-iron-400 rounded"
                          >
                            {exercise.name}
                            {activeTab === 'todo' && exercise.sets?.length > 0 && (
                              <span className="text-iron-500 ml-1">
                                ({exercise.sets.length}×{exercise.sets[0]?.prescribedReps || '?'})
                              </span>
                            )}
                          </span>
                        ))}
                        {workout.exercises.length > 3 && (
                          <span className="text-xs text-iron-500 px-1">
                            +{workout.exercises.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <ChevronRight className="w-5 h-5 text-iron-600 group-hover:text-iron-400 transition-colors flex-shrink-0" />
                </Link>

                {/* Actions Menu (not for group workouts) */}
                {!workout.isGroupWorkout && (
                  <>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setActiveMenu(activeMenu === workout.id ? null : workout.id)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-iron-500
                        hover:text-iron-300 hover:bg-iron-800 rounded-lg transition-colors z-10"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {activeMenu === workout.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="absolute right-2 top-14 bg-iron-800 border border-iron-700
                            rounded-lg shadow-xl z-20 py-1 min-w-[140px]"
                        >
                          <Link
                            to={`/workouts/${workout.id}/edit`}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-iron-300
                              hover:bg-iron-700 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(workout.id)}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-red-400
                              hover:bg-iron-700 transition-colors w-full"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.div>
            )
          })}
        </div>
      ) : (
        <div className="card-steel p-12 text-center">
          <div className="w-16 h-16 bg-iron-800 rounded-full flex items-center justify-center mx-auto mb-4">
            {activeTab === 'todo' ? (
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            ) : (
              <Dumbbell className="w-8 h-8 text-iron-600" />
            )}
          </div>
          {activeTab === 'todo' ? (
            <>
              <h3 className="text-lg font-display text-iron-200 mb-2">All Caught Up!</h3>
              <p className="text-iron-500 mb-6">No pending workouts. Create a new one or check your completed workouts.</p>
              <Link to="/workouts/new" className="btn-primary inline-flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Create Workout
              </Link>
            </>
          ) : (
            <>
              <h3 className="text-lg font-display text-iron-200 mb-2">No Completed Workouts</h3>
              <p className="text-iron-500">Complete your first workout to see it here.</p>
            </>
          )}
        </div>
      )}

      {/* Click outside to close menu */}
      {activeMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setActiveMenu(null)}
        />
      )}
    </div>
  )
}