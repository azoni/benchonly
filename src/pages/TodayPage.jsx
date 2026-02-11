import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Dumbbell,
  Sparkles,
  Users,
  ChevronRight,
  ChevronDown,
  Calendar,
  Flame,
  Eye,
  ThumbsUp,
  Target,
  Check,
  Repeat,
  Zap,
  Plus,
  Calculator,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  workoutService,
  groupWorkoutService,
  scheduleService,
  goalService,
} from '../services/firestore'
import { feedService } from '../services/feedService'
import { format, startOfWeek, endOfWeek, subDays, isToday, startOfDay } from 'date-fns'
import { toDateString } from '../utils/dateUtils'

export default function TodayPage() {
  const { user, userProfile, isGuest } = useAuth()
  const [todayWorkouts, setTodayWorkouts] = useState([])
  const [todayGroupWorkouts, setTodayGroupWorkouts] = useState([])
  const [todaySchedules, setTodaySchedules] = useState([])
  const [pendingReviews, setPendingReviews] = useState([])
  const [weekStats, setWeekStats] = useState({ completed: 0, total: 0 })
  const [weekCompletedDates, setWeekCompletedDates] = useState(new Set())
  const [feedItems, setFeedItems] = useState([])
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)

  // 1RM Calculator state
  const [calcOpen, setCalcOpen] = useState(false)
  const [calcWeight, setCalcWeight] = useState('')
  const [calcReps, setCalcReps] = useState('')
  const [calcFormula, setCalcFormula] = useState('epley')

  const FORMULAS = {
    epley: { name: 'Epley', calc: (w, r) => w * (1 + r / 30) },
    brzycki: { name: 'Brzycki', calc: (w, r) => w * (36 / (37 - r)) },
    lombardi: { name: 'Lombardi', calc: (w, r) => w * Math.pow(r, 0.1) },
    oconner: { name: "O'Conner", calc: (w, r) => w * (1 + r / 40) },
  }

  const calcOneRM = () => {
    const w = parseFloat(calcWeight), r = parseInt(calcReps)
    if (!w || !r || r < 1 || r > 30) return null
    if (r === 1) return w
    return FORMULAS[calcFormula].calc(w, r)
  }
  const oneRM = calcOneRM()
  const percentChart = oneRM ? [
    { reps: 1, pct: 100 }, { reps: 2, pct: 97 }, { reps: 3, pct: 94 },
    { reps: 5, pct: 89 }, { reps: 8, pct: 81 }, { reps: 10, pct: 75 }, { reps: 12, pct: 69 },
  ].map(r => ({ ...r, weight: Math.round(oneRM * r.pct / 100) })) : null

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = userProfile?.displayName?.split(' ')[0] || user?.displayName?.split(' ')[0] || ''
  const todayStr = toDateString(now)
  const dayOfWeek = format(now, 'EEEE').toLowerCase()

  useEffect(() => {
    if (user) loadTodayData()
  }, [user])

  const loadTodayData = async () => {
    try {
      if (isGuest) {
        setLoading(false)
        return
      }

      const weekStart = startOfWeek(now, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

      const [
        personalWorkouts,
        groupWorkouts,
        schedulesData,
        reviews,
        goalsData,
        feedData,
      ] = await Promise.all([
        workoutService.getByUser(user.uid, 50).catch(() => []),
        groupWorkoutService.getByUser(user.uid).catch(() => []),
        scheduleService.getByUser(user.uid).catch(() => []),
        groupWorkoutService.getPendingReviews(user.uid).catch(() => []),
        goalService.getByUser(user.uid).catch(() => []),
        feedService.getFeed(user.uid, 5).catch(() => []),
      ])

      // Today's personal workouts
      const todayPersonal = personalWorkouts.filter(w => {
        const d = w.date?.toDate ? w.date.toDate() : new Date(w.date)
        return toDateString(d) === todayStr
      })
      setTodayWorkouts(todayPersonal)

      // Today's group workouts
      const todayGroup = groupWorkouts.filter(w => {
        try {
          const d = w.date?.toDate ? w.date.toDate() : new Date(w.date)
          return toDateString(d) === todayStr
        } catch { return false }
      })
      setTodayGroupWorkouts(todayGroup)

      // Today's recurring schedules
      const todayScheds = schedulesData.filter(s => {
        if (s.type === 'recurring') {
          const skipped = (s.skippedDates || []).includes(todayStr)
          return s.days?.includes(dayOfWeek) && !skipped
        }
        return s.date === todayStr
      })
      setTodaySchedules(todayScheds)

      setPendingReviews(reviews)
      setGoals(goalsData.filter(g => g.status === 'active'))
      setFeedItems(feedData)

      // This week's stats
      const completedDates = new Set()
      const weekWorkouts = personalWorkouts.filter(w => {
        const d = w.date?.toDate ? w.date.toDate() : new Date(w.date)
        if (d >= weekStart && d <= weekEnd) {
          if (w.status !== 'scheduled') completedDates.add(toDateString(d))
          return true
        }
        return false
      })
      const weekGroupWorkouts = groupWorkouts.filter(w => {
        try {
          const d = w.date?.toDate ? w.date.toDate() : new Date(w.date)
          if (d >= weekStart && d <= weekEnd && w.status === 'completed') {
            completedDates.add(toDateString(d))
            return true
          }
        } catch {}
        return false
      })
      // Also count recurring schedules as completed on past days
      schedulesData.filter(s => s.type === 'recurring').forEach(s => {
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart)
          d.setDate(d.getDate() + i)
          const dStr = toDateString(d)
          const dDay = format(d, 'EEEE').toLowerCase()
          const isPastDay = d < startOfDay(now) && !isToday(d)
          if (isPastDay && s.days?.includes(dDay) && !(s.skippedDates || []).includes(dStr)) {
            completedDates.add(dStr)
          }
        }
      })
      setWeekCompletedDates(completedDates)
      const scheduledThisWeek = schedulesData.filter(s => s.type === 'recurring').reduce((sum, s) => sum + (s.days?.length || 0), 0)

      setWeekStats({
        completed: completedDates.size,
        total: Math.max(scheduledThisWeek, completedDates.size),
      })
    } catch (error) {
      console.error('Error loading today data:', error)
    } finally {
      setLoading(false)
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

  const hasTodayWorkout = todayWorkouts.length > 0 || todayGroupWorkouts.length > 0 || todaySchedules.length > 0
  const allCompleted = todayWorkouts.length > 0 && todayWorkouts.every(w => w.status === 'completed' || w.status !== 'scheduled')

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-iron-800 rounded-lg w-2/3" />
          <div className="h-48 bg-iron-800 rounded-2xl" />
          <div className="h-24 bg-iron-800 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <p className="text-iron-500 text-sm">{format(now, 'EEEE, MMMM d')}</p>
        <h1 className="text-3xl font-display text-iron-50">
          {greeting}{firstName ? `, ${firstName}` : ''}
        </h1>
      </motion.div>

      {/* Pending Reviews */}
      {pendingReviews.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6"
        >
          <h3 className="text-xs text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" />
            Needs Your Review
          </h3>
          <div className="space-y-2">
            {pendingReviews.slice(0, 3).map(review => (
              <div key={review.id} className="card-steel p-3 border-amber-500/20 bg-amber-500/5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Eye className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-iron-100 truncate">{review.name || 'Group Workout'}</p>
                  <p className="text-xs text-iron-500">Coach logged for you</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleQuickApprove(review.id)}
                    className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>
                  <Link
                    to={`/workouts/group/${review.id}`}
                    className="p-2 bg-iron-800 hover:bg-iron-700 text-iron-300 rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Today's Workout — the hero section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <h3 className="text-xs text-iron-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-flame-400" />
          Today's Workout
        </h3>

        {/* Group workouts assigned for today */}
        {todayGroupWorkouts.map(workout => (
          <Link
            key={workout.id}
            to={`/workouts/group/${workout.id}`}
            className="card-steel p-5 mb-3 border-cyan-500/20 hover:border-cyan-500/40 transition-colors block"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                {workout.status === 'completed' ? (
                  <Check className="w-7 h-7 text-green-400" />
                ) : (
                  <Users className="w-7 h-7 text-cyan-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg text-iron-100">{workout.name}</h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-cyan-500/20 text-cyan-400 rounded">Group</span>
                </div>
                <p className="text-sm text-iron-500 mt-0.5">
                  {workout.exercises?.length || 0} exercises
                  {workout.status === 'completed' && ' · Completed'}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-iron-600" />
            </div>
          </Link>
        ))}

        {/* Personal workouts for today */}
        {todayWorkouts.map(workout => (
          <Link
            key={workout.id}
            to={`/workouts/${workout.id}`}
            className={`card-steel p-5 mb-3 transition-colors block ${
              workout.status === 'completed' || workout.status !== 'scheduled'
                ? 'border-green-500/20 hover:border-green-500/40'
                : 'border-flame-500/20 hover:border-flame-500/40'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                workout.status === 'completed' || workout.status !== 'scheduled'
                  ? 'bg-green-500/10' : 'bg-flame-500/10'
              }`}>
                {workout.status === 'completed' || workout.status !== 'scheduled' ? (
                  <Check className="w-7 h-7 text-green-400" />
                ) : (
                  <Dumbbell className="w-7 h-7 text-flame-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg text-iron-100">{workout.name}</h3>
                <p className="text-sm text-iron-500 mt-0.5">
                  {workout.workoutType === 'cardio'
                    ? `${workout.duration} min`
                    : `${workout.exercises?.length || 0} exercises`}
                  {(workout.status === 'completed' || workout.status !== 'scheduled') && ' · Completed'}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-iron-600" />
            </div>
          </Link>
        ))}

        {/* Recurring schedules for today (no doc to link to) */}
        {todaySchedules.length > 0 && todayGroupWorkouts.length === 0 && todayWorkouts.length === 0 && (
          <div className="space-y-3">
            {todaySchedules.map(schedule => (
              <div
                key={schedule.id}
                className="card-steel p-5 border-emerald-500/20"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <Repeat className="w-7 h-7 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg text-iron-100">{schedule.name || 'Scheduled Activity'}</h3>
                    <p className="text-sm text-iron-500 mt-0.5">
                      Recurring
                      {schedule.duration && ` · ${schedule.duration} min`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state — nothing today */}
        {!hasTodayWorkout && (
          <div className="card-steel p-8 text-center border-dashed border-iron-700">
            <div className="w-16 h-16 rounded-2xl bg-iron-800 flex items-center justify-center mx-auto mb-4">
              <Dumbbell className="w-8 h-8 text-iron-600" />
            </div>
            <h3 className="text-lg font-display text-iron-200 mb-1">Nothing scheduled today</h3>
            <p className="text-sm text-iron-500 mb-6">Generate a workout with AI or log one manually.</p>
            <div className="flex gap-3 justify-center">
              <Link
                to="/workouts/generate"
                className="btn-primary flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Generate with AI
              </Link>
              <Link
                to="/workouts/new"
                className="btn-secondary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Log Workout
              </Link>
            </div>
          </div>
        )}
      </motion.div>

      {/* This Week */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs text-iron-500 uppercase tracking-wider flex items-center gap-2">
            <Flame className="w-3.5 h-3.5 text-flame-400" />
            This Week
          </h3>
          <Link to="/calendar" className="text-xs text-flame-400 hover:text-flame-300">Calendar →</Link>
        </div>
        <div className="card-steel p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-iron-400">
              {weekStats.completed} workout{weekStats.completed !== 1 ? 's' : ''} completed
            </span>
            <span className="text-sm font-medium text-flame-400">
              {format(startOfWeek(now, { weekStartsOn: 1 }), 'MMM d')} – {format(endOfWeek(now, { weekStartsOn: 1 }), 'MMM d')}
            </span>
          </div>
          {/* Day dots */}
          <div className="flex gap-2">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((dayLabel, i) => {
              const dayDate = new Date(startOfWeek(now, { weekStartsOn: 1 }))
              dayDate.setDate(dayDate.getDate() + i)
              const dayStr = toDateString(dayDate)
              const isCurrentDay = isToday(dayDate)
              const isPastDay = dayDate < startOfDay(now) && !isCurrentDay
              const hadWorkout = weekCompletedDates.has(dayStr)

              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className={`text-xs font-medium ${isCurrentDay ? 'text-flame-400' : 'text-iron-600'}`}>
                    {dayLabel}
                  </span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${
                    isCurrentDay
                      ? 'bg-flame-500/20 text-flame-400 ring-2 ring-flame-500/30'
                      : hadWorkout
                        ? 'bg-green-500/20 text-green-400'
                        : isPastDay
                          ? 'bg-iron-800/50 text-iron-600'
                          : 'bg-iron-800/30 text-iron-600'
                  }`}>
                    {format(dayDate, 'd')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* Active Goals */}
      {goals.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs text-iron-500 uppercase tracking-wider flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-flame-400" />
              Goals
            </h3>
            <Link to="/goals" className="text-xs text-flame-400 hover:text-flame-300">View all →</Link>
          </div>
          <div className="space-y-2">
            {goals.slice(0, 3).map(goal => {
              const current = parseFloat(goal.currentValue) || parseFloat(goal.currentWeight) || 0
              const target = parseFloat(goal.targetValue) || parseFloat(goal.targetWeight) || 0
              const start = parseFloat(goal.startValue) || parseFloat(goal.startWeight) || 0
              const progress = target > start ? Math.min(100, Math.round(((current - start) / (target - start)) * 100)) : 0
              const unit = goal.metricType === 'weight' ? 'lbs' : goal.metricType === 'reps' ? 'reps' : 'sec'

              return (
                <Link key={goal.id} to="/goals" className="card-steel p-3 flex items-center gap-3 hover:border-iron-600 transition-colors block">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-iron-200 truncate">{goal.lift}</span>
                      <span className="text-xs text-iron-500">{current}/{target} {unit}</span>
                    </div>
                    <div className="w-full h-1.5 bg-iron-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-flame-500 rounded-full transition-all"
                        style={{ width: `${Math.max(2, progress)}%` }}
                      />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* Recent Activity */}
      {feedItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs text-iron-500 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-3.5 h-3.5" />
              Recent Activity
            </h3>
            <Link to="/feed" className="text-xs text-flame-400 hover:text-flame-300">View all →</Link>
          </div>
          <div className="card-steel divide-y divide-iron-800">
            {feedItems.slice(0, 4).map(item => (
              <div key={item.id} className="flex items-center gap-3 p-3">
                <div className="w-8 h-8 rounded-full bg-iron-800 flex items-center justify-center text-iron-400 text-xs flex-shrink-0">
                  {item.userName?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-iron-300 truncate">
                    {item.userName || 'Someone'}{' '}
                    {item.type === 'workout' ? `completed ${item.data?.name || 'a workout'}` :
                     item.type === 'goal_completed' ? `achieved ${item.data?.lift}` :
                     item.type === 'cardio' ? `logged ${item.data?.duration}min cardio` :
                     'was active'}
                  </p>
                  <p className="text-xs text-iron-600">
                    {item.createdAt?.toDate && format(item.createdAt.toDate(), 'EEE, h:mm a')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 1RM Calculator */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={feedItems.length > 0 ? 'mt-6' : ''}
      >
        <button
          onClick={() => setCalcOpen(!calcOpen)}
          className="card-steel p-4 w-full flex items-center gap-3 hover:border-iron-600 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-flame-500/20 flex items-center justify-center flex-shrink-0">
            <Calculator className="w-5 h-5 text-flame-400" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-iron-200">1RM Calculator</p>
            <p className="text-xs text-iron-500">Estimate your one-rep max</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-iron-500 transition-transform ${calcOpen ? 'rotate-180' : ''}`} />
        </button>

        {calcOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="card-steel mt-1 p-4 space-y-4 border-flame-500/10"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-iron-400 mb-1.5">Weight (lbs)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={calcWeight}
                  onChange={(e) => setCalcWeight(e.target.value)}
                  placeholder="225"
                  className="input-field w-full text-base py-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-iron-400 mb-1.5">Reps</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={calcReps}
                  onChange={(e) => setCalcReps(e.target.value)}
                  placeholder="5"
                  min="1"
                  max="30"
                  className="input-field w-full text-base py-2.5"
                />
              </div>
            </div>

            <div className="flex gap-1.5">
              {Object.entries(FORMULAS).map(([key, { name }]) => (
                <button
                  key={key}
                  onClick={() => setCalcFormula(key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    calcFormula === key
                      ? 'bg-flame-500 text-white'
                      : 'bg-iron-800 text-iron-500 hover:bg-iron-700'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>

            {oneRM && (
              <>
                <div className="p-4 bg-gradient-to-br from-flame-500/20 to-flame-600/10 rounded-xl text-center">
                  <p className="text-xs text-iron-400 mb-0.5">Estimated 1RM</p>
                  <p className="text-3xl font-display text-flame-400">
                    {Math.round(oneRM)} <span className="text-base text-iron-400">lbs</span>
                  </p>
                </div>

                <div className="bg-iron-800/50 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-3 text-[10px] font-medium text-iron-500 uppercase tracking-wider">
                    <div className="p-1.5 text-center">Reps</div>
                    <div className="p-1.5 text-center">%1RM</div>
                    <div className="p-1.5 text-center">Weight</div>
                  </div>
                  {percentChart.map(({ reps, pct, weight }) => (
                    <div key={reps} className={`grid grid-cols-3 text-sm ${reps === 1 ? 'bg-flame-500/10' : ''}`}>
                      <div className={`p-1.5 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-400'}`}>{reps}</div>
                      <div className={`p-1.5 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-500'}`}>{pct}%</div>
                      <div className={`p-1.5 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-200'}`}>{weight} lbs</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}