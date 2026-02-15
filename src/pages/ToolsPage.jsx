import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, Dumbbell, ChevronDown, Info, TrendingUp, BarChart3, Calendar, Target, ArrowRight, Video } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { workoutService, goalService } from '../services/firestore'
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns'

const COMMON_EXERCISES = [
  'Bench Press',
  'Squat',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
  'Incline Bench Press',
  'Close Grip Bench',
  'Front Squat',
  'Romanian Deadlift',
]

// 1RM Formulas
const FORMULAS = {
  epley: {
    name: 'Epley',
    calc: (weight, reps) => weight * (1 + reps / 30),
    description: 'Most common formula, good for moderate rep ranges'
  },
  brzycki: {
    name: 'Brzycki',
    calc: (weight, reps) => weight * (36 / (37 - reps)),
    description: 'Accurate for lower rep ranges (1-10)'
  },
  lombardi: {
    name: 'Lombardi',
    calc: (weight, reps) => weight * Math.pow(reps, 0.1),
    description: 'Simple formula, tends to estimate conservatively'
  },
  oconner: {
    name: "O'Conner",
    calc: (weight, reps) => weight * (1 + reps / 40),
    description: 'Similar to Epley but more conservative'
  }
}

// Calculate percentage of 1RM for rep ranges
const getPercentageChart = (oneRM) => {
  return [
    { reps: 1, percent: 100, weight: oneRM },
    { reps: 2, percent: 97, weight: oneRM * 0.97 },
    { reps: 3, percent: 94, weight: oneRM * 0.94 },
    { reps: 4, percent: 92, weight: oneRM * 0.92 },
    { reps: 5, percent: 89, weight: oneRM * 0.89 },
    { reps: 6, percent: 86, weight: oneRM * 0.86 },
    { reps: 7, percent: 83, weight: oneRM * 0.83 },
    { reps: 8, percent: 81, weight: oneRM * 0.81 },
    { reps: 9, percent: 78, weight: oneRM * 0.78 },
    { reps: 10, percent: 75, weight: oneRM * 0.75 },
    { reps: 12, percent: 69, weight: oneRM * 0.69 },
    { reps: 15, percent: 61, weight: oneRM * 0.61 },
  ]
}

export default function ToolsPage() {
  const { user, isGuest } = useAuth()
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [exercise, setExercise] = useState('')
  const [formula, setFormula] = useState('epley')
  const [showFormulaInfo, setShowFormulaInfo] = useState(false)
  
  // Analytics state
  const [workouts, setWorkouts] = useState([])
  const [goals, setGoals] = useState([])
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('4weeks') // '1week', '4weeks', '12weeks'

  useEffect(() => {
    if (user && !isGuest) {
      loadAnalyticsData()
    } else {
      setAnalyticsLoading(false)
    }
  }, [user, isGuest])

  const loadAnalyticsData = async () => {
    try {
      const [workoutsData, goalsData] = await Promise.all([
        workoutService.getByUser(user.uid),
        goalService.getByUser(user.uid)
      ])
      setWorkouts(workoutsData)
      setGoals(goalsData)
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  // Calculate analytics
  const getAnalytics = () => {
    const now = new Date()
    const rangeMap = { '1week': 7, '4weeks': 28, '12weeks': 84 }
    const days = rangeMap[timeRange]
    const startDate = subDays(now, days)
    
    const recentWorkouts = workouts.filter(w => {
      const workoutDate = w.date?.toDate?.() || new Date(w.date)
      return workoutDate >= startDate
    })

    // Workouts per week
    const weeks = Math.ceil(days / 7)
    const workoutsPerWeek = (recentWorkouts.length / weeks).toFixed(1)

    // Total sets and volume
    let totalSets = 0
    let totalVolume = 0
    const exerciseVolume = {}

    recentWorkouts.forEach(workout => {
      workout.exercises?.forEach(ex => {
        ex.sets?.forEach(set => {
          if (set.completed !== false) {
            totalSets++
            const weight = parseFloat(set.weight) || 0
            const reps = parseInt(set.reps) || 0
            totalVolume += weight * reps
            
            const exName = ex.name || 'Unknown'
            if (!exerciseVolume[exName]) exerciseVolume[exName] = 0
            exerciseVolume[exName] += weight * reps
          }
        })
      })
    })

    // Top exercises by volume
    const topExercises = Object.entries(exerciseVolume)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Weekly frequency chart data
    const weeklyData = []
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = subDays(now, (i + 1) * 7)
      const weekEnd = subDays(now, i * 7)
      const weekWorkouts = recentWorkouts.filter(w => {
        const d = w.date?.toDate?.() || new Date(w.date)
        return d >= weekStart && d < weekEnd
      }).length
      weeklyData.push({ week: weeks - i, count: weekWorkouts })
    }

    return {
      totalWorkouts: recentWorkouts.length,
      workoutsPerWeek,
      totalSets,
      totalVolume: Math.round(totalVolume),
      topExercises,
      weeklyData,
      activeGoals: goals.filter(g => g.status === 'active').length,
      completedGoals: goals.filter(g => g.status === 'completed').length
    }
  }

  const analytics = !analyticsLoading && workouts.length > 0 ? getAnalytics() : null

  const calculateOneRM = () => {
    const w = parseFloat(weight)
    const r = parseInt(reps)
    if (!w || !r || r < 1) return null
    if (r === 1) return w // If 1 rep, that's already 1RM
    if (r > 30) return null // Formulas aren't accurate above ~30 reps
    
    return FORMULAS[formula].calc(w, r)
  }

  const oneRM = calculateOneRM()
  const percentageChart = oneRM ? getPercentageChart(oneRM) : null

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-display text-iron-100">Tools</h1>
        <p className="text-iron-500 text-sm mt-1">
          Training calculators and utilities
        </p>
      </div>

      {/* Form Check */}
      <Link
        to="/form-check"
        className="card-steel rounded-xl p-4 mb-6 flex items-center gap-4 hover:bg-iron-800/80 transition-colors group"
      >
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <Video className="w-5 h-5 text-purple-400" />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-lg text-iron-100 flex items-center gap-2">
            Form Check
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 uppercase">Beta</span>
          </h2>
          <p className="text-iron-500 text-sm">Upload a video for AI-powered frame-by-frame form analysis</p>
        </div>
        <ArrowRight className="w-5 h-5 text-iron-600 group-hover:text-iron-400 transition-colors" />
      </Link>

      {/* 1RM Calculator */}
      <div className="card-steel rounded-xl overflow-hidden">
        <div className="p-4 border-b border-iron-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-flame-500/20 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-flame-400" />
          </div>
          <div>
            <h2 className="font-display text-lg text-iron-100">1RM Calculator</h2>
            <p className="text-iron-500 text-sm">Estimate your one-rep max</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Exercise Selection */}
          <div>
            <label className="block text-sm font-medium text-iron-300 mb-2">
              Exercise (optional)
            </label>
            <select
              value={exercise}
              onChange={(e) => setExercise(e.target.value)}
              className="input-field w-full text-base py-3"
            >
              <option value="">Select exercise...</option>
              {COMMON_EXERCISES.map(ex => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
          </div>

          {/* Weight and Reps */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-iron-300 mb-2">
                Weight (lbs)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="225"
                className="input-field w-full text-base py-3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-iron-300 mb-2">
                Reps Completed
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="5"
                min="1"
                max="30"
                className="input-field w-full text-base py-3"
              />
            </div>
          </div>

          {/* Formula Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-iron-300">
                Formula
              </label>
              <button
                onClick={() => setShowFormulaInfo(!showFormulaInfo)}
                className="text-iron-500 hover:text-iron-300 transition-colors"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(FORMULAS).map(([key, { name }]) => (
                <button
                  key={key}
                  onClick={() => setFormula(key)}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    formula === key
                      ? 'bg-flame-500 text-white'
                      : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
            {showFormulaInfo && (
              <p className="text-xs text-iron-500 mt-2">
                {FORMULAS[formula].description}
              </p>
            )}
          </div>

          {/* Result */}
          {oneRM && (
            <div className="mt-6 p-6 bg-gradient-to-br from-flame-500/20 to-flame-600/10 rounded-xl text-center">
              <p className="text-iron-400 text-sm mb-1">
                {exercise || 'Estimated'} 1RM
              </p>
              <p className="text-4xl font-display text-flame-400">
                {Math.round(oneRM)} <span className="text-xl text-iron-400">lbs</span>
              </p>
              <p className="text-iron-500 text-sm mt-2">
                Based on {weight} lbs × {reps} reps
              </p>
            </div>
          )}

          {/* Percentage Chart */}
          {percentageChart && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-iron-300 mb-3">
                Training Weights
              </h3>
              <div className="bg-iron-800/50 rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 gap-px bg-iron-700 text-xs font-medium text-iron-400">
                  <div className="bg-iron-800 p-2 text-center">Reps</div>
                  <div className="bg-iron-800 p-2 text-center">% of 1RM</div>
                  <div className="bg-iron-800 p-2 text-center">Weight</div>
                </div>
                {percentageChart.map(({ reps, percent, weight }) => (
                  <div 
                    key={reps} 
                    className={`grid grid-cols-3 gap-px text-sm ${
                      reps === 1 ? 'bg-flame-500/10' : ''
                    }`}
                  >
                    <div className={`p-2 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-300'}`}>
                      {reps}
                    </div>
                    <div className={`p-2 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-400'}`}>
                      {percent}%
                    </div>
                    <div className={`p-2 text-center ${reps === 1 ? 'text-flame-400 font-medium' : 'text-iron-200'}`}>
                      {Math.round(weight)} lbs
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-iron-600 mt-2 text-center">
                Use these percentages to plan your working sets
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Smart Analytics */}
      <div className="mt-6 card-steel rounded-xl overflow-hidden">
        <div className="p-4 border-b border-iron-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h2 className="font-display text-lg text-iron-100">Smart Analytics</h2>
            <p className="text-iron-500 text-sm">Your training insights</p>
          </div>
        </div>

        <div className="p-4">
          {isGuest ? (
            <div className="text-center py-8">
              <BarChart3 className="w-10 h-10 text-iron-700 mx-auto mb-2" />
              <p className="text-iron-500 text-sm mb-4">Sign in to see your training analytics</p>
              <Link to="/login" className="btn-primary text-sm">Sign In</Link>
            </div>
          ) : analyticsLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-iron-500 text-sm mt-2">Loading analytics...</p>
            </div>
          ) : !analytics ? (
            <div className="text-center py-8">
              <Dumbbell className="w-10 h-10 text-iron-700 mx-auto mb-2" />
              <p className="text-iron-500 text-sm mb-4">Complete some workouts to see analytics</p>
              <Link to="/workouts/new" className="btn-primary text-sm">Log a Workout</Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Time Range Selector */}
              <div className="flex gap-2">
                {[
                  { value: '1week', label: '1 Week' },
                  { value: '4weeks', label: '4 Weeks' },
                  { value: '12weeks', label: '12 Weeks' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setTimeRange(value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      timeRange === value
                        ? 'bg-green-500 text-white'
                        : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-iron-800/50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-display text-green-400">{analytics.totalWorkouts}</p>
                  <p className="text-xs text-iron-500">Workouts</p>
                </div>
                <div className="bg-iron-800/50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-display text-green-400">{analytics.workoutsPerWeek}</p>
                  <p className="text-xs text-iron-500">Per Week</p>
                </div>
                <div className="bg-iron-800/50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-display text-flame-400">{analytics.totalSets}</p>
                  <p className="text-xs text-iron-500">Total Sets</p>
                </div>
                <div className="bg-iron-800/50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-display text-flame-400">{(analytics.totalVolume / 1000).toFixed(0)}k</p>
                  <p className="text-xs text-iron-500">Volume (lbs)</p>
                </div>
              </div>

              {/* Weekly Chart */}
              {analytics.weeklyData.length > 1 && (
                <div>
                  <p className="text-sm text-iron-400 mb-3">Workouts Per Week</p>
                  <div className="h-24 flex items-end gap-1">
                    {analytics.weeklyData.map((week, i) => {
                      const maxCount = Math.max(...analytics.weeklyData.map(w => w.count), 1)
                      const height = (week.count / maxCount) * 100
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div 
                            className="w-full bg-gradient-to-t from-green-600 to-green-400 rounded-t transition-all"
                            style={{ height: `${Math.max(height, 4)}%` }}
                          />
                          <span className="text-[10px] text-iron-600">W{week.week}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Top Exercises */}
              {analytics.topExercises.length > 0 && (
                <div>
                  <p className="text-sm text-iron-400 mb-3">Top Exercises by Volume</p>
                  <div className="space-y-2">
                    {analytics.topExercises.map(([name, volume], i) => {
                      const maxVol = analytics.topExercises[0][1]
                      const width = (volume / maxVol) * 100
                      return (
                        <div key={name} className="flex items-center gap-3">
                          <span className="text-xs text-iron-500 w-4">{i + 1}</span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-iron-300 truncate">{name}</span>
                              <span className="text-xs text-iron-500">{(volume / 1000).toFixed(1)}k lbs</span>
                            </div>
                            <div className="h-1.5 bg-iron-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-flame-500 rounded-full"
                                style={{ width: `${width}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Goals Summary */}
              <div className="flex items-center justify-between p-3 bg-iron-800/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Target className="w-5 h-5 text-purple-400" />
                  <div>
                    <p className="text-sm text-iron-300">{analytics.activeGoals} Active Goals</p>
                    <p className="text-xs text-iron-500">{analytics.completedGoals} completed</p>
                  </div>
                </div>
                <Link to="/goals" className="text-flame-400 hover:text-flame-300">
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}