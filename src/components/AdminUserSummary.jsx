import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  Dumbbell,
  AlertTriangle,
  Gauge,
  Target,
  Heart,
  Moon,
  Timer,
  Video,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  Save,
  Copy,
  Check,
  ArrowRight,
  Pencil,
  Trash2,
  X,
  Plus,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'
import { db } from '../services/firebase'
import { ouraService } from '../services/ouraService'
import { workoutService, goalService } from '../services/firestore'

// ─── Helpers ───

function scoreColor(s) {
  if (s >= 8) return 'text-green-400'
  if (s >= 6) return 'text-yellow-400'
  if (s >= 4) return 'text-orange-400'
  return 'text-red-400'
}

function scoreBg(s) {
  if (s >= 8) return 'bg-green-500/20'
  if (s >= 6) return 'bg-yellow-500/20'
  if (s >= 4) return 'bg-orange-500/20'
  return 'bg-red-500/20'
}

function rpeColor(rpe) {
  if (rpe >= 9) return 'text-red-400'
  if (rpe >= 7) return 'text-yellow-400'
  return 'text-green-400'
}

function painColor(pain) {
  if (pain >= 7) return 'text-red-400'
  if (pain >= 4) return 'text-orange-400'
  return 'text-yellow-400'
}

function daysAgoText(d) {
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

// ─── Collapsible Section ───

function Section({ icon: Icon, iconColor, title, badge, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card-steel rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full p-4 flex items-center gap-3 hover:bg-iron-800/30 transition-colors">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="flex-1 text-left text-sm font-medium text-iron-200">{title}</span>
        {badge && <span className="text-xs px-2 py-0.5 rounded-full bg-iron-800 text-iron-400">{badge}</span>}
        {open ? <ChevronUp className="w-4 h-4 text-iron-500" /> : <ChevronDown className="w-4 h-4 text-iron-500" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Build Raw AI Context String (mirrors ask-assistant.js) ───

function buildRawContext(data) {
  const lines = []

  if (data.profile) {
    const p = data.profile
    const bits = []
    if (p.displayName) bits.push(`Name: ${p.displayName}`)
    if (p.weight) bits.push(`Weight: ${p.weight}lbs`)
    if (p.height) bits.push(`Height: ${p.height}`)
    if (p.age) bits.push(`Age: ${p.age}`)
    if (p.activityLevel) bits.push(`Activity level: ${p.activityLevel}`)
    if (bits.length) lines.push(bits.join(' | '))
  }

  if (Object.keys(data.maxLifts).length > 0) {
    const lifts = Object.entries(data.maxLifts)
      .sort((a, b) => b[1].e1rm - a[1].e1rm)
      .slice(0, 8)
      .map(([name, d]) => `${name}: ${d.e1rm}lb e1RM (${d.weight}x${d.reps})`)
    lines.push(`MAX LIFTS:\n${lifts.join('\n')}`)
  }

  if (Object.keys(data.painHistory).length > 0) {
    const pains = Object.entries(data.painHistory).map(([name, d]) => {
      let s = `${name}: ${d.maxPain}/10 pain (${d.count}x`
      if (d.lastDaysAgo != null) s += `, last ${d.lastDaysAgo}d ago`
      if (d.recentCount) s += `, ${d.recentCount}x in 30d`
      s += ')'
      return s
    })
    lines.push(`PAIN HISTORY:\n${pains.join('\n')}`)
  }

  if (Object.keys(data.rpeAverages).length > 0) {
    const rpes = Object.entries(data.rpeAverages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, avg]) => `${name}: avg RPE ${avg}`)
    lines.push(`RPE AVERAGES:\n${rpes.join('\n')}`)
  }

  if (data.recentWorkouts.length > 0) {
    const details = data.recentWorkouts.slice(0, 3).map(w => {
      let s = `--- ${w.name || 'Workout'} (${w.date}) ---`
      ;(w.exercises || []).forEach(ex => {
        s += `\n  ${ex.name} [${ex.type || 'weight'}]:`
        ;(ex.sets || []).forEach((set, i) => {
          const parts = []
          if (set.prescribedWeight) parts.push(`target: ${set.prescribedWeight}lbs x ${set.prescribedReps || '?'}`)
          if (set.actualWeight) parts.push(`actual: ${set.actualWeight}lbs x ${set.actualReps || '?'}`)
          else if (set.actualReps) parts.push(`actual: ${set.actualReps} reps`)
          if (set.prescribedTime) parts.push(`target: ${set.prescribedTime}s`)
          if (set.actualTime) parts.push(`actual: ${set.actualTime}s`)
          if (set.rpe) parts.push(`RPE ${set.rpe}`)
          if (set.painLevel > 0) parts.push(`pain ${set.painLevel}/10`)
          s += `\n    Set ${i + 1}: ${parts.join(' | ')}`
        })
      })
      return s
    }).join('\n\n')
    lines.push(`RECENT WORKOUTS (FULL DETAIL):\n${details}`)
  }

  if (data.goals.length > 0) {
    const g = data.goals.map(g => {
      const current = g.currentWeight || g.currentValue || '?'
      const target = g.targetWeight || g.targetValue || '?'
      return `${g.lift || g.metricType}: ${current} -> ${target}${g.targetDate ? ` by ${g.targetDate}` : ''}`
    })
    lines.push(`ACTIVE GOALS:\n${g.join('\n')}`)
  }

  if (data.ouraData) {
    const { latest, averages } = data.ouraData
    const info = []
    if (latest?.readiness?.score) info.push(`Today readiness: ${latest.readiness.score}/100`)
    if (latest?.sleep?.score) info.push(`Last sleep: ${latest.sleep.score}/100`)
    if (latest?.activity?.score) info.push(`Activity score: ${latest.activity.score}/100`)
    if (averages?.readinessScore) info.push(`7-day avg readiness: ${averages.readinessScore}`)
    if (info.length) lines.push(`OURA RING:\n${info.join('\n')}`)
  }

  if (data.formChecks.length > 0) {
    const fc = data.formChecks.slice(0, 5).map(f => {
      let s = `${f.exercise}: ${f.score}/10 (${f.date})`
      if (f.analysis?.focusDrill?.cue) s += ` — Focus: "${f.analysis.focusDrill.cue}"`
      if (f.analysis?.injuryRisks?.length) {
        const risks = f.analysis.injuryRisks.filter(r => r.severity !== 'low')
        if (risks.length) s += ` — Risks: ${risks.map(r => `${r.area} (${r.severity})`).join(', ')}`
      }
      return s
    })
    lines.push(`FORM CHECK HISTORY:\n${fc.join('\n')}`)
  }

  return lines.join('\n\n')
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function AdminUserSummary({ userId, userName }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [overrides, setOverrides] = useState({ maxLifts: {}, excludeExercises: [] })
  const [overridesSaving, setOverridesSaving] = useState(false)
  const [overridesSaved, setOverridesSaved] = useState(false)
  const [editingLift, setEditingLift] = useState(null)
  const [editValues, setEditValues] = useState({ e1rm: '', weight: '', reps: '' })
  const [excludeInput, setExcludeInput] = useState('')

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    try {
      // Gather all data in parallel
      const [workoutsRaw, goals, userSnap, formCheckSnap, ouraData] = await Promise.all([
        workoutService.getByUser(userId, 50),
        goalService.getByUser(userId),
        getDoc(doc(db, 'users', userId)),
        getDocs(query(
          collection(db, 'formCheckJobs'),
          where('userId', '==', userId),
          where('status', '==', 'complete'),
          orderBy('createdAt', 'desc'),
          limit(10)
        )).catch(() => {
          // Fallback: no orderBy (works without composite index)
          return getDocs(query(
            collection(db, 'formCheckJobs'),
            where('userId', '==', userId),
            where('status', '==', 'complete'),
            limit(10)
          )).catch(() => ({ docs: [] }))
        }),
        ouraService.getLatestScores(userId).catch(() => null),
      ])

      // Also get group workouts
      let groupWorkouts = []
      try {
        const gSnap = await getDocs(query(
          collection(db, 'groupWorkouts'),
          where('assignedTo', '==', userId),
          limit(50)
        ))
        groupWorkouts = gSnap.docs.map(d => ({ id: d.id, ...d.data(), _isGroup: true }))
      } catch {}

      // Merge and sort workouts
      const allWorkouts = [...workoutsRaw, ...groupWorkouts]
        .filter(w => w.status === 'completed')
        .map(w => {
          const d = w.date?.toDate ? w.date.toDate() : new Date(w.date || 0)
          return { ...w, _date: d, date: d.toISOString().split('T')[0] }
        })
        .sort((a, b) => b._date - a._date)
        .slice(0, 30)

      // Compute max lifts, pain, RPE
      const maxLifts = {}
      const painHistory = {}
      const rpeData = {}
      const exerciseFrequency = {}
      const now = new Date()
      let totalSets = 0
      let totalVolume = 0

      allWorkouts.forEach(w => {
        const daysSince = Math.floor((now - w._date) / 86400000)
        ;(w.exercises || []).forEach(ex => {
          if (!ex.name) return
          exerciseFrequency[ex.name] = (exerciseFrequency[ex.name] || 0) + 1
          ;(ex.sets || []).forEach(s => {
            const weight = parseFloat(s.actualWeight) || parseFloat(s.prescribedWeight) || 0
            const reps = parseInt(s.actualReps) || parseInt(s.prescribedReps) || 0
            const rpe = parseInt(s.rpe) || 0
            const pain = parseInt(s.painLevel) || 0

            if (!s.actualWeight && !s.actualReps && s.prescribedWeight) return
            totalSets++
            totalVolume += weight * reps

            if (weight > 0 && reps > 0 && reps <= 12) {
              const e1rm = Math.round(weight * (1 + reps / 30))
              if (!maxLifts[ex.name] || e1rm > maxLifts[ex.name].e1rm) {
                maxLifts[ex.name] = { weight, reps, e1rm, date: w.date }
              }
            }
            if (pain > 0) {
              if (!painHistory[ex.name]) painHistory[ex.name] = { count: 0, maxPain: 0, lastDaysAgo: null, recentCount: 0 }
              painHistory[ex.name].count++
              painHistory[ex.name].maxPain = Math.max(painHistory[ex.name].maxPain, pain)
              if (painHistory[ex.name].lastDaysAgo === null || daysSince < painHistory[ex.name].lastDaysAgo) {
                painHistory[ex.name].lastDaysAgo = daysSince
              }
              if (daysSince <= 30) painHistory[ex.name].recentCount++
            }
            if (rpe > 0) {
              if (!rpeData[ex.name]) rpeData[ex.name] = { total: 0, count: 0, values: [] }
              rpeData[ex.name].total += rpe
              rpeData[ex.name].count++
              rpeData[ex.name].values.push(rpe)
            }
          })
        })
      })

      const rpeAverages = {}
      Object.entries(rpeData).forEach(([n, d]) => {
        rpeAverages[n] = Math.round(d.total / d.count * 10) / 10
      })

      // Cardio workouts
      const cardioWorkouts = allWorkouts.filter(w => w.workoutType === 'cardio')

      // Form checks
      const formChecks = formCheckSnap.docs.map(d => {
        const fc = d.data()
        return {
          id: d.id,
          exercise: fc.analysis?.exercise || 'Unknown',
          score: fc.analysis?.overallScore || 0,
          quality: fc.quality || 'standard',
          frameCount: fc.frameCount || 0,
          date: fc.createdAt?.toDate?.()?.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) || '—',
          analysis: fc.analysis,
        }
      })

      // Profile
      const profile = userSnap.exists() ? userSnap.data() : {}

      // Admin notes & overrides
      setAdminNotes(profile.adminNotes || '')
      setOverrides(profile.aiContextOverrides || { maxLifts: {}, excludeExercises: [] })

      // Top exercises by frequency
      const topExercises = Object.entries(exerciseFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)

      // Workout frequency
      const workoutDates = allWorkouts.map(w => w.date)
      const uniqueDays = new Set(workoutDates).size
      const dayRange = allWorkouts.length > 1
        ? Math.max(1, Math.floor((allWorkouts[0]._date - allWorkouts[allWorkouts.length - 1]._date) / 86400000))
        : 1
      const workoutsPerWeek = Math.round((uniqueDays / dayRange) * 7 * 10) / 10

      setData({
        profile,
        recentWorkouts: allWorkouts,
        maxLifts,
        painHistory,
        rpeAverages,
        rpeData,
        goals: goals.filter(g => g.status === 'active'),
        allGoals: goals,
        cardioWorkouts,
        ouraData,
        formChecks,
        topExercises,
        totalSets,
        totalVolume,
        workoutsPerWeek,
        exerciseFrequency,
      })
    } catch (err) {
      console.error('Failed to load user summary:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { loadData() }, [loadData])

  const saveNotes = async () => {
    setNotesSaving(true)
    try {
      const ref = doc(db, 'users', userId)
      await updateDoc(ref, { adminNotes })
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save notes:', err)
    } finally {
      setNotesSaving(false)
    }
  }

  const saveOverrides = async (newOverrides) => {
    setOverrides(newOverrides)
    setOverridesSaving(true)
    try {
      const ref = doc(db, 'users', userId)
      await updateDoc(ref, { aiContextOverrides: newOverrides })
      setOverridesSaved(true)
      setTimeout(() => setOverridesSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save overrides:', err)
    } finally {
      setOverridesSaving(false)
    }
  }

  const handleOverrideLift = (name) => {
    const current = overrides.maxLifts?.[name] || data.maxLifts[name] || {}
    setEditingLift(name)
    setEditValues({
      e1rm: String(current.e1rm || ''),
      weight: String(current.weight || ''),
      reps: String(current.reps || ''),
    })
  }

  const handleSaveLiftOverride = () => {
    if (!editingLift) return
    const e1rm = parseInt(editValues.e1rm) || 0
    const weight = parseFloat(editValues.weight) || 0
    const reps = parseInt(editValues.reps) || 0
    if (!e1rm) return
    const next = {
      ...overrides,
      maxLifts: { ...overrides.maxLifts, [editingLift]: { e1rm, weight, reps } },
    }
    setEditingLift(null)
    saveOverrides(next)
  }

  const handleClearLiftOverride = (name) => {
    const { [name]: _, ...rest } = overrides.maxLifts || {}
    saveOverrides({ ...overrides, maxLifts: rest })
  }

  const handleExcludeExercise = (name) => {
    const excluded = overrides.excludeExercises || []
    if (excluded.includes(name)) return
    saveOverrides({ ...overrides, excludeExercises: [...excluded, name] })
  }

  const handleUnexclude = (name) => {
    saveOverrides({
      ...overrides,
      excludeExercises: (overrides.excludeExercises || []).filter(n => n !== name),
    })
  }

  const getEffectiveData = () => {
    if (!data) return data
    const effectiveLifts = { ...data.maxLifts }
    Object.entries(overrides.maxLifts || {}).forEach(([name, vals]) => {
      effectiveLifts[name] = { ...(effectiveLifts[name] || {}), ...vals }
    })
    ;(overrides.excludeExercises || []).forEach(name => delete effectiveLifts[name])
    return { ...data, maxLifts: effectiveLifts }
  }

  const copyRawContext = () => {
    if (!data) return
    navigator.clipboard.writeText(buildRawContext(getEffectiveData()))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="card-steel p-8 rounded-xl text-center">
        <Loader2 className="w-6 h-6 text-flame-400 animate-spin mx-auto mb-3" />
        <p className="text-sm text-iron-500">Loading AI summary for {userName || 'user'}...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="card-steel p-8 rounded-xl text-center">
        <p className="text-sm text-iron-500">Could not load user data.</p>
      </div>
    )
  }

  const globalAvgRpe = Object.values(data.rpeAverages).length > 0
    ? (Object.values(data.rpeAverages).reduce((a, b) => a + b, 0) / Object.values(data.rpeAverages).length).toFixed(1)
    : null

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="card-steel p-4 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-5 h-5 text-purple-400" />
          <h3 className="font-medium text-iron-200">AI Context Summary</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 ml-auto">
            What the AI sees
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="p-2.5 bg-iron-800/50 rounded-lg">
            <p className="text-lg font-display text-iron-100">{data.recentWorkouts.length}</p>
            <p className="text-[10px] text-iron-500">Workouts</p>
          </div>
          <div className="p-2.5 bg-iron-800/50 rounded-lg">
            <p className="text-lg font-display text-iron-100">{Object.keys(data.maxLifts).length}</p>
            <p className="text-[10px] text-iron-500">Tracked Lifts</p>
          </div>
          <div className="p-2.5 bg-iron-800/50 rounded-lg">
            <p className="text-lg font-display text-iron-100">{data.workoutsPerWeek}</p>
            <p className="text-[10px] text-iron-500">Workouts/Week</p>
          </div>
          <div className="p-2.5 bg-iron-800/50 rounded-lg">
            <p className="text-lg font-display text-iron-100">{data.totalSets}</p>
            <p className="text-[10px] text-iron-500">Total Sets</p>
          </div>
        </div>
      </div>

      {/* Admin Notes */}
      <div className="card-steel p-4 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-medium text-iron-200">Admin Notes</h3>
        </div>
        <textarea
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="Notes about this user (injuries, preferences, coaching cues, etc.)"
          rows={3}
          className="input-field w-full text-sm resize-none mb-2"
        />
        <button
          onClick={saveNotes}
          disabled={notesSaving}
          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
        >
          {notesSaved ? <Check className="w-3 h-3 text-green-400" /> : <Save className="w-3 h-3" />}
          {notesSaved ? 'Saved' : notesSaving ? 'Saving...' : 'Save Notes'}
        </button>
      </div>

      {/* Profile */}
      {(data.profile.weight || data.profile.height || data.profile.age) && (
        <Section icon={Heart} iconColor="bg-pink-500/20 text-pink-400" title="Profile & Health" defaultOpen={false}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {data.profile.weight && (
              <div className="p-2 bg-iron-800/40 rounded-lg text-center">
                <p className="text-sm font-medium text-iron-200">{data.profile.weight} lbs</p>
                <p className="text-[10px] text-iron-500">Weight</p>
              </div>
            )}
            {data.profile.height && (
              <div className="p-2 bg-iron-800/40 rounded-lg text-center">
                <p className="text-sm font-medium text-iron-200">{data.profile.height}</p>
                <p className="text-[10px] text-iron-500">Height</p>
              </div>
            )}
            {data.profile.age && (
              <div className="p-2 bg-iron-800/40 rounded-lg text-center">
                <p className="text-sm font-medium text-iron-200">{data.profile.age}</p>
                <p className="text-[10px] text-iron-500">Age</p>
              </div>
            )}
            {data.profile.activityLevel && (
              <div className="p-2 bg-iron-800/40 rounded-lg text-center">
                <p className="text-sm font-medium text-iron-200 capitalize">{data.profile.activityLevel}</p>
                <p className="text-[10px] text-iron-500">Activity</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Max Lifts */}
      {(() => {
        // Compute effective lifts: merge computed with overrides, then remove excluded
        const excluded = overrides.excludeExercises || []
        const effectiveLifts = { ...data.maxLifts }
        Object.entries(overrides.maxLifts || {}).forEach(([name, vals]) => {
          effectiveLifts[name] = { ...(effectiveLifts[name] || {}), ...vals }
        })
        excluded.forEach(name => delete effectiveLifts[name])
        const liftEntries = Object.entries(effectiveLifts).sort((a, b) => b[1].e1rm - a[1].e1rm)

        return (
          <Section
            icon={Dumbbell} iconColor="bg-flame-500/20 text-flame-400"
            title="Max Lifts (e1RM)"
            badge={<>
              {`${liftEntries.length} lifts`}
              {overridesSaving && <span className="ml-2 text-iron-500">saving...</span>}
              {overridesSaved && <span className="ml-2 text-green-400">saved</span>}
            </>}
          >
            {liftEntries.length > 0 ? (
              <div className="space-y-1.5">
                {liftEntries.map(([name, d]) => {
                  const isOverridden = !!overrides.maxLifts?.[name]
                  if (editingLift === name) {
                    return (
                      <div key={name} className="p-2 bg-iron-800/40 rounded-lg space-y-2">
                        <p className="text-sm font-medium text-iron-200">{name}</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] text-iron-500">e1RM</label>
                            <input type="number" value={editValues.e1rm} onChange={(e) => setEditValues(v => ({ ...v, e1rm: e.target.value }))}
                              className="w-full input-field text-sm py-1.5 px-2" autoFocus />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-iron-500">Weight</label>
                            <input type="number" value={editValues.weight} onChange={(e) => setEditValues(v => ({ ...v, weight: e.target.value }))}
                              className="w-full input-field text-sm py-1.5 px-2" />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-iron-500">Reps</label>
                            <input type="number" value={editValues.reps} onChange={(e) => setEditValues(v => ({ ...v, reps: e.target.value }))}
                              className="w-full input-field text-sm py-1.5 px-2" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingLift(null)} className="flex-1 py-1.5 text-xs text-iron-400 hover:text-iron-200">Cancel</button>
                          <button onClick={handleSaveLiftOverride} className="flex-1 py-1.5 text-xs bg-flame-500/15 text-flame-400 rounded-lg hover:bg-flame-500/25">Save Override</button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={name} className="flex items-center justify-between p-2 bg-iron-800/40 rounded-lg group">
                      <span className="text-sm text-iron-300 truncate flex-1">
                        {name}
                        {isOverridden && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-flame-500/20 text-flame-400">override</span>}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-iron-500">{d.weight}×{d.reps}</span>
                        <span className="text-sm font-bold text-iron-100 w-16 text-right">{d.e1rm} lb</span>
                        <button onClick={() => handleOverrideLift(name)} className="p-1 text-iron-600 hover:text-flame-400 opacity-0 group-hover:opacity-100 transition-all" title="Edit override">
                          <Pencil className="w-3 h-3" />
                        </button>
                        {isOverridden ? (
                          <button onClick={() => handleClearLiftOverride(name)} className="p-1 text-iron-600 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-all" title="Clear override">
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <button onClick={() => handleExcludeExercise(name)} className="p-1 text-iron-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all" title="Exclude from context">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-iron-500 text-center py-2">No lift data recorded</p>
            )}

            {/* Excluded Exercises */}
            {excluded.length > 0 && (
              <div className="mt-3 pt-3 border-t border-iron-800/50">
                <p className="text-[10px] text-iron-500 uppercase tracking-wider mb-2">Excluded from AI context</p>
                <div className="flex flex-wrap gap-1.5">
                  {excluded.map(name => (
                    <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs">
                      {name}
                      <button onClick={() => handleUnexclude(name)} className="hover:text-red-300"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Add exclusion */}
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && excludeInput.trim()) {
                    handleExcludeExercise(excludeInput.trim())
                    setExcludeInput('')
                  }
                }}
                placeholder="Exclude exercise by name..."
                className="flex-1 input-field text-xs py-1.5 px-2"
              />
              {excludeInput.trim() && (
                <button
                  onClick={() => { handleExcludeExercise(excludeInput.trim()); setExcludeInput('') }}
                  className="px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20"
                >
                  Exclude
                </button>
              )}
            </div>
          </Section>
        )
      })()}

      {/* Pain History */}
      <Section
        icon={AlertTriangle} iconColor="bg-red-500/20 text-red-400"
        title="Pain History"
        badge={Object.keys(data.painHistory).length > 0 ? `${Object.keys(data.painHistory).length} exercises` : 'none'}
        defaultOpen={Object.keys(data.painHistory).length > 0}
      >
        {Object.keys(data.painHistory).length > 0 ? (
          <div className="space-y-1.5">
            {Object.entries(data.painHistory)
              .sort((a, b) => b[1].maxPain - a[1].maxPain)
              .map(([name, d]) => (
                <div key={name} className="flex items-center justify-between p-2 bg-iron-800/40 rounded-lg">
                  <span className="text-sm text-iron-300 truncate flex-1">{name}</span>
                  <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                    <span className={painColor(d.maxPain)}>max {d.maxPain}/10</span>
                    <span className="text-iron-500">{d.count}× total</span>
                    {d.recentCount > 0 && <span className="text-red-400">{d.recentCount}× in 30d</span>}
                    {d.lastDaysAgo != null && <span className="text-iron-500">{daysAgoText(d.lastDaysAgo)}</span>}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-iron-500 text-center py-2">No pain reported</p>
        )}
      </Section>

      {/* RPE Averages */}
      <Section
        icon={Gauge} iconColor="bg-yellow-500/20 text-yellow-400"
        title="RPE Averages"
        badge={globalAvgRpe ? `avg ${globalAvgRpe}` : 'no data'}
        defaultOpen={false}
      >
        {Object.keys(data.rpeAverages).length > 0 ? (
          <div className="space-y-1.5">
            {Object.entries(data.rpeAverages)
              .sort((a, b) => b[1] - a[1])
              .map(([name, avg]) => (
                <div key={name} className="flex items-center justify-between p-2 bg-iron-800/40 rounded-lg">
                  <span className="text-sm text-iron-300 truncate flex-1">{name}</span>
                  <span className={`text-sm font-medium ${rpeColor(avg)}`}>RPE {avg}</span>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-iron-500 text-center py-2">No RPE data recorded</p>
        )}
      </Section>

      {/* Goals */}
      <Section
        icon={Target} iconColor="bg-purple-500/20 text-purple-400"
        title="Active Goals"
        badge={`${data.goals.length} active`}
        defaultOpen={data.goals.length > 0}
      >
        {data.goals.length > 0 ? (
          <div className="space-y-1.5">
            {data.goals.map((g, i) => {
              const current = g.currentWeight || g.currentValue || 0
              const target = g.targetWeight || g.targetValue || 0
              const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
              return (
                <div key={i} className="p-2.5 bg-iron-800/40 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-iron-200">{g.lift || g.metricType}</span>
                    <span className="text-xs text-iron-400">{current} → {target}{g.targetDate ? ` by ${g.targetDate}` : ''}</span>
                  </div>
                  <div className="h-1.5 bg-iron-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-iron-500 text-center py-2">No active goals</p>
        )}
      </Section>

      {/* Exercise Frequency */}
      <Section
        icon={Dumbbell} iconColor="bg-blue-500/20 text-blue-400"
        title="Most Frequent Exercises"
        badge={`${data.topExercises.length} exercises`}
        defaultOpen={false}
      >
        {data.topExercises.length > 0 ? (
          <div className="space-y-1.5">
            {data.topExercises.map(([name, count]) => {
              const maxCount = data.topExercises[0][1]
              return (
                <div key={name} className="flex items-center gap-3 p-2 bg-iron-800/40 rounded-lg">
                  <span className="text-sm text-iron-300 truncate flex-1">{name}</span>
                  <div className="w-20 h-1.5 bg-iron-800 rounded-full overflow-hidden flex-shrink-0">
                    <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                  <span className="text-xs text-iron-400 w-6 text-right">{count}×</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-iron-500 text-center py-2">No workout data</p>
        )}
      </Section>

      {/* Oura Ring */}
      {data.ouraData && (
        <Section icon={Moon} iconColor="bg-indigo-500/20 text-indigo-400" title="Oura Ring" defaultOpen={false}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {data.ouraData.latest?.readiness?.score && (
              <div className="p-2 bg-iron-800/40 rounded-lg text-center">
                <p className="text-lg font-display text-iron-100">{data.ouraData.latest.readiness.score}</p>
                <p className="text-[10px] text-iron-500">Readiness</p>
              </div>
            )}
            {data.ouraData.latest?.sleep?.score && (
              <div className="p-2 bg-iron-800/40 rounded-lg text-center">
                <p className="text-lg font-display text-iron-100">{data.ouraData.latest.sleep.score}</p>
                <p className="text-[10px] text-iron-500">Sleep</p>
              </div>
            )}
            {data.ouraData.latest?.activity?.score && (
              <div className="p-2 bg-iron-800/40 rounded-lg text-center">
                <p className="text-lg font-display text-iron-100">{data.ouraData.latest.activity.score}</p>
                <p className="text-[10px] text-iron-500">Activity</p>
              </div>
            )}
            {data.ouraData.averages?.readinessScore && (
              <div className="p-2 bg-iron-800/40 rounded-lg text-center">
                <p className="text-lg font-display text-iron-100">{data.ouraData.averages.readinessScore}</p>
                <p className="text-[10px] text-iron-500">7d Avg Readiness</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Form Check History */}
      <Section
        icon={Video} iconColor="bg-emerald-500/20 text-emerald-400"
        title="Form Check History"
        badge={`${data.formChecks.length} checks`}
        defaultOpen={data.formChecks.length > 0}
      >
        {data.formChecks.length > 0 ? (
          <div className="space-y-2">
            {data.formChecks.map(fc => (
              <div key={fc.id} className="p-3 bg-iron-800/40 rounded-lg">
                <div className="flex items-center gap-3 mb-1.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${scoreBg(fc.score)}`}>
                    <span className={`text-sm font-bold ${scoreColor(fc.score)}`}>{fc.score}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-iron-200">{fc.exercise}</p>
                    <p className="text-[11px] text-iron-500">{fc.date} · {fc.frameCount} frames · {fc.quality}</p>
                  </div>
                </div>
                {fc.analysis?.overallSummary && (
                  <p className="text-xs text-iron-400 mb-1.5">{fc.analysis.overallSummary}</p>
                )}
                {fc.analysis?.focusDrill && (
                  <div className="flex items-start gap-2 p-2 bg-iron-900/50 rounded-lg">
                    <Target className="w-3 h-3 text-flame-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[11px] font-medium text-flame-300">{fc.analysis.focusDrill.title}</p>
                      <p className="text-[11px] text-iron-400">{fc.analysis.focusDrill.cue}</p>
                    </div>
                  </div>
                )}
                {fc.analysis?.injuryRisks?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {fc.analysis.injuryRisks.map((r, i) => (
                      <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${
                        r.severity === 'high' ? 'bg-red-500/20 text-red-400' :
                        r.severity === 'medium' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {r.area} ({r.severity})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-iron-500 text-center py-2">No form checks yet</p>
        )}
      </Section>

      {/* Recent Workouts (set-by-set) */}
      <Section
        icon={Timer} iconColor="bg-cyan-500/20 text-cyan-400"
        title="Recent Workouts (Set Detail)"
        badge={`${data.recentWorkouts.length} workouts`}
        defaultOpen={false}
      >
        {data.recentWorkouts.slice(0, 5).map((w, wi) => (
          <div key={wi} className={`${wi > 0 ? 'mt-3 pt-3 border-t border-iron-800/50' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <Link
                to={w._isGroup ? `/workouts/group/${w.id}` : `/workouts/${w.id}`}
                className="text-sm font-medium text-iron-200 hover:text-flame-400 transition-colors flex items-center gap-1.5"
              >
                {w.name || 'Workout'}
                {w._isGroup && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">group</span>}
                <ArrowRight className="w-3 h-3 text-iron-600" />
              </Link>
              <span className="text-xs text-iron-500">{w.date}</span>
            </div>
            {(w.exercises || []).map((ex, ei) => (
              <div key={ei} className="ml-2 mb-2">
                <p className="text-xs font-medium text-iron-300 mb-1">{ex.name} <span className="text-iron-600">[{ex.type || 'weight'}]</span></p>
                {(ex.sets || []).map((s, si) => {
                  const parts = []
                  if (s.actualWeight) parts.push(`${s.actualWeight}lb × ${s.actualReps || '?'}`)
                  else if (s.actualReps) parts.push(`${s.actualReps} reps`)
                  else if (s.prescribedWeight) parts.push(`(prescribed ${s.prescribedWeight}lb × ${s.prescribedReps || '?'})`)
                  if (s.actualTime) parts.push(`${s.actualTime}s`)
                  else if (s.prescribedTime) parts.push(`(target ${s.prescribedTime}s)`)
                  if (s.rpe) parts.push(<span key="rpe" className={rpeColor(parseInt(s.rpe))}>RPE {s.rpe}</span>)
                  if (parseInt(s.painLevel) > 0) parts.push(<span key="pain" className={painColor(parseInt(s.painLevel))}>pain {s.painLevel}/10</span>)

                  return (
                    <p key={si} className="text-[11px] text-iron-500 ml-3">
                      Set {si + 1}: {parts.map((p, pi) => (
                        <span key={pi}>{pi > 0 ? ' · ' : ''}{p}</span>
                      ))}
                    </p>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
        {data.recentWorkouts.length === 0 && (
          <p className="text-sm text-iron-500 text-center py-2">No workouts recorded</p>
        )}
      </Section>

      {/* Raw AI Context */}
      <div className="card-steel rounded-xl overflow-hidden">
        <button onClick={() => setShowRaw(!showRaw)} className="w-full p-4 flex items-center gap-3 hover:bg-iron-800/30 transition-colors">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-iron-700/50 text-iron-400">
            <Brain className="w-4 h-4" />
          </div>
          <span className="flex-1 text-left text-sm font-medium text-iron-200">Raw AI Context String</span>
          <button
            onClick={(e) => { e.stopPropagation(); copyRawContext() }}
            className="text-xs px-2 py-1 rounded-md bg-iron-800 text-iron-400 hover:text-iron-200 flex items-center gap-1"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {showRaw ? <ChevronUp className="w-4 h-4 text-iron-500" /> : <ChevronDown className="w-4 h-4 text-iron-500" />}
        </button>
        <AnimatePresence>
          {showRaw && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              <pre className="px-4 pb-4 text-[11px] text-iron-400 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto bg-iron-900/50 mx-4 mb-4 p-3 rounded-lg">
                {buildRawContext(getEffectiveData()) || '(empty — no data for this user)'}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}