import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Target,
  Dumbbell,
  ChevronRight,
  Check,
  Sparkles,
  Calendar,
  Loader2,
  Pause,
  Play,
  SkipForward,
  AlertTriangle,
  Zap,
  Clock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { programService, workoutService, creditService, CREDIT_COSTS } from '../services/firestore'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../services/firebase'
import { format, addWeeks, addDays, startOfWeek, isToday, isPast, startOfDay, differenceInDays } from 'date-fns'
import { toDateString } from '../utils/dateUtils'

const DAY_TYPE_COLORS = {
  primary: { bg: 'bg-flame-500/20', text: 'text-flame-400', border: 'border-flame-500/30', dot: 'bg-flame-500' },
  volume: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  speed: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-500' },
  accessories: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-500' },
  deload: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-500' },
  test: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', dot: 'bg-yellow-500' },
}

const DAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }

export default function ProgramDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, userProfile, updateProfile, isAppAdmin } = useAuth()
  const [program, setProgram] = useState(null)
  const [loading, setLoading] = useState(true)
  const [completedWorkoutDates, setCompletedWorkoutDates] = useState(new Set())
  const [expandedWeek, setExpandedWeek] = useState(null)
  const [generatingDay, setGeneratingDay] = useState(null)

  useEffect(() => {
    if (user && id) loadProgram()
  }, [user, id])

  const loadProgram = async () => {
    try {
      const prog = await programService.get(id)
      if (!prog || prog.userId !== user.uid) {
        navigate('/programs')
        return
      }
      setProgram(prog)

      // Load workouts to check which program days have workouts generated
      const startDate = prog.startDate?.toDate ? prog.startDate.toDate() : prog.startDate ? new Date(prog.startDate) : new Date()
      const endDate = prog.endDate?.toDate ? prog.endDate.toDate() : prog.endDate ? new Date(prog.endDate) : new Date()
      let workouts = []
      try {
        workouts = await workoutService.getByDateRange(user.uid, startDate, endDate)
      } catch (e) { console.error('Error loading program workouts:', e) }

      // Only count workouts that belong to THIS program
      const programWorkouts = workouts.filter(w => w.programId === id)
      const completedDates = new Set()
      programWorkouts.forEach(w => {
        // Only count workouts that are actually completed
        if (w.status === 'completed') {
          const dateStr = toDateString(w.date)
          completedDates.add(dateStr)
        }
      })
      setCompletedWorkoutDates(completedDates)
      
      // Sync completedDays to match actual existing workouts
      const actualCompletedDays = []
      ;(prog.weeks || []).forEach(week => {
        ;(week.days || []).forEach(day => {
          const date = (() => {
            if (!prog.startDate || !day.dayOfWeek) return null
            const s = prog.startDate?.toDate ? prog.startDate.toDate() : new Date(prog.startDate)
            if (isNaN(s.getTime())) return null
            const di = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 }[day.dayOfWeek?.toLowerCase()]
            if (di === undefined) return null
            const ws = addWeeks(startOfWeek(s, { weekStartsOn: 1 }), week.weekNumber - 1)
            const offset = di >= 1 ? di - 1 : di + 6
            return addDays(ws, offset)
          })()
          if (date && completedDates.has(toDateString(date))) {
            actualCompletedDays.push(`${week.weekNumber}-${day.dayOfWeek}`)
          }
        })
      })
      // Update if out of sync
      if (JSON.stringify(actualCompletedDays.sort()) !== JSON.stringify((prog.completedDays || []).sort())) {
        programService.update(id, { completedDays: actualCompletedDays }).catch(() => {})
        prog.completedDays = actualCompletedDays
      }

      // Auto-expand current week
      const now = new Date()
      const diffDays = differenceInDays(now, startDate)
      const currentWeekIdx = Math.floor(diffDays / 7)
      if (currentWeekIdx >= 0 && currentWeekIdx < (prog.weeks?.length || 0)) {
        setExpandedWeek(currentWeekIdx)
      }
    } catch (err) {
      console.error('Error loading program:', err)
    } finally {
      setLoading(false)
    }
  }

  const getDayDate = (weekNumber, dayOfWeek) => {
    if (!program?.startDate || !dayOfWeek) return null
    const start = program.startDate?.toDate ? program.startDate.toDate() : new Date(program.startDate)
    if (isNaN(start.getTime())) return null
    const dayIdx = DAY_INDEX[dayOfWeek.toLowerCase()]
    if (dayIdx === undefined) return null
    const weekStart = addWeeks(startOfWeek(start, { weekStartsOn: 1 }), weekNumber - 1)
    const mondayIdx = 1
    const offset = dayIdx >= mondayIdx ? dayIdx - mondayIdx : dayIdx + 7 - mondayIdx
    return addDays(weekStart, offset)
  }

  const isDayCompleted = (weekNumber, dayOfWeek) => {
    const date = getDayDate(weekNumber, dayOfWeek)
    if (!date) return false
    return completedWorkoutDates.has(toDateString(date))
  }

  const isDayPast = (weekNumber, dayOfWeek) => {
    const date = getDayDate(weekNumber, dayOfWeek)
    if (!date) return false
    return isPast(startOfDay(date)) && !isToday(date)
  }

  const isDayToday = (weekNumber, dayOfWeek) => {
    const date = getDayDate(weekNumber, dayOfWeek)
    if (!date) return false
    return isToday(date)
  }

  const handleGenerateWorkout = async (weekNumber, day) => {
    const isAdmin = isAppAdmin
    const credits = userProfile?.credits ?? 0
    const cost = CREDIT_COSTS['generate-workout']
    if (!isAdmin && credits < cost) {
      alert(`Not enough credits. Need ${cost}, have ${credits}.`)
      return
    }

    const dayKey = `${weekNumber}-${day.dayOfWeek}`
    setGeneratingDay(dayKey)

    try {
      if (!isAdmin) {
        await creditService.deduct(user.uid, 'generate-workout')
        updateProfile({ credits: credits - cost })
      }

      const maxLifts = {}
      const painHistory = {}
      const workoutsSnap = await getDocs(
        query(collection(db, 'workouts'), where('userId', '==', user.uid))
      )
      workoutsSnap.docs.forEach(d => {
        const w = d.data()
        if (w.status !== 'completed') return // Only completed workouts
        ;(w.exercises || []).forEach(ex => {
          ;(ex.sets || []).forEach(s => {
            // Skip sets with only prescribed data (not actually performed)
            if (!s.actualWeight && !s.actualReps && s.prescribedWeight) return
            const weight = parseFloat(s.actualWeight || s.prescribedWeight || 0)
            const reps = parseInt(s.actualReps || s.prescribedReps || 0)
            if (weight > 0 && reps > 0) {
              const e1rm = Math.round(weight * (1 + reps / 30))
              if (!maxLifts[ex.name] || e1rm > maxLifts[ex.name].e1rm) {
                maxLifts[ex.name] = { e1rm, weight, reps }
              }
            }
            if (s.painLevel && parseInt(s.painLevel) > 0) {
              if (!painHistory[ex.name]) painHistory[ex.name] = { count: 0, maxPain: 0 }
              painHistory[ex.name].count++
              painHistory[ex.name].maxPain = Math.max(painHistory[ex.name].maxPain, parseInt(s.painLevel))
            }
          })
        })
      })

      const primaryLift = day.primaryLift || program.goal?.lifts?.[0] || program.goal?.lift || 'Bench Press'
      const currentE1rm = maxLifts[primaryLift]?.e1rm || program.goal?.current || 0
      const prompt = `Generate a workout based on this program day:
Program: ${program.name}
Week ${weekNumber} — ${day.phase || ''} Phase
Day Type: ${day.type}
Label: ${day.label}
Primary Lift: ${primaryLift} — ${day.primaryScheme} @ ${day.intensity} of current max (${currentE1rm}lb e1RM)
Accessories: ${(day.accessories || []).join(', ')}
Coach Notes: ${day.notes || 'none'}

Use actual working weights based on the athlete's data. Calculate from their e1RM.`

      const response = await fetch('/.netlify/functions/generate-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          prompt,
          workoutFocus: day.type === 'test' ? 'Testing' : day.type === 'deload' ? 'Recovery' : 'Strength',
          intensity: day.type === 'deload' ? 'recovery' : day.type === 'volume' ? 'moderate' : 'heavy',
          context: { maxLifts, painHistory, recentWorkouts: workoutsSnap.docs.slice(0, 5).map(d => d.data()) },
          model: isAdmin ? 'premium' : 'standard',
          settings: {},
          draftMode: false,
        }),
      })

      if (!response.ok) throw new Error('Failed to generate workout')
      const data = await response.json()

      const dayDate = getDayDate(weekNumber, day.dayOfWeek) || new Date()
      const workoutData = {
        ...data.workout,
        date: dayDate.toISOString(),
        programId: program.id,
        programWeek: weekNumber,
        programDayType: day.type,
        status: 'scheduled',
      }

      const saved = await workoutService.create(user.uid, workoutData)

      const dateStr = toDateString(dayDate)
      setCompletedWorkoutDates(prev => new Set([...prev, dateStr]))

      const completedDays = [...(program.completedDays || []), `${weekNumber}-${day.dayOfWeek}`]
      await programService.update(program.id, { completedDays })
      setProgram(prev => ({ ...prev, completedDays }))

      navigate(`/workouts/${saved.id}`)
    } catch (err) {
      console.error('Generate error:', err)
      if (!isAdmin) {
        await creditService.add(user.uid, CREDIT_COSTS['generate-workout']).catch(() => {})
        updateProfile({ credits })
      }
      alert('Failed to generate workout.' + (!isAdmin ? ' Credits refunded.' : ''))
    } finally {
      setGeneratingDay(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!program) return null

  const goal = program.goal || {}
  const startDate = program.startDate?.toDate ? program.startDate.toDate() : program.startDate ? new Date(program.startDate) : null
  const endDate = program.endDate?.toDate ? program.endDate.toDate() : program.endDate ? new Date(program.endDate) : null
  const startStr = startDate && !isNaN(startDate.getTime()) ? format(startDate, 'MMM d') : '—'
  const endStr = endDate && !isNaN(endDate.getTime()) ? format(endDate, 'MMM d') : '—'
  const now = new Date()
  const diffDays = differenceInDays(now, startDate)
  const currentWeekNum = Math.floor(diffDays / 7) + 1
  const totalDays = (program.weeks || []).reduce((sum, w) => sum + (w.days?.length || 0), 0)
  const completedCount = (program.completedDays || []).length
  const progress = totalDays > 0 ? Math.round((completedCount / totalDays) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto p-4 pb-32">
      <button
        onClick={() => navigate('/programs')}
        className="flex items-center gap-2 text-iron-400 hover:text-iron-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Programs
      </button>

      {/* Header */}
      <div className="card-steel p-5 rounded-xl mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            program.status === 'active' ? 'bg-flame-500/20' : 'bg-iron-800'
          }`}>
            <Target className={`w-6 h-6 ${program.status === 'active' ? 'text-flame-400' : 'text-iron-500'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-display text-iron-100">{program.name}</h1>
              {program.status === 'paused' && (
                <span className="px-2 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">Paused</span>
              )}
            </div>
            <p className="text-sm text-iron-500">
              {goal.lifts?.length > 0 ? goal.lifts.join(', ') : goal.lift || goal.type || 'Program'}
              {goal.current ? `: ${goal.current} → ${goal.target}lb` : ''}
              {' · '}{startStr} – {endStr}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-2 bg-iron-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-flame-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
          <span className="text-sm text-iron-400 font-medium">{progress}%</span>
        </div>

        <div className="flex items-center gap-4 text-xs text-iron-500">
          <span className="flex items-center gap-1"><Check className="w-3 h-3 text-green-400" /> {completedCount}/{totalDays} sessions</span>
          {currentWeekNum > 0 && currentWeekNum <= (program.weeks?.length || 0) && (
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-flame-400" /> Week {currentWeekNum}</span>
          )}
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {program.trainingDays?.length}x/week</span>
        </div>
      </div>

      {/* Phases */}
      {program.phases?.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {program.phases.map((phase, i) => {
            const isCurrentPhase = currentWeekNum >= phase.weekStart && currentWeekNum <= phase.weekEnd
            return (
              <div key={i} className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs border ${
                isCurrentPhase
                  ? 'bg-flame-500/10 border-flame-500/30 text-flame-400'
                  : 'bg-iron-800/50 border-iron-800 text-iron-400'
              }`}>
                <span className="font-medium">{phase.name}</span>
                <span className="ml-1.5 opacity-70">Wk {phase.weekStart}–{phase.weekEnd}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Weeks */}
      <div className="space-y-2">
        {program.weeks?.map((week, wi) => {
          const isCurrentWeek = week.weekNumber === currentWeekNum
          const isExpanded = expandedWeek === wi
          const weekCompleted = week.days?.every(d => isDayCompleted(week.weekNumber, d.dayOfWeek))
          const weekDaysCompleted = week.days?.filter(d => isDayCompleted(week.weekNumber, d.dayOfWeek)).length || 0

          return (
            <div key={wi} className={`card-steel rounded-xl overflow-hidden ${
              isCurrentWeek ? 'ring-1 ring-flame-500/30' : ''
            }`}>
              <button
                onClick={() => setExpandedWeek(isExpanded ? null : wi)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-iron-800/30 transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                  weekCompleted
                    ? 'bg-green-500/20 text-green-400'
                    : isCurrentWeek
                      ? 'bg-flame-500/20 text-flame-400'
                      : 'bg-iron-800 text-iron-400'
                }`}>
                  {weekCompleted ? <Check className="w-4 h-4" /> : week.weekNumber}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-iron-200">Week {week.weekNumber}</span>
                    <span className="text-xs text-iron-500">{week.phase}</span>
                    {isCurrentWeek && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-flame-500/20 text-flame-400">Current</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {week.days?.map((d, di) => {
                      const colors = DAY_TYPE_COLORS[d.type] || DAY_TYPE_COLORS.primary
                      const completed = isDayCompleted(week.weekNumber, d.dayOfWeek)
                      const past = isDayPast(week.weekNumber, d.dayOfWeek)
                      const today = isDayToday(week.weekNumber, d.dayOfWeek)
                      return (
                        <div key={di} className={`w-2 h-2 rounded-full ${
                          completed ? 'bg-green-500'
                          : today ? `${colors.dot} animate-pulse`
                          : past ? 'bg-iron-600'
                          : colors.dot + '/40'
                        }`} />
                      )
                    })}
                    <span className="text-xs text-iron-600 ml-1">
                      {weekDaysCompleted}/{week.days?.length || 0}
                    </span>
                  </div>
                </div>
                <ChevronRight className={`w-4 h-4 text-iron-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 space-y-2 border-t border-iron-800 pt-3">
                      {week.days?.map((day, di) => {
                        const colors = DAY_TYPE_COLORS[day.type] || DAY_TYPE_COLORS.primary
                        const completed = isDayCompleted(week.weekNumber, day.dayOfWeek)
                        const past = isDayPast(week.weekNumber, day.dayOfWeek)
                        const today = isDayToday(week.weekNumber, day.dayOfWeek)
                        const dayDate = getDayDate(week.weekNumber, day.dayOfWeek)
                        const dayKey = `${week.weekNumber}-${day.dayOfWeek}`
                        const isGenerating = generatingDay === dayKey

                        return (
                          <div key={di} className={`p-3 rounded-lg border transition-colors ${
                            completed
                              ? 'bg-green-500/5 border-green-500/20'
                              : today
                                ? `${colors.bg} ${colors.border} border`
                                : 'bg-iron-800/20 border-iron-800/50'
                          }`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-sm font-medium capitalize ${
                                    completed ? 'text-green-400' : 'text-iron-200'
                                  }`}>
                                    {day.dayOfWeek?.slice(0, 3)}
                                    {dayDate && <span className="text-iron-500 font-normal ml-1">{format(dayDate, 'MMM d')}</span>}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                                    {day.type}
                                  </span>
                                  {completed && <Check className="w-3.5 h-3.5 text-green-400" />}
                                  {today && !completed && (
                                    <span className="text-[10px] text-flame-400 font-medium">TODAY</span>
                                  )}
                                </div>
                                <p className="text-sm text-iron-300 mt-0.5">{day.label}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-flame-400 font-medium">
                                    {day.primaryScheme} @ {day.intensity}
                                  </span>
                                  {day.accessories?.length > 0 && (
                                    <span className="text-xs text-iron-500">+ {day.accessories.length} accessories</span>
                                  )}
                                </div>
                                {day.notes && (
                                  <p className="text-xs text-iron-500 mt-1 italic">{day.notes}</p>
                                )}
                                {day.accessories?.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {day.accessories.map((acc, ai) => (
                                      <span key={ai} className="text-[10px] px-1.5 py-0.5 bg-iron-800/50 rounded text-iron-400">
                                        {acc}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex-shrink-0">
                                {completed ? (
                                  <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center">
                                    <Check className="w-4 h-4 text-green-400" />
                                  </div>
                                ) : past && !completed ? (
                                  <div className="w-9 h-9 rounded-lg bg-iron-800 flex items-center justify-center" title="Missed">
                                    <SkipForward className="w-4 h-4 text-iron-600" />
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleGenerateWorkout(week.weekNumber, day)}
                                    disabled={isGenerating || program.status !== 'active'}
                                    className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                                      today
                                        ? 'bg-flame-500 text-white hover:bg-flame-400'
                                        : 'bg-iron-800 text-iron-300 hover:bg-iron-700'
                                    } disabled:opacity-40`}
                                    title={`Generate workout (${CREDIT_COSTS['generate-workout']} credits)`}
                                  >
                                    {isGenerating ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-3.5 h-3.5" />
                                    )}
                                    {today ? 'Start' : 'Generate'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}