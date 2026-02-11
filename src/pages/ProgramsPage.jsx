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
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { programService, goalService, creditService, CREDIT_COSTS } from '../services/firestore'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../services/firebase'
import { format, addWeeks, startOfWeek, addDays } from 'date-fns'

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
  const { user, userProfile, updateProfile, isAppAdmin } = useAuth()
  const isAdmin = isAppAdmin
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [existingGoals, setExistingGoals] = useState([])

  // Creation state
  const [goalLift, setGoalLift] = useState('Bench Press')
  const [currentMax, setCurrentMax] = useState('')
  const [targetMax, setTargetMax] = useState('')
  const [numWeeks, setNumWeeks] = useState(6)
  const [trainingDays, setTrainingDays] = useState(['monday', 'wednesday', 'friday'])
  const [prompt, setPrompt] = useState('')
  const [startDate, setStartDate] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedProgram, setGeneratedProgram] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

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
    setGoalLift(goal.lift || 'Bench Press')
    setCurrentMax(String(goal.currentWeight || ''))
    setTargetMax(String(goal.targetWeight || ''))
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
    if (!currentMax || !targetMax || trainingDays.length === 0) {
      setError('Fill in your current max, target, and training days.')
      return
    }

    // Credit check: 10 credits for program generation (admin bypasses)
    const credits = userProfile?.credits ?? 0
    const cost = 10
    if (!isAdmin && credits < cost) {
      setError(`Not enough credits. Program generation costs ${cost} credits, you have ${credits}.`)
      return
    }

    setGenerating(true)
    setError(null)
    setGeneratedProgram(null)
    startThinking()

    try {
      if (!isAdmin) {
        await creditService.deduct(user.uid, 'generate-program')
        updateProfile({ credits: credits - cost })
      }

      // Load context for AI — only completed workouts
      const maxLifts = {}
      const painHistory = {}
      const rpeAverages = {}

      const workoutsSnap = await getDocs(
        query(collection(db, 'workouts'), where('userId', '==', user.uid), limit(30))
      )
      workoutsSnap.docs.forEach(d => {
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
            if (s.painLevel && parseInt(s.painLevel) > 0) {
              if (!painHistory[ex.name]) painHistory[ex.name] = { count: 0, maxPain: 0 }
              painHistory[ex.name].count++
              painHistory[ex.name].maxPain = Math.max(painHistory[ex.name].maxPain, parseInt(s.painLevel))
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

      const response = await fetch('/.netlify/functions/generate-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          goal: { lift: goalLift, current: parseFloat(currentMax), target: parseFloat(targetMax) },
          weeks: numWeeks,
          trainingDays,
          prompt: prompt || undefined,
          context: { maxLifts, painHistory, rpeAverages: rpeAvg },
          model: isAdmin ? 'premium' : 'standard',
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
      // Refund credits
      if (!isAdmin) {
        await creditService.add(user.uid, cost).catch(() => {})
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
        goal: { lift: goalLift, current: parseFloat(currentMax), target: parseFloat(targetMax) },
        trainingDays,
        startDate: start.toISOString(),
        endDate: endDate.toISOString(),
        numWeeks,
        completedDays: [],  // track which program days have been done
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
                  {existingGoals.map(g => (
                    <button
                      key={g.id}
                      onClick={() => prefillFromGoal(g)}
                      className="px-3 py-1.5 rounded-lg text-sm bg-iron-800 text-iron-300 hover:bg-iron-700 transition-colors"
                    >
                      {g.lift}: {g.currentWeight} → {g.targetWeight}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Lift selection */}
            <div>
              <label className="block text-sm text-iron-400 mb-2">Primary Lift</label>
              <div className="flex flex-wrap gap-2">
                {COMMON_LIFTS.map(lift => (
                  <button
                    key={lift}
                    onClick={() => setGoalLift(lift)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      goalLift === lift
                        ? 'bg-flame-500 text-white'
                        : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                    }`}
                  >
                    {lift}
                  </button>
                ))}
              </div>
            </div>

            {/* Current / Target */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm text-iron-400 mb-2">Current Max (lbs)</label>
                <input
                  type="number"
                  value={currentMax}
                  onChange={(e) => setCurrentMax(e.target.value)}
                  placeholder="295"
                  className="input-field w-full"
                />
              </div>
              <div className="flex items-end pb-3">
                <ChevronRight className="w-5 h-5 text-iron-600" />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-iron-400 mb-2">Target (lbs)</label>
                <input
                  type="number"
                  value={targetMax}
                  onChange={(e) => setTargetMax(e.target.value)}
                  placeholder="350"
                  className="input-field w-full"
                />
              </div>
            </div>

            {/* Duration */}
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
              <label className="block text-sm text-iron-400 mb-2">Start Date (optional — defaults to next Monday)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field w-full"
              />
            </div>

            {/* Additional instructions */}
            <div>
              <label className="block text-sm text-iron-400 mb-2">Additional Instructions (optional)</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. I have a shoulder issue, prefer dumbbells for accessories, include paused bench..."
                rows={3}
                className="input-field w-full resize-none"
              />
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
              disabled={generating || !currentMax || !targetMax || trainingDays.length === 0}
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
                    {goalLift}: {currentMax} → {targetMax}lb · {numWeeks} weeks · {trainingDays.length}x/week
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
              {goal.lift}: {goal.current} → {goal.target}lb · {startStr} – {endStr}
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
