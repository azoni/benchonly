import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  MessageCircle,
  ArrowRight,
  Layers,
  Megaphone,
  Heart,
  Send,
  Loader2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  workoutService,
  groupWorkoutService,
  scheduleService,
  goalService,
  userService,
  programService,
} from '../services/firestore'
import { feedService } from '../services/feedService'
import { notificationService } from '../services/feedService'
import { friendService } from '../services/friendService'
import { format, startOfWeek, endOfWeek, subDays, addDays, isToday, startOfDay } from 'date-fns'
import { toDateString } from '../utils/dateUtils'
import { formatDuration } from '../utils/workoutUtils'
import OnboardingChecklist from '../components/OnboardingChecklist'
import SpecialEventModal from '../components/SpecialEventModal'
import { getActiveEvent } from '../config/specialEvents'
import usePageTitle from '../utils/usePageTitle'

export default function TodayPage() {
  usePageTitle('Today')
  const { user, userProfile, isGuest, isRealAdmin, impersonating, realUser } = useAuth()
  const navigate = useNavigate()
  const [todayWorkouts, setTodayWorkouts] = useState([])
  const [todayGroupWorkouts, setTodayGroupWorkouts] = useState([])
  const [todaySchedules, setTodaySchedules] = useState([])
  const [pendingReviews, setPendingReviews] = useState([])
  const [notifications, setNotifications] = useState([])
  const [weekStats, setWeekStats] = useState({ completed: 0, total: 0 })
  const [weekCompletedDates, setWeekCompletedDates] = useState(new Set())
  const [weekScheduledDates, setWeekScheduledDates] = useState(new Set())
  const [weekDayWorkouts, setWeekDayWorkouts] = useState({}) // dateStr -> { type, id }
  const [feedItems, setFeedItems] = useState([])
  const [feedUsers, setFeedUsers] = useState({})
  const [friendSet, setFriendSet] = useState(new Set())
  const [goals, setGoals] = useState([])
  const [todayProgramDay, setTodayProgramDay] = useState(null)
  const [nextProgramDay, setNextProgramDay] = useState(null)
  const [nextWorkout, setNextWorkout] = useState(null) // next upcoming personal or group workout
  const [hasActiveProgram, setHasActiveProgram] = useState(true) // default true to avoid flash
  const [loading, setLoading] = useState(true)
  
  // Special event state
  const [activeEvent, setActiveEvent] = useState(null)
  const [eventWorkout, setEventWorkout] = useState(null) // existing workout for active event
  const [showEventModal, setShowEventModal] = useState(false)
  const [eventUserContext, setEventUserContext] = useState(null)

  // 1RM Calculator state
  const [calcOpen, setCalcOpen] = useState(false)
  const [calcWeight, setCalcWeight] = useState('')
  const [calcReps, setCalcReps] = useState('')
  const [calcFormula, setCalcFormula] = useState('epley')

  // News & Updates state
  const [newsOpen, setNewsOpen] = useState(false)

  // Feedback state
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackCategory, setFeedbackCategory] = useState('general')
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)

  const APP_UPDATES = [
    {
      date: 'Feb 2025',
      title: 'Form Check Overhaul',
      description: 'Movement quality scores, injury risk detection with severity levels, and a focus drill with a coaching cue for your next session.',
      tag: 'AI',
    },
    {
      date: 'Feb 2025',
      title: 'Smarter Video Analysis',
      description: 'Frame extraction now skips your setup and rest to focus on the actual lift. Drag-and-drop upload with video preview.',
      tag: 'UX',
    },
    {
      date: 'Feb 2025',
      title: 'RPE Guides',
      description: 'RPE explainers on the workout generator and tooltips on generated sets so you always know what the numbers mean.',
      tag: 'UX',
    },
    {
      date: 'Feb 2025',
      title: 'Human Trainer Workouts',
      description: 'Request a custom workout built by a real trainer, or send an existing workout for expert review.',
      tag: 'New',
    },
    {
      date: 'Feb 2025',
      title: 'AI Coach Personalities',
      description: 'Choose your coaching style in Settings — Coach, Drill Sergeant, Gym Bro, Sports Scientist, or Comedy Coach.',
      tag: 'AI',
    },
    {
      date: 'Feb 2025',
      title: 'Smarter AI Chat',
      description: 'Personalized greetings, full set-by-set workout data for pain diagnosis, and dynamic quick actions.',
      tag: 'AI',
    },
    {
      date: 'Feb 2025',
      title: 'Oura Ring Integration',
      description: 'Connect your Oura Ring to feed sleep, readiness, and recovery scores into AI workout generation.',
      tag: 'Integration',
    },
    {
      date: 'Feb 2025',
      title: 'Gift Credits to Friends',
      description: 'Send credits to friends from Settings. Search your friends list and pick an amount.',
      tag: 'Social',
    },
    {
      date: 'Feb 2025',
      title: 'Premium Model for Everyone',
      description: 'GPT-4o is now available to all users at 100 credits per use.',
      tag: 'AI',
    },
    {
      date: 'Feb 2025',
      title: 'Smarter Exercise Input',
      description: 'New autocomplete when creating workouts. Type to search, and new exercises are saved for next time.',
      tag: 'UX',
    },
    {
      date: 'Jan 2025',
      title: 'Programs & Scheduling',
      description: 'Generate multi-week training programs. Calendar scheduling with daily workout targets.',
      tag: 'Core',
    },
    {
      date: 'Jan 2025',
      title: 'Friends System',
      description: 'Add friends, see their activity in your feed, and control who sees your workouts.',
      tag: 'Social',
    },
  ]

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
  const percentChart = useMemo(() => oneRM ? [
    { reps: 1, pct: 100 }, { reps: 2, pct: 97 }, { reps: 3, pct: 94 },
    { reps: 5, pct: 89 }, { reps: 8, pct: 81 }, { reps: 10, pct: 75 }, { reps: 12, pct: 69 },
  ].map(r => ({ ...r, weight: Math.round(oneRM * r.pct / 100) })) : null, [oneRM])

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
      ] = await Promise.all([
        workoutService.getByUser(user.uid, 50).catch(() => []),
        groupWorkoutService.getByUser(user.uid).catch(() => []),
        scheduleService.getByUser(user.uid).catch(() => []),
        groupWorkoutService.getPendingReviews(user.uid).catch(() => []),
        goalService.getByUser(user.uid).catch(() => []),
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
      setGoals(
        Object.values(
          goalsData
            .filter(g => g.status === 'active')
            .sort((a, b) => (a.targetDate || '').localeCompare(b.targetDate || ''))
            .reduce((acc, g) => {
              if (!acc[g.lift]) acc[g.lift] = g
              return acc
            }, {})
        )
      )

      // Load feed + users + notifications + friends in background (doesn't block page render)
      Promise.all([
        feedService.getFeed(5),
        userService.getAll(),
        notificationService.getUnread(user.uid),
        friendService.getFriendSet(user.uid),
      ]).then(([feedRes, allUsers, notifs, friends]) => {
        setFeedItems(feedRes?.items || [])
        const usersMap = {}
        ;(allUsers || []).forEach(u => { usersMap[u.uid] = u })
        setFeedUsers(usersMap)
        setNotifications(notifs || [])
        setFriendSet(friends || new Set())
      }).catch(err => console.error('[TodayPage] Feed/notifications load failed:', err))

      // This week's stats
      const completedDates = new Set()
      const scheduledDates = new Set()
      const dayWorkouts = {} // dateStr -> { type: 'personal'|'group', id }
      
      const weekWorkouts = personalWorkouts.filter(w => {
        const d = w.date?.toDate ? w.date.toDate() : new Date(w.date)
        if (d >= weekStart && d <= weekEnd) {
          const dStr = toDateString(d)
          if (w.status === 'completed') {
            completedDates.add(dStr)
          } else if (w.status === 'scheduled') {
            scheduledDates.add(dStr)
          } else {
            completedDates.add(dStr)
          }
          if (!dayWorkouts[dStr]) dayWorkouts[dStr] = { type: 'personal', id: w.id }
          return true
        }
        return false
      })
      const weekGroupWorkouts = groupWorkouts.filter(w => {
        try {
          const d = w.date?.toDate ? w.date.toDate() : new Date(w.date)
          if (d >= weekStart && d <= weekEnd) {
            const dStr = toDateString(d)
            if (w.status === 'completed') {
              completedDates.add(dStr)
            } else {
              scheduledDates.add(dStr)
            }
            if (!dayWorkouts[dStr]) dayWorkouts[dStr] = { type: 'group', id: w.id }
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
      setWeekScheduledDates(scheduledDates)
      setWeekDayWorkouts(dayWorkouts)
      const scheduledThisWeek = schedulesData.filter(s => s.type === 'recurring').reduce((sum, s) => sum + (s.days?.length || 0), 0)

      setWeekStats({
        completed: completedDates.size,
        total: Math.max(scheduledThisWeek, completedDates.size),
      })

      // Find next upcoming workout (personal or group, after today)
      const todayEnd = new Date(now)
      todayEnd.setHours(23, 59, 59, 999)
      const upcoming = []
      personalWorkouts.forEach(w => {
        if (w.status !== 'scheduled') return
        const d = w.date?.toDate ? w.date.toDate() : new Date(w.date)
        if (d > todayEnd) upcoming.push({ ...w, _date: d, _type: 'personal' })
      })
      groupWorkouts.forEach(w => {
        if (w.status === 'completed') return
        const d = w.date?.toDate ? w.date.toDate() : new Date(w.date)
        if (d > todayEnd) upcoming.push({ ...w, _date: d, _type: 'group' })
      })
      upcoming.sort((a, b) => a._date - b._date)
      setNextWorkout(upcoming[0] || null)

      // Load today's program day + next upcoming program day
      try {
        const activeProgs = await programService.getActive(user.uid)
        setHasActiveProgram(activeProgs.length > 0)
        let foundToday = false
        for (const prog of activeProgs) {
          const pd = programService.getProgramDay(prog, now)
          if (pd) { 
            setTodayProgramDay(pd)
            foundToday = true
            break 
          }
        }
        // Find next program day (search up to 14 days ahead)
        if (!foundToday) {
          for (let i = 1; i <= 14; i++) {
            const futureDate = addDays(now, i)
            for (const prog of activeProgs) {
              const pd = programService.getProgramDay(prog, futureDate)
              if (pd) {
                setNextProgramDay({ ...pd, date: futureDate })
                i = 15 // break outer
                break
              }
            }
          }
        }
      } catch (e) {
        console.error('Error loading program day:', e)
      }
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

  // Special event check
  useEffect(() => {
    if (!user || isGuest) return
    const event = getActiveEvent()
    if (!event) return
    setActiveEvent(event)

    // Check if user already has this event's workout
    const checkEvent = async () => {
      try {
        const { collection, query, where, getDocs, limit } = await import('firebase/firestore')
        const { db } = await import('../services/firebase')
        const q = query(
          collection(db, 'workouts'),
          where('userId', '==', user.uid),
          where('eventId', '==', event.id),
          limit(1)
        )
        const snap = await getDocs(q)
        if (snap.size > 0) {
          const doc = snap.docs[0]
          setEventWorkout({ id: doc.id, ...doc.data() })
        } else {
          // Show modal if they haven't seen it this session
          const dismissed = sessionStorage.getItem(`event_dismissed_${event.id}`)
          if (!dismissed) {
            setShowEventModal(true)
          }
        }

        // Build user context for workout scaling
        const allWorkouts = await workoutService.getByUser(user.uid, 20).catch(() => [])
        const maxLifts = {}
        allWorkouts.filter(w => w.status === 'completed').forEach(w => {
          w.exercises?.forEach(ex => {
            ex.sets?.forEach(set => {
              const weight = parseFloat(set.actualWeight || set.prescribedWeight)
              const reps = parseInt(set.actualReps || set.prescribedReps)
              if (weight > 0 && reps > 0 && reps <= 30) {
                const e1rm = reps === 1 ? weight : weight * (1 + reps / 30)
                if (!maxLifts[ex.name] || e1rm > maxLifts[ex.name].weight) {
                  maxLifts[ex.name] = { weight: Math.round(e1rm) }
                }
              }
            })
          })
        })
        setEventUserContext({ maxLifts })
      } catch (e) {
        console.error('Event check error:', e)
      }
    }
    checkEvent()
  }, [user])

  const hasTodayWorkout = todayWorkouts.length > 0 || todayGroupWorkouts.length > 0 || todaySchedules.length > 0 || todayProgramDay
  const allCompleted = todayWorkouts.length > 0 && todayWorkouts.every(w => w.status === 'completed' || w.status !== 'scheduled')

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim() || !user) return
    setFeedbackSending(true)
    try {
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore')
      const { db } = await import('../services/firebase')
      await addDoc(collection(db, 'feedback'), {
        userId: user.uid,
        userName: userProfile?.displayName || user?.displayName || 'Unknown',
        category: feedbackCategory,
        message: feedbackText.trim(),
        status: 'new',
        createdAt: serverTimestamp(),
      })
      setFeedbackText('')
      setFeedbackSent(true)
      setTimeout(() => setFeedbackSent(false), 3000)
    } catch (e) {
      console.error('Failed to submit feedback:', e)
      alert('Failed to send feedback. Please try again.')
    } finally {
      setFeedbackSending(false)
    }
  }

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
    <div className="max-w-2xl mx-auto pb-24 overflow-x-hidden">
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

      {/* Onboarding Checklist */}
      <OnboardingChecklist />

      {/* Special Event Card */}
      {activeEvent && (() => {
        const theme = activeEvent.theme || {}
        const isCompleted = eventWorkout?.status === 'completed'
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className={`card-steel p-4 rounded-xl border ${theme.border || 'border-flame-500/20'} ${theme.bg || 'bg-flame-500/5'}`}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{activeEvent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-iron-100">{activeEvent.name}</h3>
                  <p className="text-xs text-iron-500">
                    {isCompleted
                      ? 'Completed! Badge earned + 200 credits'
                      : eventWorkout
                        ? 'In progress — tap to continue'
                        : `${activeEvent.creditReward} credits + profile badge`
                    }
                    {activeEvent.dateLabel && !isCompleted && <> · {activeEvent.dateLabel}</>}
                  </p>
                </div>
                {isCompleted ? (
                  <span className="text-2xl">✅</span>
                ) : eventWorkout ? (
                  <Link
                    to={`/workouts/${eventWorkout.id}`}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium text-white ${theme.buttonBg || 'bg-flame-500'} ${theme.buttonHover || 'hover:bg-flame-600'} transition-colors`}
                  >
                    Continue
                  </Link>
                ) : (
                  <button
                    onClick={() => setShowEventModal(true)}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium text-white ${theme.buttonBg || 'bg-flame-500'} ${theme.buttonHover || 'hover:bg-flame-600'} transition-colors`}
                  >
                    Start
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )
      })()}

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
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-lg text-iron-100 truncate">{workout.name}</h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-cyan-500/20 text-cyan-400 rounded-full flex-shrink-0">Group</span>
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
        {todayWorkouts.map(workout => {
          const isDone = workout.status === 'completed' || workout.status !== 'scheduled'
          const isProgram = !!workout.programId
          const borderColor = isDone ? 'border-green-500/20 hover:border-green-500/40'
            : isProgram ? 'border-purple-500/20 hover:border-purple-500/40'
            : 'border-flame-500/20 hover:border-flame-500/40'
          const iconBg = isDone ? 'bg-green-500/10' : isProgram ? 'bg-purple-500/10' : 'bg-flame-500/10'
          const iconColor = isDone ? 'text-green-400' : isProgram ? 'text-purple-400' : 'text-flame-400'
          return (
          <Link
            key={workout.id}
            to={`/workouts/${workout.id}`}
            className={`card-steel p-5 mb-3 transition-colors block ${borderColor}`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                {isDone ? (
                  <Check className="w-7 h-7 text-green-400" />
                ) : (
                  <Dumbbell className={`w-7 h-7 ${iconColor}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg text-iron-100 truncate">{workout.name}</h3>
                <p className="text-sm text-iron-500 mt-0.5">
                  {workout.workoutType === 'cardio'
                    ? `${workout.duration} min`
                    : `${workout.exercises?.length || 0} exercises`}
                  {isDone && ' · Completed'}
                  {isProgram && !isDone && ' · Program'}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-iron-600" />
            </div>
          </Link>
        )})}

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
                    <h3 className="font-semibold text-lg text-iron-100 truncate">{schedule.name || 'Scheduled Activity'}</h3>
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

        {/* Program Day */}
        {todayProgramDay && !todayWorkouts.some(w => w.programId === todayProgramDay.programId) && (
          <Link
            to={`/programs/${todayProgramDay.programId}`}
            className="card-steel p-5 border-amber-500/20 hover:border-amber-500/40 transition-colors block"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Target className="w-7 h-7 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg text-iron-100 truncate">{todayProgramDay.label}</h3>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400 flex-shrink-0">
                    {todayProgramDay.type}
                  </span>
                </div>
                <p className="text-sm text-iron-500 mt-0.5">
                  {todayProgramDay.programName} · Wk {todayProgramDay.weekNumber} · {todayProgramDay.phase}
                </p>
                <p className="text-xs text-amber-400 mt-1">
                  {todayProgramDay.primaryLift}: {todayProgramDay.primaryScheme} @ {todayProgramDay.intensity}
                </p>
              </div>
              <div className="flex items-center gap-1 text-flame-400 flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
          </Link>
        )}

        {/* Program Day — Up Next (rest day) */}
        {!todayProgramDay && nextProgramDay && (
          <Link
            to={`/programs/${nextProgramDay.programId}`}
            className="card-steel p-4 border-iron-700/50 hover:border-iron-600 transition-colors block"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 text-amber-400/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-iron-500 mb-0.5">Up Next — {format(nextProgramDay.date, 'EEEE')}</p>
                <p className="text-sm font-medium text-iron-200 truncate">
                  {nextProgramDay.label}
                  <span className="ml-1.5 text-xs text-iron-500 font-normal">
                    {nextProgramDay.primaryLift}: {nextProgramDay.primaryScheme} @ {nextProgramDay.intensity}
                  </span>
                </p>
                <p className="text-xs text-iron-600 mt-0.5">
                  {nextProgramDay.programName} · Wk {nextProgramDay.weekNumber} · {nextProgramDay.phase}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-iron-600 flex-shrink-0" />
            </div>
          </Link>
        )}

        {/* Up Next — next scheduled workout (when nothing today) */}
        {!hasTodayWorkout && nextWorkout && (
          <Link
            to={nextWorkout._type === 'group' ? `/workouts/group/${nextWorkout.id}` : `/workouts/${nextWorkout.id}`}
            className="card-steel p-4 mb-3 border-iron-700/50 hover:border-iron-600 transition-colors block"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                nextWorkout._type === 'group' ? 'bg-cyan-500/10' : 'bg-flame-500/10'
              }`}>
                {nextWorkout._type === 'group' ? (
                  <Users className="w-5 h-5 text-cyan-400" />
                ) : (
                  <Dumbbell className="w-5 h-5 text-flame-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-iron-500 mb-0.5">Up Next — {format(nextWorkout._date, 'EEEE')}</p>
                <p className="text-sm font-medium text-iron-200 truncate">{nextWorkout.name || 'Scheduled Workout'}</p>
                <p className="text-xs text-iron-600 mt-0.5">
                  {nextWorkout._type === 'group' ? 'Group workout' : `${nextWorkout.exercises?.length || 0} exercises`}
                  {nextWorkout.workoutType === 'cardio' && nextWorkout.duration ? ` · ${nextWorkout.duration} min` : ''}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-iron-600 flex-shrink-0" />
            </div>
          </Link>
        )}

        {/* Empty state — nothing today */}
        {!hasTodayWorkout && (
          <div className="card-steel p-8 text-center border-dashed border-iron-700">
            <div className="w-16 h-16 rounded-2xl bg-iron-800 flex items-center justify-center mx-auto mb-4">
              <Dumbbell className="w-8 h-8 text-iron-600" />
            </div>
            <h3 className="text-lg font-display text-iron-200 mb-1">Nothing scheduled today</h3>
            <p className="text-sm text-iron-500 mb-6">Generate a workout with AI or log one manually.</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-center">
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
                Create Workout
              </Link>
            </div>
          </div>
        )}
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
                    aria-label="Approve review"
                    className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>
                  <Link
                    to={`/workouts/group/${review.id}`}
                    aria-label="View review details"
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

      {/* Notifications */}
      {notifications.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <MessageCircle className="w-3.5 h-3.5" />
              New Activity ({notifications.length})
            </h3>
            <button
              onClick={async () => {
                await notificationService.markAllAsRead(user.uid)
                setNotifications([])
              }}
              className="text-xs text-iron-500 hover:text-iron-300"
            >
              Dismiss all
            </button>
          </div>
          <div className="space-y-2">
            {notifications.slice(0, 3).map(notif => (
              <Link
                key={notif.id}
                to="/feed"
                onClick={() => notificationService.markAsRead(notif.id)}
                className="card-steel p-3 border-cyan-500/20 bg-cyan-500/5 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-iron-100 truncate">
                    {notif.fromUserName || 'Someone'} commented on your {notif.feedType === 'workout' ? 'workout' : notif.feedType === 'group_workout' ? 'group workout' : 'activity'}
                  </p>
                  <p className="text-xs text-iron-500 truncate">"{notif.commentText}"</p>
                </div>
                <ChevronRight className="w-4 h-4 text-iron-600 flex-shrink-0" />
              </Link>
            ))}
          </div>
        </motion.div>
      )}

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
              const hasScheduled = weekScheduledDates.has(dayStr)
              const dayWorkout = weekDayWorkouts[dayStr]
              const isEmpty = !hadWorkout && !hasScheduled

              const handleDayClick = () => {
                if (dayWorkout) {
                  // Has an actual workout — go to it
                  if (dayWorkout.type === 'group') {
                    navigate(`/workouts/group/${dayWorkout.id}`)
                  } else {
                    navigate(`/workouts/${dayWorkout.id}`)
                  }
                } else if (isEmpty) {
                  // Truly empty day — offer to generate
                  navigate(`/workouts/generate?date=${dayStr}`)
                }
                // If it's a recurring-schedule-only dot (green but no workout ID), do nothing
              }

              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className={`text-xs font-medium ${isCurrentDay ? 'text-flame-400' : 'text-iron-600'}`}>
                    {dayLabel}
                  </span>
                  <button
                    onClick={handleDayClick}
                    aria-label={`${format(dayDate, 'EEEE d')}${hadWorkout ? ', completed' : hasScheduled ? ', scheduled' : ''}`}
                    className={`w-8 h-8 rounded-lg flex flex-col items-center justify-center text-xs font-medium transition-colors relative ${
                      isCurrentDay
                        ? hadWorkout
                          ? 'bg-green-500/20 text-green-400 ring-2 ring-flame-500/30'
                          : 'bg-flame-500/20 text-flame-400 ring-2 ring-flame-500/30'
                        : hadWorkout
                          ? 'bg-green-500/20 text-green-400'
                          : hasScheduled
                            ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30'
                            : isPastDay
                              ? 'bg-iron-800/50 text-iron-600'
                              : 'bg-iron-800/30 text-iron-600'
                    } ${(dayWorkout || isEmpty) ? 'cursor-pointer hover:ring-2 hover:ring-flame-500/30' : 'cursor-default'}`}
                  >
                    {format(dayDate, 'd')}
                    {hadWorkout && <Check className="w-2.5 h-2.5 absolute -bottom-0.5" />}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* Active Goals */}
      {goals.length > 0 ? (
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
      ) : !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <Link to="/goals" className="card-steel p-4 flex items-center gap-3 hover:border-iron-600 transition-colors block">
            <div className="w-9 h-9 rounded-lg bg-flame-500/10 flex items-center justify-center flex-shrink-0">
              <Target className="w-5 h-5 text-flame-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-iron-200">Set a goal</p>
              <p className="text-xs text-iron-500">Track your progress toward a target</p>
            </div>
            <ChevronRight className="w-4 h-4 text-iron-600" />
          </Link>
        </motion.div>
      )}

      {/* News & Updates */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className={feedItems.length > 0 ? 'mt-6' : ''}
      >
        <button
          onClick={() => setNewsOpen(!newsOpen)}
          aria-expanded={newsOpen}
          aria-label="What's New — latest features and updates"
          className="card-steel p-4 w-full flex items-center gap-3 hover:border-iron-600 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Megaphone className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-iron-200">What's New</p>
            <p className="text-xs text-iron-500">Latest features and updates</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-iron-500 transition-transform ${newsOpen ? 'rotate-180' : ''}`} />
        </button>

        {newsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="card-steel mt-1 p-4 border-purple-500/10 max-h-80 overflow-y-auto"
          >
            <div className="space-y-3">
              {APP_UPDATES.map((update, i) => (
                <div key={i} className={`${i > 0 ? 'pt-3 border-t border-iron-800/50' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-iron-800 text-iron-400">{update.tag}</span>
                    <span className="text-xs text-iron-600">{update.date}</span>
                  </div>
                  <p className="text-sm font-medium text-iron-200">{update.title}</p>
                  <p className="text-xs text-iron-500 mt-0.5">{update.description}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* 1RM Calculator */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-2"
      >
        <button
          onClick={() => setCalcOpen(!calcOpen)}
          aria-expanded={calcOpen}
          aria-label="1RM Calculator — estimate your one-rep max"
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
                  <div className="grid grid-cols-3 text-xs font-medium text-iron-500 uppercase tracking-wider">
                    <div className="px-2 py-2 text-center">Reps</div>
                    <div className="px-2 py-2 text-center">%1RM</div>
                    <div className="px-2 py-2 text-center">Weight</div>
                  </div>
                  {percentChart.map(({ reps, pct, weight }) => (
                    <div key={reps} className={`grid grid-cols-3 text-sm ${reps === 1 ? 'bg-flame-500/10' : ''}`}>
                      <div className={`px-2 py-2 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-400'}`}>{reps}</div>
                      <div className={`px-2 py-2 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-500'}`}>{pct}%</div>
                      <div className={`px-2 py-2 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-200'}`}>{weight} lbs</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Recent Activity */}
      {(() => {
        const userGroupIds = new Set(userProfile?.groups || [])
        const visibleItems = feedItems.filter(item => {
          if (item.userId === user?.uid) return true
          const visibility = item.visibility || 'public'
          if (visibility === 'private') return false
          if (visibility === 'friends') return friendSet.has(item.userId)
          if (visibility === 'group') return item.groupId && userGroupIds.has(item.groupId)
          return true // public
        })
        return visibleItems.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-6"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs text-iron-500 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-3.5 h-3.5" />
              Recent Activity
            </h3>
            <Link to="/feed" className="text-xs text-flame-400 hover:text-flame-300">View all →</Link>
          </div>
          <div className="card-steel divide-y divide-iron-800">
            {visibleItems.slice(0, 4).map(item => {
              const feedUser = feedUsers[item.userId]
              const userName = feedUser?.displayName || 'Someone'
              const isGroupWorkout = item.type === 'group_workout' || item.groupId || item.data?.groupId
              const isOwnWorkout = item.userId === user?.uid && item.data?.workoutId
              const workoutLink = isOwnWorkout
                ? (isGroupWorkout ? `/workouts/group/${item.data.workoutId}` : `/workouts/${item.data.workoutId}`)
                : null
              const Wrapper = workoutLink ? Link : 'div'
              const wrapperProps = workoutLink ? { to: workoutLink } : {}
              return (
                <Wrapper key={item.id} {...wrapperProps} className={`flex items-center gap-3 p-3${workoutLink ? ' hover:bg-iron-800/50 transition-colors' : ''}`}>
                  <Link to={`/profile/${item.userId}`} className="w-8 h-8 rounded-full bg-iron-800 flex items-center justify-center text-iron-400 text-xs flex-shrink-0 overflow-hidden">
                    {feedUser?.photoURL ? (
                      <img src={feedUser.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <span>{userName[0]}</span>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-iron-300 truncate">
                      <span className="text-iron-200 font-medium">{userName}</span>{' '}
                      {isGroupWorkout ? `completed their workout in ${item.data?.groupName || 'a group'}` :
                       item.type === 'workout' ? `completed ${item.data?.name || 'a workout'}` :
                       item.type === 'goal_completed' ? `achieved ${item.data?.lift}` :
                       item.type === 'cardio' ? `logged ${item.data?.duration}min ${item.data?.name || 'cardio'}` :
                       item.type === 'personal_record' ? `hit a new PR on ${item.data?.exercise}` :
                       'was active'}
                      {item.data?.eventId && (
                        <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400 inline ml-1 -mt-0.5" />
                      )}
                    </p>
                    <p className="text-xs text-iron-600">
                      {item.createdAt?.toDate && format(item.createdAt.toDate(), 'EEE, h:mm a')}
                      {(item.type === 'workout' || isGroupWorkout) && (() => {
                        const dur = formatDuration(item.data?.totalSets, item.data?.duration)
                        return dur ? ` · ${dur}` : ''
                      })()}
                    </p>
                  </div>
                  {workoutLink && (
                    <ChevronRight className="w-4 h-4 text-iron-600 flex-shrink-0" />
                  )}
                </Wrapper>
              )
            })}
          </div>
        </motion.div>
      ) : null
      })()}

      {/* Feedback & Bugs */}
      {!isGuest && (
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="mt-6 card-steel p-4"
      >
        <h3 className="text-sm font-semibold text-iron-300 mb-3">Feedback & Bugs</h3>
        <div className="flex gap-2 mb-2">
          {['bug', 'feature', 'general'].map(cat => (
            <button
              key={cat}
              onClick={() => setFeedbackCategory(cat)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize ${
                feedbackCategory === cat
                  ? cat === 'bug' ? 'border-red-500/50 bg-red-500/10 text-red-400 font-semibold'
                    : cat === 'feature' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400 font-semibold'
                    : 'border-flame-500/50 bg-flame-500/10 text-flame-400 font-semibold'
                  : 'border-iron-700/60 text-iron-500 hover:border-iron-600'
              }`}
            >{cat}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder={feedbackCategory === 'bug' ? "Describe the bug..." : feedbackCategory === 'feature' ? "What would you like to see?" : "Any thoughts or feedback..."}
            rows={2}
            className="flex-1 input-field text-sm resize-none"
          />
          <button
            onClick={handleSubmitFeedback}
            disabled={!feedbackText.trim() || feedbackSending}
            aria-label={feedbackSending ? 'Sending feedback' : feedbackSent ? 'Feedback sent' : 'Send feedback'}
            className="self-end px-3 py-2 rounded-lg bg-flame-500 hover:bg-flame-600 disabled:bg-iron-700 disabled:text-iron-500 text-white transition-colors flex-shrink-0"
          >
            {feedbackSending ? <Loader2 className="w-4 h-4 animate-spin" /> : feedbackSent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {feedbackSent && <p className="text-xs text-green-400 mt-1.5">Thanks for your feedback!</p>}
      </motion.div>
      )}

      {/* Special Event Modal */}
      {showEventModal && activeEvent && (
        <SpecialEventModal
          event={activeEvent}
          userContext={eventUserContext}
          onClose={() => {
            setShowEventModal(false)
            sessionStorage.setItem(`event_dismissed_${activeEvent.id}`, '1')
          }}
        />
      )}
    </div>
  )
}