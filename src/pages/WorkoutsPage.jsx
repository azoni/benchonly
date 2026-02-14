import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  Users,
  Eye,
  ThumbsUp,
  Repeat,
  ClipboardList,
  Loader2,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { workoutService, groupWorkoutService, scheduleService, trainerRequestService, creditService, CREDIT_COSTS } from '../services/firestore'
import { format, isToday, isPast, isFuture, subDays, eachDayOfInterval, startOfDay } from 'date-fns'
import { getDisplayDate, toDateString } from '../utils/dateUtils'

export default function WorkoutsPage() {
  const { user, userProfile, updateProfile, isGuest, isAppAdmin } = useAuth()
  const navigate = useNavigate()
  const [workouts, setWorkouts] = useState([])
  const [pendingReviews, setPendingReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMenu, setActiveMenu] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [activeTab, setActiveTab] = useState('todo') // 'todo' or 'completed'

  // Trainer request state
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestType, setRequestType] = useState('custom_workout') // 'custom_workout' or 'review'
  const [requestNotes, setRequestNotes] = useState('')
  const [requestTargetDate, setRequestTargetDate] = useState('')
  const [requestWorkoutId, setRequestWorkoutId] = useState(null)
  const [requestSubmitting, setRequestSubmitting] = useState(false)

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
      
      // Load both personal and group workouts, plus schedules
      const [personalWorkouts, groupWorkouts, reviews, schedulesData] = await Promise.all([
        workoutService.getByUser(user.uid, 100),
        groupWorkoutService.getByUser(user.uid).catch(() => []),
        groupWorkoutService.getPendingReviews(user.uid).catch(() => []),
        scheduleService.getByUser(user.uid).catch(() => [])
      ])
      
      setPendingReviews(reviews)
      
      // Mark group workouts so we can link to correct page
      const markedGroupWorkouts = groupWorkouts.map(w => ({
        ...w,
        isGroupWorkout: true
      }))

      // Generate virtual completed entries for past recurring schedules
      const recurringSchedules = schedulesData.filter(s => s.type === 'recurring' && s.days?.length > 0)
      const virtualCompleted = []
      if (recurringSchedules.length > 0) {
        const today = startOfDay(new Date())
        const thirtyDaysAgo = subDays(today, 30)
        const pastDays = eachDayOfInterval({ start: thirtyDaysAgo, end: subDays(today, 1) })
        
        for (const schedule of recurringSchedules) {
          const skippedDates = schedule.skippedDates || []
          for (const day of pastDays) {
            const dayOfWeek = format(day, 'EEEE').toLowerCase()
            const dateStr = toDateString(day)
            if (schedule.days.includes(dayOfWeek) && !skippedDates.includes(dateStr)) {
              virtualCompleted.push({
                id: `recurring_${schedule.id}_${dateStr}`,
                name: schedule.name || 'Recurring Activity',
                date: dateStr,
                status: 'completed',
                isRecurring: true,
                scheduleId: schedule.id,
                workoutType: schedule.workoutType || 'cardio',
                duration: schedule.duration,
                exercises: [],
              })
            }
          }
        }
      }
      
      // Merge and sort by date
      const allWorkouts = [...personalWorkouts, ...markedGroupWorkouts, ...virtualCompleted].sort((a, b) => {
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

  const handleDelete = async (workout) => {
    if (pendingDeleteId !== workout.id) {
      setPendingDeleteId(workout.id)
      return
    }
    if (isGuest) {
      setWorkouts((prev) => prev.filter((w) => w.id !== workout.id))
      setActiveMenu(null)
      setPendingDeleteId(null)
      return
    }
    try {
      if (workout.isGroupWorkout) {
        await groupWorkoutService.delete(workout.id)
      } else {
        await workoutService.delete(workout.id)
      }
      setWorkouts((prev) => prev.filter((w) => w.id !== workout.id))
      setActiveMenu(null)
      setPendingDeleteId(null)
    } catch (error) {
      console.error('Error deleting workout:', error)
      setPendingDeleteId(null)
    }
  }

  const handleQuickApprove = async (reviewId) => {
    try {
      await groupWorkoutService.approveReview(reviewId)
      setPendingReviews(prev => prev.filter(r => r.id !== reviewId))
    } catch (error) {
      console.error('Error approving:', error)
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
    return (dateA?.getTime() || 0) - (dateB?.getTime() || 0)
  })

  // Sort completed workouts by date (newest first)
  const sortedCompletedWorkouts = [...completedWorkouts].sort((a, b) => {
    const dateA = getDisplayDate(a.date)
    const dateB = getDisplayDate(b.date)
    return (dateB?.getTime() || 0) - (dateA?.getTime() || 0)
  })

  const getDateLabel = (date) => {
    try {
      const dateObj = getDisplayDate(date)
      if (isNaN(dateObj.getTime())) return '—'
      if (isToday(dateObj)) return 'Today'
      return format(dateObj, 'EEE, MMM d')
    } catch {
      return '—'
    }
  }

  const isOverdue = (date) => {
    try {
      const dateObj = getDisplayDate(date)
      if (isNaN(dateObj.getTime())) return false
      return isPast(dateObj) && !isToday(dateObj)
    } catch {
      return false
    }
  }

  const openTrainerRequest = (type, workoutId = null) => {
    setRequestType(type)
    setRequestWorkoutId(workoutId)
    setRequestNotes('')
    setRequestTargetDate('')
    setShowRequestModal(true)
  }

  const handleTrainerRequest = async () => {
    if (!user) return
    const creditKey = requestType === 'custom_workout' ? 'trainer-custom-workout' : 'trainer-review'
    const cost = CREDIT_COSTS[creditKey]
    const credits = userProfile?.credits ?? 0

    if (!isAppAdmin && credits < cost) {
      alert(`Not enough credits. This costs ${cost} credits and you have ${credits}.`)
      return
    }

    setRequestSubmitting(true)
    try {
      // Deduct credits
      if (!isAppAdmin) {
        await creditService.deduct(user.uid, creditKey)
        updateProfile({ credits: credits - cost })
      }

      await trainerRequestService.create(user.uid, {
        type: requestType,
        notes: requestNotes,
        targetDate: requestTargetDate || null,
        workoutId: requestWorkoutId || null,
        workoutName: requestWorkoutId
          ? workouts.find(w => w.id === requestWorkoutId)?.name || ''
          : null,
        creditCost: cost,
      })

      setShowRequestModal(false)
      alert(requestType === 'custom_workout'
        ? 'Workout request submitted! A trainer will build your workout.'
        : 'Review request submitted! A trainer will review your workout.')
    } catch (err) {
      console.error('Error submitting request:', err)
      // Refund on failure
      if (!isAppAdmin) {
        await creditService.add(user.uid, cost).catch(() => {})
        updateProfile({ credits })
      }
      alert('Failed to submit request. Please try again.')
    } finally {
      setRequestSubmitting(false)
    }
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
          <button
            onClick={() => openTrainerRequest('custom_workout')}
            className="btn-secondary flex items-center gap-2"
            title="Request custom workout from a real trainer"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">Trainer</span>
          </button>
          <Link to="/workouts/generate" className="btn-secondary flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">AI</span>
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

      {/* Pending Reviews */}
      {pendingReviews.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" />
            Needs Your Review ({pendingReviews.length})
          </h3>
          <div className="space-y-2">
            {pendingReviews.map((review) => {
              let dateStr = ''
              try {
                const d = getDisplayDate(review.date)
                if (!isNaN(d.getTime())) dateStr = format(d, 'MMM d')
              } catch { /* ignore */ }

              return (
                <div
                  key={review.id}
                  className="card-steel p-3 border-amber-500/20 bg-amber-500/5 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Eye className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-iron-100 truncate">{review.name || 'Group Workout'}</p>
                    <p className="text-xs text-iron-500">{dateStr} · Coach logged for you</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleQuickApprove(review.id)}
                      className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
                      title="Approve"
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <Link
                      to={`/workouts/group/${review.id}`}
                      className="p-2 bg-iron-800 hover:bg-iron-700 text-iron-300 rounded-lg transition-colors"
                      title="Review details"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
            const isRecurring = workout.isRecurring
            const CardWrapper = isRecurring ? 'div' : Link
            const cardProps = isRecurring 
              ? { className: 'flex items-center gap-4 p-4 pr-12' }
              : { 
                  to: workout.isGroupWorkout ? `/workouts/group/${workout.id}` : `/workouts/${workout.id}`,
                  state: { from: '/workouts', fromLabel: 'Back to Workouts' },
                  className: 'flex items-center gap-4 p-4 pr-12'
                }
            
            return (
              <motion.div
                key={workout.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`card-steel rounded-xl group relative ${
                  overdue ? 'border-red-500/50' : ''
                }`}
              >
                <CardWrapper {...cardProps}>
                  {/* Icon */}
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isRecurring
                      ? 'bg-emerald-500/10'
                      : workout.isGroupWorkout
                        ? 'bg-cyan-500/10'
                        : overdue
                          ? 'bg-red-500/10'
                          : activeTab === 'todo'
                            ? 'bg-yellow-500/10'
                            : workout.workoutType === 'cardio'
                              ? 'bg-orange-500/10'
                              : 'bg-green-500/10'
                  }`}>
                    {isRecurring ? (
                      <Repeat className="w-7 h-7 text-emerald-400" />
                    ) : workout.isGroupWorkout ? (
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
                      {isRecurring && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded">
                          Recurring
                        </span>
                      )}
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
                      {workout.workoutType === 'cardio' && !isRecurring && (
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
                      {workout.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {workout.duration} min
                        </span>
                      )}
                      {!isRecurring && !workout.duration && (
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

                  {!isRecurring && (
                    <ChevronRight className="w-5 h-5 text-iron-600 group-hover:text-iron-400 transition-colors flex-shrink-0" />
                  )}
                </CardWrapper>

                {/* Actions Menu - not for recurring */}
                {!isRecurring && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                  >
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setActiveMenu(activeMenu === workout.id ? null : workout.id)
                      }}
                      className="p-2 text-iron-500
                        hover:text-iron-300 hover:bg-iron-800 rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {activeMenu === workout.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="absolute right-0 top-full mt-1 bg-iron-800 border border-iron-700
                            rounded-lg shadow-xl z-50 py-1 min-w-[140px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!workout.isGroupWorkout && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveMenu(null)
                                navigate(`/workouts/${workout.id}/edit`)
                              }}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-iron-300
                                hover:bg-iron-700 transition-colors w-full"
                            >
                              <Edit2 className="w-4 h-4" />
                              Edit
                            </button>
                          )}
                          {!workout.isGroupWorkout && workout.status === 'scheduled' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveMenu(null)
                                openTrainerRequest('review', workout.id)
                              }}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-purple-300
                                hover:bg-iron-700 transition-colors w-full"
                            >
                              <ClipboardList className="w-4 h-4" />
                              Send for Review
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(workout)
                            }}
                            className={`flex items-center gap-2 px-4 py-2 text-sm w-full transition-colors ${
                              pendingDeleteId === workout.id
                                ? 'text-white bg-red-500 hover:bg-red-600'
                                : 'text-red-400 hover:bg-iron-700'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                            {pendingDeleteId === workout.id ? 'Tap to confirm' : 'Delete'}
                          </button>
                          {pendingDeleteId === workout.id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setPendingDeleteId(null)
                                setActiveMenu(null)
                              }}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-iron-400 hover:bg-iron-700 transition-colors w-full"
                            >
                              Cancel
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
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
          className="fixed inset-0 z-[5]"
          onClick={() => setActiveMenu(null)}
        />
      )}

      {/* Trainer Request Modal */}
      <AnimatePresence>
        {showRequestModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRequestModal(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[15%] mx-auto max-w-md bg-iron-900 border border-iron-700 rounded-2xl z-50 overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-iron-800">
                <h3 className="font-display text-lg text-iron-100">
                  {requestType === 'custom_workout' ? 'Request Custom Workout' : 'Request Workout Review'}
                </h3>
                <button
                  onClick={() => setShowRequestModal(false)}
                  className="p-1.5 text-iron-400 hover:text-iron-200 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <p className="text-sm text-iron-400">
                  {requestType === 'custom_workout'
                    ? 'A real trainer will create a personalized workout based on your training data and goals.'
                    : 'A trainer will review and optimize your existing workout plan.'
                  }
                </p>

                {requestType === 'review' && requestWorkoutId && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-sm text-purple-300">
                    Reviewing: {workouts.find(w => w.id === requestWorkoutId)?.name || 'Workout'}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-iron-400 mb-1.5">
                    Notes for the trainer (optional)
                  </label>
                  <textarea
                    value={requestNotes}
                    onChange={(e) => setRequestNotes(e.target.value)}
                    placeholder={requestType === 'custom_workout'
                      ? 'What are you looking for? Focus areas, time constraints, equipment available...'
                      : 'Any specific concerns? Areas you want changed or improved...'
                    }
                    rows={3}
                    className="input-field w-full resize-none text-sm"
                  />
                </div>

                {requestType === 'custom_workout' && (
                  <div>
                    <label className="block text-xs font-medium text-iron-400 mb-1.5">
                      When do you need it by? (optional)
                    </label>
                    <input
                      type="date"
                      value={requestTargetDate}
                      onChange={(e) => setRequestTargetDate(e.target.value)}
                      className="input-field w-full text-sm"
                    />
                  </div>
                )}

                <div className="p-3 bg-iron-800/50 rounded-lg flex items-center justify-between">
                  <span className="text-sm text-iron-400">Cost</span>
                  <span className="text-sm font-medium text-flame-400">
                    {CREDIT_COSTS[requestType === 'custom_workout' ? 'trainer-custom-workout' : 'trainer-review']} credits
                  </span>
                </div>

                <button
                  onClick={handleTrainerRequest}
                  disabled={requestSubmitting}
                  className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2"
                >
                  {requestSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ClipboardList className="w-4 h-4" />
                  )}
                  {requestSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}