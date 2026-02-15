import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Sparkles,
  Loader2,
  ChevronRight,
  Calendar,
  Target,
  Dumbbell,
  Zap,
  Brain,
  Check,
  AlertTriangle,
  Pause,
  Play,
  Trash2,
  ArrowLeft,
  Clock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getAuthHeaders } from '../services/api'
import { programService, goalService, creditService, CREDIT_COSTS, PREMIUM_CREDIT_COST } from '../services/firestore'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../services/firebase'
import { format, addWeeks, startOfWeek, addDays } from 'date-fns'
import usePageTitle from '../utils/usePageTitle'
import { apiUrl } from '../utils/platform'

const DAYS_OF_WEEK = [
  { id: 'monday', short: 'Mon' },
  { id: 'tuesday', short: 'Tue' },
  { id: 'wednesday', short: 'Wed' },
  { id: 'thursday', short: 'Thu' },
  { id: 'friday', short: 'Fri' },
  { id: 'saturday', short: 'Sat' },
  { id: 'sunday', short: 'Sun' },
]

const COMMON_LIFTS = [
  'Bench Press', 'Squat', 'Deadlift', 'Overhead Press',
  'Incline Bench', 'Close Grip Bench',
]

const BODYWEIGHT_EXERCISES = [
  'Pull-ups', 'Push-ups', 'Dips', 'Plank', 'Handstand Hold',
  'Muscle-ups', 'L-sit', 'Pistol Squats',
]

const PROGRAM_TYPES = [
  { id: 'strength', label: 'Strength', desc: 'Barbell/dumbbell focused' },
  { id: 'bodyweight', label: 'Bodyweight', desc: 'Calisthenics & holds' },
  { id: 'mixed', label: 'Mixed', desc: 'Weights + bodyweight' },
]

const DURATION_OPTIONS = [
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
  { value: 90, label: '90 min' },
]

const THINKING_MESSAGES = [
  { text: 'Analyzing your current strength levels...', icon: 'brain' },
  { text: 'Designing periodization phases...', icon: 'calc' },
  { text: 'Calculating progressive overload targets...', icon: 'calc' },
  { text: 'Building weekly training splits...', icon: 'dumbbell' },
  { text: 'Planning deload timing...', icon: 'alert' },
  { text: 'Adding accessory exercises...', icon: 'dumbbell' },
  { text: 'Finalizing program structure...', icon: 'check' },
]

const DAY_TYPE_COLORS = {
  primary: 'bg-flame-500/20 text-flame-400 border-flame-500/30',
  volume: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  speed: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  accessories: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  deload: 'bg-green-500/20 text-green-400 border-green-500/30',
  test: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

export default function ProgramsPage() {
  const navigate = useNavigate()
  usePageTitle('Programs')
  const { user, userProfile, updateProfile, isAppAdmin } = useAuth()
  const isAdmin = isAppAdmin
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [existingGoals, setExistingGoals] = useState([])

  // Creation state
  const [programType, setProgramType] = useState('strength')
  const [goalLifts, setGoalLifts] = useState(['Bench Press']) // multi-select
  const [currentMax, setCurrentMax] = useState('')
  const [targetMax, setTargetMax] = useState('')
  const [numWeeks, setNumWeeks] = useState(6)
  const [trainingDays, setTrainingDays] = useState(['monday', 'wednesday', 'friday'])
  const [workoutDuration, setWorkoutDuration] = useState(45)
  const [prompt, setPrompt] = useState('')
  const [startDate, setStartDate] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedProgram, setGeneratedProgram] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [model, setModel] = useState('standard')
  const [customLift, setCustomLift] = useState('')

  // Thinking animation
  const [thinkingMessages, setThinkingMessages] = useState([])
  const thinkingRef = useRef(null)

  useEffect(() => {
    if (user) loadPrograms()
  }, [user])

  const loadPrograms = async () => {
    try {
      const [progs, goals] = await Promise.all([
        programService.getByUser(user.uid),
        goalService.getByUser(user.uid),
      ])
      setPrograms(progs)
      setExistingGoals(goals.filter(g => g.status === 'active'))

      // Load user context for defaults — only completed workouts
      const maxLiftsSnap = await getDocs(
        query(collection(db, 'workouts'), where('userId', '==', user.uid), limit(50))
      )
      const maxLifts = {}
      maxLiftsSnap.docs.forEach(d => {
        const w = d.data()
        if (w.status !== 'completed') return
        ;(w.exercises || []).forEach(ex => {
          ;(ex.sets || []).forEach(s => {
            if (!s.actualWeight && !s.actualReps && s.prescribedWeight) return
            const weight = parseFloat(s.actualWeight || s.prescribedWeight || 0)
            const reps = parseInt(s.actualReps || s.prescribedReps || 0)
            if (weight > 0 && reps > 0) {
              const e1rm = Math.round(weight * (1 + reps / 30))
              if (!maxLifts[ex.name] || e1rm > maxLifts[ex.name].e1rm) {
                maxLifts[ex.name] = { e1rm, weight, reps }
              }
            }
          })
        })
      })

      // Auto-fill current max if we have data
      if (maxLifts['Bench Press']) {
        setCurrentMax(String(maxLifts['Bench Press'].e1rm))
      }
    } catch (err) {
      console.error('Error loading programs:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleDay = (dayId) => {
    setTrainingDays(prev =>
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId].sort(
        (a, b) => DAYS_OF_WEEK.findIndex(d => d.id === a) - DAYS_OF_WEEK.findIndex(d => d.id === b)
      )
    )
  }

  const prefillFromGoal = (goal) => {
    const lift = goal.lift || 'Bench Press'
    if (!goalLifts.includes(lift)) setGoalLifts(prev => [...prev, lift])
    const current = goal.currentValue ?? goal.currentWeight ?? ''
    const target = goal.targetValue ?? goal.targetWeight ?? ''
    setCurrentMax(String(current))
    setTargetMax(String(target))
    if (goal.metricType === 'reps' || goal.metricType === 'time') {
      setProgramType('bodyweight')
    }
  }
  
  const toggleLift = (lift) => {
    setGoalLifts(prev => 
      prev.includes(lift)
        ? prev.filter(l => l !== lift)
        : [...prev, lift]
    )
  }

  const addCustomLift = () => {
    const trimmed = customLift.trim()
    if (trimmed && !goalLifts.includes(trimmed)) {
      setGoalLifts(prev => [...prev, trimmed])
    }
    setCustomLift('')
  }

  const startThinking = () => {
    setThinkingMessages([])
    let i = 0
    thinkingRef.current = setInterval(() => {
      if (i < THINKING_MESSAGES.length) {
        setThinkingMessages(prev => [...prev, { ...THINKING_MESSAGES[i], id: i }])
        i++
      }
    }, 1200)
  }

  const stopThinking = () => {
    if (thinkingRef.current) clearInterval(thinkingRef.current)
  }

  const handleGenerate = async () => {
    if (trainingDays.length === 0) {
      setError('Select at least one training day.')
      return
    }

    // Credit check: 10 credits for standard, 100 for premium (admin bypasses)
    const credits = userProfile?.credits ?? 0
    const cost = model === 'premium' ? PREMIUM_CREDIT_COST : CREDIT_COSTS['generate-program']
    if (!isAdmin && credits < cost) {
      setError(`Not enough credits. Program generation costs ${cost} credits, you have ${credits}.`)
      return
    }

    setGenerating(true)
    setError(null)
    setGeneratedProgram(null)
    startThinking()

    try {
      // Credits deducted server-side — just update local display
      if (!isAdmin) {
        updateProfile({ credits: credits - cost })
      }

      // Load context for AI — only completed workouts
      const maxLifts = {}
      const painHistory = {}
      const rpeAverages = {}
      const now = new Date()

      const workoutsSnap = await getDocs(
        query(collection(db, 'workouts'), where('userId', '==', user.uid), limit(30))
      )
      workoutsSnap.docs.forEach(d => {
        const w = d.data()
        if (w.status !== 'completed') return
        const workoutDate = w.date?.toDate ? w.date.toDate() : w.date ? new Date(w.date) : null
        const daysSince = workoutDate ? Math.floor((now - workoutDate) / (1000 * 60 * 60 * 24)) : null
        ;(w.exercises || []).forEach(ex => {
          ;(ex.sets || []).forEach(s => {
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
              const pain = parseInt(s.painLevel)
              if (!painHistory[ex.name]) {
                painHistory[ex.name] = { count: 0, maxPain: 0, lastDaysAgo: null, recentCount: 0 }
              }
              painHistory[ex.name].count++
              painHistory[ex.name].maxPain = Math.max(painHistory[ex.name].maxPain, pain)
              if (daysSince !== null) {
                if (painHistory[ex.name].lastDaysAgo === null || daysSince < painHistory[ex.name].lastDaysAgo) {
                  painHistory[ex.name].lastDaysAgo = daysSince
                }
                if (daysSince <= 30) painHistory[ex.name].recentCount++
              }
            }
            if (s.rpe) {
              if (!rpeAverages[ex.name]) rpeAverages[ex.name] = { sum: 0, count: 0 }
              rpeAverages[ex.name].sum += parseFloat(s.rpe)
              rpeAverages[ex.name].count++
            }
          })
        })
      })

      const rpeAvg = {}
      Object.entries(rpeAverages).forEach(([name, d]) => {
        rpeAvg[name] = Math.round((d.sum / d.count) * 10) / 10
      })

      // Build goal object based on program type
      const goal = programType === 'bodyweight' 
        ? { 
            lifts: goalLifts, 
            type: 'bodyweight',
            current: currentMax || undefined,  // reps or seconds
            target: targetMax || undefined,
          }
        : { 
            lifts: goalLifts,
            current: currentMax ? parseFloat(currentMax) : undefined,
            target: targetMax ? parseFloat(targetMax) : undefined,
            type: programType,
          }

      const authHeaders = await getAuthHeaders()
      const response = await fetch(apiUrl('generate-program'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          goal,
          weeks: numWeeks,
          trainingDays,
          workoutDuration,
          programType,
          prompt: prompt || undefined,
          context: { maxLifts, painHistory, rpeAverages: rpeAvg },
          model,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to generate program')
      }

      const data = await response.json()
      setGeneratedProgram(data.program)
      stopThinking()
      setThinkingMessages(prev => [...prev, { text: 'Program ready!', icon: 'check', id: prev.length }])
    } catch (err) {
      console.error('Generation error:', err)
      setError(err.message)
      stopThinking()
      // Server refunds on failure — restore local display
      if (!isAdmin) {
        updateProfile({ credits })
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveProgram = async () => {
    if (!generatedProgram) return
    setSaving(true)

    try {
      // Calculate start date (next occurrence of first training day, or user-specified)
      let start
      if (startDate) {
        start = new Date(startDate + 'T00:00:00')
      } else {
        // Default: next Monday
        const now = new Date()
        const nextMon = startOfWeek(addDays(now, 7), { weekStartsOn: 1 })
        start = nextMon
      }

      const endDate = addWeeks(start, numWeeks)

      const programData = {
        ...generatedProgram,
        goal: programType === 'bodyweight'
          ? { lifts: goalLifts, type: 'bodyweight', current: currentMax || null, target: targetMax || null }
          : { lifts: goalLifts, current: currentMax ? parseFloat(currentMax) : null, target: targetMax ? parseFloat(targetMax) : null, type: programType },
        trainingDays,
        workoutDuration,
        programType,
        startDate: start.toISOString(),
        endDate: endDate.toISOString(),
        numWeeks,
        completedDays: [],
        skippedDays: [],
      }

      const result = await programService.create(user.uid, programData)
      navigate(`/programs/${result.id}`)
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save program')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (programId, newStatus) => {
    try {
      await programService.update(programId, { status: newStatus })
      setPrograms(prev => prev.map(p => p.id === programId ? { ...p, status: newStatus } : p))
    } catch (err) {
      console.error('Status update error:', err)
    }
  }

  const handleDelete = async (programId) => {
    if (!confirm('Delete this program? This cannot be undone.')) return
    try {
      await programService.delete(programId)
      setPrograms(prev => prev.filter(p => p.id !== programId))
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const getThinkingIcon = (icon) => {
    switch (icon) {
      case 'brain': return <Brain className="w-3 h-3 text-purple-400" />
      case 'calc': return <Target className="w-3 h-3 text-blue-400" />
      case 'dumbbell': return <Dumbbell className="w-3 h-3 text-flame-400" />
      case 'alert': return <AlertTriangle className="w-3 h-3 text-yellow-400" />
      case 'check': return <Check className="w-3 h-3 text-green-400" />
      default: return <Zap className="w-3 h-3 text-iron-400" />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Program creation view
  if (showCreate) {
    return (
      <div className="max-w-2xl mx-auto p-4 pb-32">
        <button
          onClick={() => { setShowCreate(false); setGeneratedProgram(null); setError(null) }}
          className="flex items-center gap-2 text-iron-400 hover:text-iron-200 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Programs
        </button>

        <h1 className="text-2xl font-display text-iron-100 mb-1">Create Program</h1>
        <p className="text-sm text-iron-500 mb-6">
          AI designs a periodized plan — workouts generate on-demand when you train.
        </p>

        {!generatedProgram ? (
          <div className="space-y-6">
            {/* Prefill from existing goal */}
            {existingGoals.length > 0 && (
              <div>
                <label className="block text-sm text-iron-400 mb-2">Quick fill from a goal</label>
                <div className="flex flex-wrap gap-2">
                  {existingGoals.map(g => {
                    const current = g.currentValue ?? g.currentWeight ?? ''
                    const target = g.targetValue ?? g.targetWeight ?? ''
                    const unit = g.metricType === 'time' ? 'sec' : g.metricType === 'reps' ? 'reps' : 'lb'
                    return (
                    <button
                      key={g.id}
                      onClick={() => prefillFromGoal(g)}
                      className="px-3 py-1.5 rounded-lg text-sm bg-iron-800 text-iron-300 hover:bg-iron-700 transition-colors border border-iron-700"
                    >
                      <span className="text-flame-400">{g.lift}</span>: {current || '—'} → {target}{unit}
                    </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Program Type */}
            <div>
              <label className="block text-sm text-iron-400 mb-2">Program Type</label>
              <div className="grid grid-cols-3 gap-2">
                {PROGRAM_TYPES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setProgramType(t.id)
                      if (t.id === 'bodyweight') setGoalLifts([])
                      else if (goalLifts.length === 0) setGoalLifts(['Bench Press'])
                    }}
                    className={`p-3 rounded-xl text-center transition-colors ${
                      programType === t.id
                        ? 'bg-flame-500/20 border border-flame-500/40 text-flame-400'
                        : 'bg-iron-800 border border-iron-700 text-iron-400 hover:bg-iron-700'
                    }`}
                  >
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-iron-500 mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Lift selection — multi-select */}
            <div>
              <label className="block text-sm text-iron-400 mb-1">
                {programType === 'bodyweight' ? 'Focus Exercises' : 'Primary Lifts'}
                <span className="text-iron-600 ml-1">(select any or none)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {(programType === 'bodyweight' ? BODYWEIGHT_EXERCISES : COMMON_LIFTS).map(lift => (
                  <button
                    key={lift}
                    onClick={() => toggleLift(lift)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      goalLifts.includes(lift)
                        ? 'bg-flame-500 text-white'
                        : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                    }`}
                  >
                    {lift}
                  </button>
                ))}
                {programType === 'mixed' && (
                  <>
                    <div className="w-full border-t border-iron-800 mt-1 pt-2" />
                    {BODYWEIGHT_EXERCISES.map(lift => (
                      <button
                        key={lift}
                        onClick={() => toggleLift(lift)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          goalLifts.includes(lift)
                            ? 'bg-emerald-500 text-white'
                            : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                        }`}
                      >
                        {lift}
                      </button>
                    ))}
                  </>
                )}
                {/* Custom-added exercises */}
                {goalLifts.filter(l => 
                  !COMMON_LIFTS.includes(l) && !BODYWEIGHT_EXERCISES.includes(l)
                ).map(lift => (
                  <button
                    key={lift}
                    onClick={() => toggleLift(lift)}
                    className="px-3 py-1.5 rounded-lg text-sm bg-cyan-500 text-white flex items-center gap-1"
                  >
                    {lift} <span className="text-xs opacity-70">x</span>
                  </button>
                ))}
              </div>
              {/* Custom exercise input */}
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={customLift}
                  onChange={(e) => setCustomLift(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomLift() } }}
                  placeholder="Type any exercise..."
                  className="input-field flex-1 text-sm"
                />
                <button
                  type="button"
                  onClick={addCustomLift}
                  disabled={!customLift.trim()}
                  className="px-3 py-2 rounded-lg text-sm bg-iron-800 text-iron-300 hover:bg-iron-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Current / Target — adapts to program type */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-iron-400 mb-2">
                  {programType === 'bodyweight' ? 'Current Level' : 'Current Max (lbs)'}
                </label>
                <input
                  type={programType === 'bodyweight' ? 'text' : 'number'}
                  inputMode={programType === 'bodyweight' ? 'text' : 'decimal'}
                  value={currentMax}
                  onChange={(e) => setCurrentMax(e.target.value)}
                  placeholder={programType === 'bodyweight' ? 'e.g. 8 pull-ups, 30s plank' : '295'}
                  className="input-field w-full"
                />
              </div>
              <div className="flex items-end pb-3">
                <ChevronRight className="w-5 h-5 text-iron-600" />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-iron-400 mb-2">
                  {programType === 'bodyweight' ? 'Target' : 'Target (lbs)'}
                </label>
                <input
                  type={programType === 'bodyweight' ? 'text' : 'number'}
                  inputMode={programType === 'bodyweight' ? 'text' : 'decimal'}
                  value={targetMax}
                  onChange={(e) => setTargetMax(e.target.value)}
                  placeholder={programType === 'bodyweight' ? 'e.g. 20 pull-ups, 5min plank' : '350'}
                  className="input-field w-full"
                />
              </div>
            </div>

            {/* Workout Duration */}
            <div>
              <label className="block text-sm text-iron-400 mb-2">Workout Duration</label>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setWorkoutDuration(opt.value)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      workoutDuration === opt.value
                        ? 'bg-flame-500 text-white'
                        : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Program Length */}
            <div>
              <label className="block text-sm text-iron-400 mb-2">Program Length</label>
              <div className="flex gap-2">
                {[4, 6, 8, 10, 12].map(w => (
                  <button
                    key={w}
                    onClick={() => setNumWeeks(w)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      numWeeks === w
                        ? 'bg-flame-500 text-white'
                        : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                    }`}
                  >
                    {w}wk
                  </button>
                ))}
              </div>
            </div>

            {/* Training days */}
            <div>
              <label className="block text-sm text-iron-400 mb-2">Training Days</label>
              <div className="flex gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.id}
                    onClick={() => toggleDay(day.id)}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      trainingDays.includes(day.id)
                        ? 'bg-flame-500 text-white'
                        : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                    }`}
                  >
                    {day.short}
                  </button>
                ))}
              </div>
            </div>

            {/* Start date */}
            <div>
              <label className="block text-sm text-iron-400 mb-2">Start Date <span className="text-iron-600">(defaults to next Monday)</span></label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field w-full"
              />
            </div>

            {/* Additional instructions */}
            <div>
              <label className="block text-sm text-iron-400 mb-2">Additional Instructions <span className="text-iron-600">(optional)</span></label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. I have a shoulder issue, prefer dumbbells for accessories, focus on time under tension, include paused bench..."
                rows={3}
                className="input-field w-full resize-none"
              />
            </div>

            {/* Model selector */}
            <div>
              <label className="block text-sm text-iron-400 mb-2">AI Model</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setModel('standard')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    model === 'standard'
                      ? 'bg-flame-500 text-white'
                      : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                  }`}
                >
                  Standard
                  <span className="block text-xs opacity-70">{CREDIT_COSTS['generate-program']} credits</span>
                </button>
                <button
                  onClick={() => setModel('premium')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
                    model === 'premium'
                      ? 'bg-purple-500 text-white'
                      : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                  }`}
                >
                  Premium
                  <span className="block text-xs opacity-70">{PREMIUM_CREDIT_COST} credits</span>
                </button>
              </div>
            </div>

            {/* Thinking animation */}
            {generating && thinkingMessages.length > 0 && (
              <div className="card-steel p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 bg-flame-500 rounded-full animate-pulse" />
                  <span className="text-xs text-iron-400">AI is designing your program...</span>
                </div>
                <div className="space-y-2">
                  {thinkingMessages.map(msg => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2"
                    >
                      <div className="w-5 h-5 rounded bg-iron-800 flex items-center justify-center flex-shrink-0">
                        {getThinkingIcon(msg.icon)}
                      </div>
                      <span className={`text-sm ${msg.icon === 'check' ? 'text-green-400 font-medium' : 'text-iron-300'}`}>
                        {msg.text}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleGenerate}
              disabled={generating || trainingDays.length === 0}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {generating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Designing Program...</>
              ) : (
                <><Sparkles className="w-5 h-5" /> Generate Program <span className="text-xs opacity-70">(10 credits)</span></>
              )}
            </button>
          </div>
        ) : (
          /* Program Preview */
          <div className="space-y-6">
            <div className="card-steel p-5 rounded-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-flame-500/20 flex items-center justify-center">
                  <Target className="w-6 h-6 text-flame-400" />
                </div>
                <div>
                  <h2 className="text-lg font-display text-iron-100">{generatedProgram.name}</h2>
                  <p className="text-sm text-iron-500">
                    {goalLifts.length > 0 ? goalLifts.join(', ') : programType}
                    {currentMax && targetMax ? `: ${currentMax} → ${targetMax}${programType === 'bodyweight' ? '' : 'lb'}` : currentMax ? ` (current: ${currentMax}${programType === 'bodyweight' ? '' : 'lb'})` : ''}
                    {' · '}{numWeeks} weeks · {trainingDays.length}x/week
                  </p>
                </div>
              </div>

              {/* Phases */}
              {generatedProgram.phases?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {generatedProgram.phases.map((phase, i) => (
                    <div key={i} className="px-3 py-1.5 bg-iron-800/50 rounded-lg text-xs">
                      <span className="text-iron-300 font-medium">{phase.name}</span>
                      <span className="text-iron-500 ml-1.5">wk {phase.weekStart}-{phase.weekEnd}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Week-by-week preview */}
            <div className="space-y-3">
              {generatedProgram.weeks?.map((week, wi) => (
                <div key={wi} className="card-steel rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-iron-800/30 border-b border-iron-800 flex items-center justify-between">
                    <span className="text-sm font-medium text-iron-200">
                      Week {week.weekNumber}
                    </span>
                    <span className="text-xs text-iron-500">{week.phase}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {week.days?.map((day, di) => (
                      <div key={di} className="flex items-start gap-3 p-2.5 bg-iron-800/20 rounded-lg">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-medium border flex-shrink-0 mt-0.5 ${
                          DAY_TYPE_COLORS[day.type] || DAY_TYPE_COLORS.primary
                        }`}>
                          {day.type}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-iron-200 capitalize">
                              {day.dayOfWeek?.slice(0, 3)}
                            </span>
                            <span className="text-sm text-iron-300">—</span>
                            <span className="text-sm text-iron-300 truncate">{day.label}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-flame-400">{day.primaryScheme} @ {day.intensity}</span>
                            {day.accessories?.length > 0 && (
                              <span className="text-xs text-iron-500">+ {day.accessories.length} accessories</span>
                            )}
                          </div>
                          {day.notes && (
                            <p className="text-xs text-iron-500 mt-1">{day.notes}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => { setGeneratedProgram(null); setThinkingMessages([]) }}
                className="btn-secondary flex-1"
              >
                Regenerate
              </button>
              <button
                onClick={handleSaveProgram}
                disabled={saving}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  <><Check className="w-4 h-4" /> Start Program</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Program list view
  const activePrograms = programs.filter(p => p.status === 'active')
  const otherPrograms = programs.filter(p => p.status !== 'active')

  return (
    <div className="max-w-2xl mx-auto p-4 pb-32">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display text-iron-100">Programs</h1>
          <p className="text-sm text-iron-500">AI-designed periodized training plans</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Program
        </button>
      </div>

      {programs.length === 0 ? (
        <div className="card-steel p-10 text-center border-dashed border-iron-700">
          <div className="w-16 h-16 rounded-2xl bg-iron-800 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-iron-600" />
          </div>
          <h3 className="text-lg font-display text-iron-200 mb-2">No programs yet</h3>
          <p className="text-sm text-iron-500 mb-6 max-w-sm mx-auto">
            Programs are multi-week training plans designed by AI. Set a goal,
            pick your training days, and the AI builds the full periodization.
            Workouts generate fresh each session using your real data.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Create Your First Program
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {activePrograms.length > 0 && (
            <div>
              <h2 className="text-xs text-iron-500 uppercase tracking-wider mb-2">Active</h2>
              <div className="space-y-3">
                {activePrograms.map(program => (
                  <ProgramCard
                    key={program.id}
                    program={program}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {otherPrograms.length > 0 && (
            <div>
              <h2 className="text-xs text-iron-500 uppercase tracking-wider mb-2 mt-6">Past Programs</h2>
              <div className="space-y-3">
                {otherPrograms.map(program => (
                  <ProgramCard
                    key={program.id}
                    program={program}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProgramCard({ program, onStatusChange, onDelete }) {
  const navigate = useNavigate()
  const goal = program.goal || {}
  const totalDays = (program.weeks || []).reduce((sum, w) => sum + (w.days?.length || 0), 0)
  const completedDays = (program.completedDays || []).length
  const progress = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0

  // Calculate current week
  let currentWeek = null
  if (program.startDate) {
    const start = program.startDate?.toDate ? program.startDate.toDate() : new Date(program.startDate)
    const now = new Date()
    const diffWeeks = Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000))
    if (diffWeeks >= 0 && diffWeeks < (program.numWeeks || program.weeks?.length || 0)) {
      currentWeek = diffWeeks + 1
    }
  }

  const startStr = program.startDate
    ? format(program.startDate?.toDate ? program.startDate.toDate() : new Date(program.startDate), 'MMM d')
    : '—'
  const endStr = program.endDate
    ? format(program.endDate?.toDate ? program.endDate.toDate() : new Date(program.endDate), 'MMM d')
    : '—'

  return (
    <div className="card-steel rounded-xl overflow-hidden">
      <button
        onClick={() => navigate(`/programs/${program.id}`)}
        className="w-full p-4 text-left hover:bg-iron-800/30 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
            program.status === 'active' ? 'bg-flame-500/20' : 'bg-iron-800'
          }`}>
            <Target className={`w-5 h-5 ${program.status === 'active' ? 'text-flame-400' : 'text-iron-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-iron-100 truncate">{program.name}</h3>
              {program.status === 'paused' && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-yellow-500/20 text-yellow-400">Paused</span>
              )}
              {program.status === 'completed' && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/20 text-green-400">Done</span>
              )}
            </div>
            <p className="text-sm text-iron-500 mt-0.5">
              {goal.lifts?.length > 0 ? goal.lifts.join(', ') : goal.lift || goal.type || 'Program'}
              {goal.current && goal.target ? `: ${goal.current} → ${goal.target}${goal.type === 'bodyweight' ? '' : 'lb'}` : goal.current ? ` (${goal.current}${goal.type === 'bodyweight' ? '' : 'lb'})` : ''}
              {' · '}{startStr} – {endStr}
            </p>
            
            {/* Progress bar */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 h-1.5 bg-iron-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-flame-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-iron-500">{completedDays}/{totalDays}</span>
              {currentWeek && (
                <span className="text-xs text-flame-400">Wk {currentWeek}</span>
              )}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-iron-600 flex-shrink-0 mt-1" />
        </div>
      </button>

      {/* Actions */}
      <div className="flex border-t border-iron-800 divide-x divide-iron-800">
        {program.status === 'active' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange(program.id, 'paused') }}
            className="flex-1 py-2 text-xs text-iron-400 hover:text-yellow-400 hover:bg-iron-800/30 transition-colors flex items-center justify-center gap-1"
          >
            <Pause className="w-3 h-3" /> Pause
          </button>
        ) : program.status === 'paused' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange(program.id, 'active') }}
            className="flex-1 py-2 text-xs text-iron-400 hover:text-green-400 hover:bg-iron-800/30 transition-colors flex items-center justify-center gap-1"
          >
            <Play className="w-3 h-3" /> Resume
          </button>
        ) : null}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(program.id) }}
          className="flex-1 py-2 text-xs text-iron-400 hover:text-red-400 hover:bg-iron-800/30 transition-colors flex items-center justify-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </div>
  )
}