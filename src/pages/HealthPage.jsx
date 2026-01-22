import { useState, useEffect } from 'react'
import { format, subDays, parseISO, startOfDay, startOfWeek } from 'date-fns'
import {
  Moon,
  Droplets,
  Beef,
  Plus,
  TrendingUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Loader2,
  Settings,
  Flame,
  Activity
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { healthService, workoutService } from '../services/firestore'
import { 
  calculateTDEE, 
  calculateActivityCalories, 
  calculateStrengthWorkoutCalories,
  hasCompleteProfile 
} from '../services/calorieService'
import { Link } from 'react-router-dom'
import { getTodayString, toDateString, getDisplayDate } from '../utils/dateUtils'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar
} from 'recharts'

const DEFAULT_GOALS = {
  sleep: 8,
  water: 64,
  protein: 150
}

const METRIC_CONFIG = {
  sleep: {
    label: 'Sleep',
    unit: 'hours',
    icon: Moon,
    color: '#818cf8', // indigo
    bgColor: 'bg-indigo-500/20',
    textColor: 'text-indigo-400',
    placeholder: '7.5',
    step: '0.5',
    min: 4,
    max: 12
  },
  water: {
    label: 'Water',
    unit: 'oz',
    icon: Droplets,
    color: '#22d3ee', // cyan
    bgColor: 'bg-cyan-500/20',
    textColor: 'text-cyan-400',
    placeholder: '64',
    step: '8',
    min: 32,
    max: 200
  },
  protein: {
    label: 'Protein',
    unit: 'g',
    icon: Beef,
    color: '#f97316', // orange
    bgColor: 'bg-orange-500/20',
    textColor: 'text-orange-400',
    placeholder: '150',
    step: '10',
    min: 50,
    max: 300
  }
}

export default function HealthPage() {
  const { user, userProfile, isGuest } = useAuth()
  const [entries, setEntries] = useState([])
  const [workouts, setWorkouts] = useState([])
  const [calorieData, setCalorieData] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showGoalsModal, setShowGoalsModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedDate, setSelectedDate] = useState(getTodayString())
  const [chartRange, setChartRange] = useState(7) // days
  const [activeTab, setActiveTab] = useState('health') // 'health' or 'calories'
  const [formData, setFormData] = useState({
    sleep: '',
    water: '',
    protein: ''
  })
  const [goals, setGoals] = useState(() => {
    const saved = localStorage.getItem('health_goals')
    return saved ? JSON.parse(saved) : DEFAULT_GOALS
  })
  const [goalsFormData, setGoalsFormData] = useState(goals)

  useEffect(() => {
    loadEntries()
  }, [user])

  useEffect(() => {
    localStorage.setItem('health_goals', JSON.stringify(goals))
  }, [goals])

  // Calculate calorie data when workouts or profile changes
  useEffect(() => {
    if (workouts.length > 0 || userProfile) {
      calculateCalorieData()
    }
  }, [workouts, userProfile, chartRange])

  const calculateCalorieData = () => {
    const dailyTDEE = calculateTDEE(userProfile)
    const weight = userProfile?.weight || 170
    const data = []
    
    for (let i = chartRange - 1; i >= 0; i--) {
      const date = subDays(new Date(), i)
      const dateStr = format(date, 'yyyy-MM-dd')
      
      // Find workouts for this day
      const dayWorkouts = workouts.filter(w => {
        const wDate = w.date?.toDate ? w.date.toDate() : new Date(w.date)
        return format(wDate, 'yyyy-MM-dd') === dateStr
      })
      
      let exerciseCalories = 0
      dayWorkouts.forEach(w => {
        if (w.workoutType === 'cardio' && w.activityType && w.duration) {
          exerciseCalories += calculateActivityCalories(w.activityType, w.duration, weight)
        } else {
          exerciseCalories += calculateStrengthWorkoutCalories(w, weight)
        }
      })
      
      data.push({
        date: format(date, 'MMM d'),
        fullDate: dateStr,
        base: dailyTDEE,
        exercise: exerciseCalories,
        total: dailyTDEE + exerciseCalories
      })
    }
    
    setCalorieData(data)
  }

  const loadEntries = async () => {
    if (!user) return
    setLoading(true)
    try {
      if (isGuest) {
        // Sample data for guests
        const sampleData = []
        for (let i = 13; i >= 0; i--) {
          const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
          sampleData.push({
            id: `sample-${i}`,
            date,
            sleep: 6 + Math.random() * 3,
            water: 40 + Math.random() * 40,
            protein: 100 + Math.random() * 80
          })
        }
        setEntries(sampleData)
        // Sample workout data for calorie calculation
        setWorkouts([
          { date: subDays(new Date(), 1), workoutType: 'strength', exercises: [{sets: [{}, {}, {}]}, {sets: [{}, {}]}] },
          { date: subDays(new Date(), 2), workoutType: 'cardio', activityType: 'running_moderate', duration: 30 },
          { date: subDays(new Date(), 4), workoutType: 'strength', exercises: [{sets: [{}, {}, {}]}] },
        ])
      } else {
        const [healthData, workoutData] = await Promise.all([
          healthService.getByUser(user.uid, 30),
          workoutService.getByUser(user.uid, 60)
        ])
        setEntries(healthData)
        setWorkouts(workoutData)
      }
    } catch (error) {
      console.error('Error loading health data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (date = null) => {
    const targetDate = date || getTodayString()
    setSelectedDate(targetDate)
    
    // Check if entry exists for this date
    const existing = entries.find(e => e.date === targetDate)
    if (existing) {
      setFormData({
        sleep: existing.sleep?.toString() || '',
        water: existing.water?.toString() || '',
        protein: existing.protein?.toString() || ''
      })
    } else {
      setFormData({ sleep: '', water: '', protein: '' })
    }
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const entryData = {
        date: selectedDate,
        sleep: formData.sleep ? parseFloat(formData.sleep) : null,
        water: formData.water ? parseInt(formData.water) : null,
        protein: formData.protein ? parseInt(formData.protein) : null
      }

      if (isGuest) {
        // Update local state for guests
        const existing = entries.findIndex(e => e.date === selectedDate)
        if (existing >= 0) {
          setEntries(prev => prev.map((e, i) => 
            i === existing ? { ...e, ...entryData } : e
          ))
        } else {
          setEntries(prev => [...prev, { id: `guest-${Date.now()}`, ...entryData }])
        }
      } else {
        const existing = entries.find(e => e.date === selectedDate)
        if (existing) {
          await healthService.update(existing.id, entryData)
          setEntries(prev => prev.map(e => 
            e.id === existing.id ? { ...e, ...entryData } : e
          ))
        } else {
          const saved = await healthService.create(user.uid, entryData)
          setEntries(prev => [...prev, saved])
        }
      }
      
      setShowModal(false)
    } catch (error) {
      console.error('Error saving health data:', error)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Get today's entry
  const todayStr = getTodayString()
  const todayEntry = entries.find(e => e.date === todayStr)

  // Prepare chart data
  const chartData = []
  for (let i = chartRange - 1; i >= 0; i--) {
    const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
    const entry = entries.find(e => e.date === date)
    chartData.push({
      date: format(subDays(new Date(), i), 'MMM d'),
      fullDate: date,
      sleep: entry?.sleep || null,
      water: entry?.water || null,
      protein: entry?.protein || null
    })
  }

  // Calculate averages
  const validEntries = entries.filter(e => e.sleep || e.water || e.protein)
  const averages = {
    sleep: validEntries.length > 0 
      ? (validEntries.reduce((acc, e) => acc + (e.sleep || 0), 0) / validEntries.filter(e => e.sleep).length).toFixed(1)
      : '-',
    water: validEntries.length > 0
      ? Math.round(validEntries.reduce((acc, e) => acc + (e.water || 0), 0) / validEntries.filter(e => e.water).length)
      : '-',
    protein: validEntries.length > 0
      ? Math.round(validEntries.reduce((acc, e) => acc + (e.protein || 0), 0) / validEntries.filter(e => e.protein).length)
      : '-'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Calculate calorie totals
  const todayCalories = calorieData.find(d => d.fullDate === todayStr)
  const weekCalories = calorieData.reduce((sum, d) => sum + d.total, 0)
  const weekStartDay = userProfile?.settings?.weekStartDay || 'monday'

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-display text-iron-100">Health</h1>
          <p className="text-iron-500 text-sm mt-1">
            Track sleep, hydration, nutrition & calories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setGoalsFormData(goals)
              setShowGoalsModal(true)
            }}
            className="p-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-lg transition-colors"
            title="Adjust Goals"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Log Today
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="card-steel p-1 mb-6 flex gap-1">
        <button
          onClick={() => setActiveTab('health')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors ${
            activeTab === 'health'
              ? 'bg-flame-500 text-white'
              : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800'
          }`}
        >
          <Moon className="w-4 h-4" />
          Health Metrics
        </button>
        <button
          onClick={() => setActiveTab('calories')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors ${
            activeTab === 'calories'
              ? 'bg-flame-500 text-white'
              : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800'
          }`}
        >
          <Flame className="w-4 h-4" />
          Calories
        </button>
      </div>

      {activeTab === 'calories' ? (
        /* Calories Tab */
        <div className="space-y-6">
          {/* Calorie Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card-steel p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-flame-500/20 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-flame-400" />
                </div>
                <div>
                  <p className="text-sm text-iron-500">Today</p>
                  <p className="text-2xl font-display text-iron-100">
                    {todayCalories?.total?.toLocaleString() || '-'}
                  </p>
                </div>
              </div>
              <div className="text-xs text-iron-500">
                Base: {todayCalories?.base?.toLocaleString() || '-'} + Exercise: {todayCalories?.exercise?.toLocaleString() || '0'}
              </div>
            </div>
            
            <div className="card-steel p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm text-iron-500">This Week</p>
                  <p className="text-2xl font-display text-iron-100">
                    {weekCalories.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-xs text-iron-500">
                Resets {weekStartDay === 'monday' ? 'Monday' : 'Sunday'}
              </div>
            </div>
          </div>

          {/* Profile Status */}
          {!hasCompleteProfile(userProfile) && (
            <Link 
              to="/settings"
              className="block card-steel p-4 border-yellow-500/30 hover:border-yellow-500/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-sm font-medium text-iron-200">Complete your profile for accurate estimates</p>
                  <p className="text-xs text-iron-500">Add weight, height, age for personalized calorie calculations</p>
                </div>
              </div>
            </Link>
          )}

          {/* Calorie Chart */}
          <div className="card-steel p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-iron-400">Daily Calories ({chartRange} days)</h3>
              <div className="flex gap-2">
                {[7, 14, 30].map(days => (
                  <button
                    key={days}
                    onClick={() => setChartRange(days)}
                    className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                      chartRange === days
                        ? 'bg-flame-500 text-white'
                        : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
            
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={calorieData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#6b7280" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#6b7280" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#9ca3af' }}
                    formatter={(value, name) => [value.toLocaleString(), name === 'base' ? 'Base (TDEE)' : 'Exercise']}
                  />
                  <Legend />
                  <Bar dataKey="base" stackId="a" fill="#6b7280" name="Base (TDEE)" />
                  <Bar dataKey="exercise" stackId="a" fill="#f97316" name="Exercise" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card-steel overflow-hidden">
            <div className="p-4 border-b border-iron-800">
              <h3 className="text-sm font-medium text-iron-400 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Recent Activity
              </h3>
            </div>
            <div className="divide-y divide-iron-800">
              {workouts.slice(0, 5).map(workout => {
                const date = workout.date?.toDate ? workout.date.toDate() : new Date(workout.date)
                const weight = userProfile?.weight || 170
                const calories = workout.workoutType === 'cardio' && workout.activityType
                  ? calculateActivityCalories(workout.activityType, workout.duration, weight)
                  : calculateStrengthWorkoutCalories(workout, weight)
                
                return (
                  <div key={workout.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-iron-200">{workout.name || 'Workout'}</p>
                      <p className="text-xs text-iron-500">
                        {format(date, 'MMM d')} · {workout.workoutType === 'cardio' ? `${workout.duration}min` : `${workout.exercises?.length || 0} exercises`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-flame-400">+{calories}</p>
                      <p className="text-xs text-iron-500">calories</p>
                    </div>
                  </div>
                )
              })}
              {workouts.length === 0 && (
                <p className="p-4 text-center text-iron-500 text-sm">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Health Metrics Tab */
        <>
      {/* Today's Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {Object.entries(METRIC_CONFIG).map(([key, metric]) => {
          const Icon = metric.icon
          const value = todayEntry?.[key]
          const target = goals[key]
          const percentage = value ? Math.min(100, (value / target) * 100) : 0
          
          return (
            <div 
              key={key}
              onClick={() => handleOpenModal(todayStr)}
              className="card-steel p-4 cursor-pointer hover:border-iron-600 transition-colors"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg ${metric.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${metric.textColor}`} />
                </div>
                <span className="text-sm text-iron-400">{metric.label}</span>
              </div>
              
              <div className="mb-2">
                <span className="text-2xl font-display text-iron-100">
                  {value ? (key === 'sleep' ? value.toFixed(1) : Math.round(value)) : '-'}
                </span>
                <span className="text-sm text-iron-500 ml-1">{metric.unit}</span>
              </div>
              
              <div className="h-1.5 bg-iron-800 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all"
                  style={{ 
                    width: `${percentage}%`,
                    backgroundColor: metric.color
                  }}
                />
              </div>
              <p className="text-xs text-iron-600 mt-1">
                Goal: {target} {metric.unit}
              </p>
            </div>
          )
        })}
      </div>

      {/* Averages */}
      <div className="card-steel p-4 mb-6">
        <h3 className="text-sm font-medium text-iron-400 mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          {chartRange}-Day Averages
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(METRIC_CONFIG).map(([key, metric]) => (
            <div key={key} className="text-center">
              <p className={`text-xl font-display ${metric.textColor}`}>
                {averages[key]} <span className="text-sm text-iron-500">{metric.unit}</span>
              </p>
              <p className="text-xs text-iron-500">{metric.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="card-steel p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-iron-400">Progress</h3>
          <div className="flex gap-2">
            {[7, 14, 30].map(days => (
              <button
                key={days}
                onClick={() => setChartRange(days)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  chartRange === days
                    ? 'bg-flame-500 text-white'
                    : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
        
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="date" 
                stroke="#6b7280" 
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                yAxisId="left"
                stroke="#6b7280" 
                fontSize={12}
                tickLine={false}
                domain={[0, 'auto']}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#6b7280" 
                fontSize={12}
                tickLine={false}
                domain={[0, 'auto']}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="sleep" 
                stroke={METRIC_CONFIG.sleep.color}
                strokeWidth={2}
                dot={{ fill: METRIC_CONFIG.sleep.color, strokeWidth: 0, r: 3 }}
                connectNulls
                name="Sleep (hrs)"
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="water" 
                stroke={METRIC_CONFIG.water.color}
                strokeWidth={2}
                dot={{ fill: METRIC_CONFIG.water.color, strokeWidth: 0, r: 3 }}
                connectNulls
                name="Water (oz)"
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="protein" 
                stroke={METRIC_CONFIG.protein.color}
                strokeWidth={2}
                dot={{ fill: METRIC_CONFIG.protein.color, strokeWidth: 0, r: 3 }}
                connectNulls
                name="Protein (g)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Entries */}
      <div className="card-steel overflow-hidden">
        <div className="p-4 border-b border-iron-800">
          <h3 className="text-sm font-medium text-iron-400 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Recent Entries
          </h3>
        </div>
        <div className="divide-y divide-iron-800">
          {chartData.slice().reverse().slice(0, 7).map((day) => {
            const hasData = day.sleep || day.water || day.protein
            return (
              <div 
                key={day.fullDate}
                onClick={() => handleOpenModal(day.fullDate)}
                className="p-4 flex items-center justify-between hover:bg-iron-800/50 cursor-pointer transition-colors"
              >
                <div>
                  <p className="text-sm text-iron-200">{day.date}</p>
                  <p className="text-xs text-iron-500">
                    {day.fullDate === todayStr ? 'Today' : format(parseISO(day.fullDate), 'EEEE')}
                  </p>
                </div>
                {hasData ? (
                  <div className="flex items-center gap-4 text-sm">
                    {day.sleep && (
                      <span className={METRIC_CONFIG.sleep.textColor}>
                        {day.sleep.toFixed(1)}h
                      </span>
                    )}
                    {day.water && (
                      <span className={METRIC_CONFIG.water.textColor}>
                        {Math.round(day.water)}oz
                      </span>
                    )}
                    {day.protein && (
                      <span className={METRIC_CONFIG.protein.textColor}>
                        {Math.round(day.protein)}g
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-iron-600">No data</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
      </>
      )}

      {/* Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-iron-900 rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-iron-800 flex items-center justify-between">
              <h2 className="text-lg font-display text-iron-100">
                {format(parseISO(selectedDate), 'MMMM d, yyyy')}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-iron-400 hover:text-iron-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {Object.entries(METRIC_CONFIG).map(([key, metric]) => {
                const Icon = metric.icon
                return (
                  <div key={key}>
                    <label className="flex items-center gap-2 text-sm font-medium text-iron-300 mb-2">
                      <Icon className={`w-4 h-4 ${metric.textColor}`} />
                      {metric.label} ({metric.unit})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={formData[key]}
                      onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={metric.placeholder}
                      className="input-field w-full text-base py-3"
                    />
                  </div>
                )
              })}
            </div>
            
            <div className="p-4 border-t border-iron-800 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goals Modal */}
      {showGoalsModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-iron-900 rounded-xl w-full max-w-md">
            <div className="p-4 border-b border-iron-800 flex items-center justify-between">
              <h2 className="text-lg font-display text-iron-100">
                Daily Goals
              </h2>
              <button
                onClick={() => setShowGoalsModal(false)}
                className="p-2 text-iron-400 hover:text-iron-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {Object.entries(METRIC_CONFIG).map(([key, metric]) => {
                const Icon = metric.icon
                return (
                  <div key={key}>
                    <label className="flex items-center gap-2 text-sm font-medium text-iron-300 mb-2">
                      <Icon className={`w-4 h-4 ${metric.textColor}`} />
                      {metric.label} Goal ({metric.unit})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={metric.step}
                      min={metric.min}
                      max={metric.max}
                      value={goalsFormData[key]}
                      onChange={(e) => setGoalsFormData(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      placeholder={metric.placeholder}
                      className="input-field w-full text-base py-3"
                    />
                    <p className="text-xs text-iron-500 mt-1">
                      Recommended: {DEFAULT_GOALS[key]} {metric.unit}
                    </p>
                  </div>
                )
              })}
            </div>
            
            <div className="p-4 border-t border-iron-800 flex gap-3">
              <button
                onClick={() => setShowGoalsModal(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setGoals(goalsFormData)
                  setShowGoalsModal(false)
                }}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Save Goals
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
