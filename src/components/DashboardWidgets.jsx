import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Calendar,
  Target,
  Dumbbell,
  ChevronRight,
  Moon,
  Droplets,
  Beef,
  Calculator,
  TrendingUp,
  Clock,
  Users,
  Heart,
  Plus,
  Flame,
  MessageCircle,
  Settings,
  User
} from 'lucide-react'
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip
} from 'recharts'
import { useAuth } from '../context/AuthContext'

// ============ STAT CARD WIDGET ============
export function StatsWidget({ stats }) {
  const statCards = [
    {
      label: 'This Week',
      value: `${stats.workoutsThisWeek} workouts`,
      icon: Calendar,
      color: 'text-flame-400',
      bgColor: 'bg-flame-500/10',
    },
    {
      label: 'Total Workouts',
      value: stats.totalWorkouts,
      icon: Dumbbell,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4">
      {statCards.map((stat, index) => (
        <div
          key={stat.label}
          className="card-steel p-4"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-2xl font-display text-iron-100">{stat.value}</p>
              <p className="text-sm text-iron-500">{stat.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============ RECENT WORKOUTS WIDGET ============
export function RecentWorkoutsWidget({ workouts }) {
  if (!workouts || workouts.length === 0) {
    return (
      <div className="card-steel p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg text-iron-100">Recent Workouts</h3>
          <Link to="/workouts" className="text-sm text-flame-400 hover:text-flame-300">
            View All
          </Link>
        </div>
        <p className="text-iron-500 text-sm">No workouts yet. Start your first one!</p>
      </div>
    )
  }

  return (
    <div className="card-steel p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-iron-100">Recent Workouts</h3>
        <Link to="/workouts" className="text-sm text-flame-400 hover:text-flame-300">
          View All
        </Link>
      </div>
      <div className="space-y-3">
        {workouts.slice(0, 5).map((workout) => {
          const workoutDate = workout.date?.toDate ? workout.date.toDate() : new Date(workout.date)
          return (
            <Link
              key={workout.id}
              to={`/workouts/${workout.id}`}
              className="flex items-center justify-between p-3 rounded-lg bg-iron-800/50 hover:bg-iron-800 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-iron-200">{workout.name}</p>
                <p className="text-xs text-iron-500">
                  {format(workoutDate, 'MMM d')} · {workout.exercises?.length || 0} exercises
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-iron-600" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ============ GOALS WIDGET ============
export function GoalsWidget({ goals }) {
  if (!goals || goals.length === 0) {
    return (
      <div className="card-steel p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg text-iron-100">Active Goals</h3>
          <Link to="/goals" className="text-sm text-flame-400 hover:text-flame-300">
            Add Goal
          </Link>
        </div>
        <p className="text-iron-500 text-sm">No active goals. Set one to track progress!</p>
      </div>
    )
  }

  return (
    <div className="card-steel p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-iron-100">Active Goals</h3>
        <Link to="/goals" className="text-sm text-flame-400 hover:text-flame-300">
          View All
        </Link>
      </div>
      <div className="space-y-4">
        {goals.slice(0, 4).map((goal) => {
          const current = goal.currentValue ?? goal.currentWeight ?? 0
          const target = goal.targetValue ?? goal.targetWeight ?? 100
          const start = goal.startValue ?? goal.startWeight ?? current
          const progress = target > start ? ((current - start) / (target - start)) * 100 : 0
          const unit = goal.metricType === 'time' ? 's' : goal.metricType === 'reps' ? ' reps' : ' lbs'
          
          return (
            <div key={goal.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-iron-300">{goal.lift}</span>
                <span className="text-xs text-iron-500">
                  {current}{unit} / {target}{unit}
                </span>
              </div>
              <div className="h-2 bg-iron-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-flame-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============ HEALTH SUMMARY WIDGET ============
export function HealthWidget({ healthData, goals }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayEntry = healthData?.find(e => e.date === todayStr)
  
  const metrics = [
    { key: 'sleep', label: 'Sleep', icon: Moon, unit: 'hrs', color: 'text-indigo-400', bgColor: 'bg-indigo-500/20' },
    { key: 'water', label: 'Water', icon: Droplets, unit: 'oz', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
    { key: 'protein', label: 'Protein', icon: Beef, unit: 'g', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  ]

  return (
    <div className="card-steel p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-iron-100">Today's Health</h3>
        <Link to="/health" className="text-sm text-flame-400 hover:text-flame-300">
          Log More
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {metrics.map(({ key, label, icon: Icon, unit, color, bgColor }) => {
          const value = todayEntry?.[key]
          const target = goals?.[key] || (key === 'sleep' ? 8 : key === 'water' ? 64 : 150)
          const percentage = value ? Math.min(100, (value / target) * 100) : 0
          
          return (
            <div key={key} className="text-center">
              <div className={`w-10 h-10 mx-auto mb-2 rounded-lg ${bgColor} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-lg font-display text-iron-100">
                {value ? (key === 'sleep' ? value.toFixed(1) : Math.round(value)) : '-'}
              </p>
              <p className="text-xs text-iron-500">{unit}</p>
              <div className="h-1 bg-iron-800 rounded-full mt-1 overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all"
                  style={{ 
                    width: `${percentage}%`,
                    backgroundColor: key === 'sleep' ? '#818cf8' : key === 'water' ? '#22d3ee' : '#f97316'
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============ HEALTH CHART WIDGET ============
export function HealthChartWidget({ healthData }) {
  const chartData = []
  for (let i = 6; i >= 0; i--) {
    const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
    const entry = healthData?.find(e => e.date === date)
    chartData.push({
      date: format(subDays(new Date(), i), 'EEE'),
      sleep: entry?.sleep || null,
      water: entry?.water ? entry.water / 10 : null, // Scale down for chart
      protein: entry?.protein ? entry.protein / 20 : null // Scale down for chart
    })
  }

  return (
    <div className="card-steel p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-iron-100">Health Trends</h3>
        <Link to="/health" className="text-sm text-flame-400 hover:text-flame-300">
          Details
        </Link>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis 
              dataKey="date" 
              stroke="#6b7280" 
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1f2937', 
                border: '1px solid #374151',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value, name) => {
                if (name === 'water') return [`${Math.round(value * 10)} oz`, 'Water']
                if (name === 'protein') return [`${Math.round(value * 20)} g`, 'Protein']
                return [`${value?.toFixed(1)} hrs`, 'Sleep']
              }}
            />
            <Line 
              type="monotone" 
              dataKey="sleep" 
              stroke="#818cf8"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line 
              type="monotone" 
              dataKey="water" 
              stroke="#22d3ee"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line 
              type="monotone" 
              dataKey="protein" 
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-4 mt-2">
        <span className="flex items-center gap-1 text-xs text-iron-400">
          <span className="w-2 h-2 rounded-full bg-indigo-400"></span> Sleep
        </span>
        <span className="flex items-center gap-1 text-xs text-iron-400">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Water
        </span>
        <span className="flex items-center gap-1 text-xs text-iron-400">
          <span className="w-2 h-2 rounded-full bg-orange-400"></span> Protein
        </span>
      </div>
    </div>
  )
}

// ============ 1RM CALCULATOR WIDGET ============
export function OneRepMaxWidget() {
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  
  const calculate1RM = () => {
    const w = parseFloat(weight)
    const r = parseInt(reps)
    if (!w || !r || r < 1) return null
    if (r === 1) return w
    return Math.round(w * (1 + r / 30)) // Epley formula
  }
  
  const oneRM = calculate1RM()

  return (
    <div className="card-steel p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-iron-100">1RM Calculator</h3>
        <Link to="/tools" className="text-sm text-flame-400 hover:text-flame-300">
          More Tools
        </Link>
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <input
            type="number"
            placeholder="Weight"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="input-field w-full py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <input
            type="number"
            placeholder="Reps"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="input-field w-full py-2 text-sm"
          />
        </div>
      </div>
      {oneRM && (
        <div className="text-center p-3 bg-flame-500/10 rounded-lg">
          <p className="text-xs text-iron-400">Estimated 1RM</p>
          <p className="text-2xl font-display text-flame-400">{oneRM} lbs</p>
        </div>
      )}
    </div>
  )
}

// ============ QUICK LINKS WIDGET ============
export function QuickLinksWidget() {
  const links = [
    { to: '/workouts', label: 'Workouts', icon: Dumbbell, color: 'text-green-400', bgColor: 'bg-green-500/20' },
    { to: '/goals', label: 'Goals', icon: Target, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
    { to: '/calendar', label: 'Calendar', icon: Calendar, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    { to: '/groups', label: 'Groups', icon: Users, color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
    { to: '/health', label: 'Health', icon: Heart, color: 'text-red-400', bgColor: 'bg-red-500/20' },
    { to: '/tools', label: 'Tools', icon: Calculator, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
    { to: '/feed', label: 'Feed', icon: MessageCircle, color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
    { to: '/settings', label: 'Settings', icon: Settings, color: 'text-iron-400', bgColor: 'bg-iron-700' },
  ]

  return (
    <div className="card-steel p-6">
      <h3 className="font-display text-lg text-iron-100 mb-4">Quick Access</h3>
      <div className="grid grid-cols-4 gap-3">
        {links.map(({ to, label, icon: Icon, color, bgColor }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center p-3 rounded-lg bg-iron-800/50 hover:bg-iron-800 transition-colors"
          >
            <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center mb-2`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <span className="text-xs text-iron-400">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ============ CALORIES WIDGET ============
export function CaloriesWidget({ calorieData, profile }) {
  const [view, setView] = useState('week') // 'week' or 'lifetime'
  
  const dailyBase = calorieData?.dailyBase || 0
  const todayExercise = calorieData?.todayExercise || 0
  const weekExercise = calorieData?.weekExercise || 0
  const lifetimeExercise = calorieData?.lifetimeExercise || 0
  const hasProfile = profile?.weight && profile?.height && profile?.age
  const weekStartDay = profile?.settings?.weekStartDay || 'monday'
  const trackingStartDate = calorieData?.trackingStartDate 
    ? format(new Date(calorieData.trackingStartDate), 'MMM d, yyyy')
    : null
  
  return (
    <div className="card-steel p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-iron-100">Exercise Calories</h3>
        <div className="flex bg-iron-800 rounded-lg p-1">
          <button
            onClick={() => setView('week')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              view === 'week' ? 'bg-flame-500 text-white' : 'text-iron-400'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView('lifetime')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              view === 'lifetime' ? 'bg-flame-500 text-white' : 'text-iron-400'
            }`}
          >
            All Time
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-flame-500/20 flex items-center justify-center">
          <Flame className="w-7 h-7 text-flame-400" />
        </div>
        <div>
          <p className="text-3xl font-display text-iron-100">
            {view === 'week' 
              ? weekExercise.toLocaleString()
              : lifetimeExercise.toLocaleString()
            }
          </p>
          <p className="text-sm text-iron-500">
            {view === 'week' 
              ? `burned this week · resets ${weekStartDay === 'monday' ? 'Mon' : 'Sun'}` 
              : trackingStartDate 
                ? `burned since ${trackingStartDate}` 
                : 'total burned'
            }
          </p>
        </div>
      </div>
      
      {!hasProfile && (
        <Link 
          to="/settings"
          className="mt-4 block p-3 bg-iron-800 rounded-lg text-sm text-iron-400 hover:text-iron-200 transition-colors"
        >
          Complete your profile for accurate estimates →
        </Link>
      )}
      
      {hasProfile && (
        <div className="mt-4 pt-4 border-t border-iron-800">
          <div className="flex justify-between items-center text-sm">
            <span className="text-iron-500">Today's exercise</span>
            <span className="text-flame-400 font-medium">+{todayExercise.toLocaleString()} cal</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-iron-500">Daily base</span>
            <span className="text-iron-400">{dailyBase.toLocaleString()} cal</span>
          </div>
        </div>
      )}
      
      <Link 
        to="/health"
        className="mt-3 block text-center text-xs text-iron-500 hover:text-flame-400 transition-colors"
      >
        View details →
      </Link>
    </div>
  )
}

// ============ PROFILE WIDGET ============
export function ProfileWidget({ user, userProfile }) {
  const displayName = user?.displayName || 'User'
  const username = userProfile?.username
  
  return (
    <Link to="/profile" className="card-steel p-6 block hover:border-iron-600 transition-colors">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-iron-800 flex items-center justify-center">
          {userProfile?.photoURL || user?.photoURL ? (
            <img 
              src={userProfile?.photoURL || user?.photoURL} 
              alt="" 
              className="w-16 h-16 rounded-full object-cover" 
            />
          ) : (
            <span className="text-2xl font-display text-iron-400">
              {displayName[0]?.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg text-iron-100 truncate">{displayName}</h3>
          {username && (
            <p className="text-sm text-flame-400">@{username}</p>
          )}
          <p className="text-xs text-iron-500 mt-1">View your profile →</p>
        </div>
      </div>
    </Link>
  )
}

// ============ ACTIVITY FEED WIDGET ============
export function FeedWidget({ feedItems = [], users = {} }) {
  const getActivityText = (item) => {
    const userName = users[item.userId]?.displayName || 'Someone'
    switch (item.type) {
      case 'workout':
        return `${userName} completed ${item.data?.name || 'a workout'}`
      case 'cardio':
        return `${userName} logged ${item.data?.duration}min cardio`
      case 'goal_completed':
        return `${userName} achieved ${item.data?.lift} 🎉`
      case 'personal_record':
        return `${userName} set a new PR`
      default:
        return `${userName} was active`
    }
  }

  return (
    <div className="card-steel p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-lg text-iron-100">Activity Feed</h3>
        <Link 
          to="/feed" 
          className="text-xs text-flame-400 hover:text-flame-300"
        >
          View all →
        </Link>
      </div>

      {feedItems.length === 0 ? (
        <div className="py-6 text-center">
          <Users className="w-8 h-8 text-iron-600 mx-auto mb-2" />
          <p className="text-sm text-iron-500">No recent activity</p>
          <Link to="/feed" className="text-xs text-flame-400 hover:text-flame-300 mt-2 inline-block">
            Check out the feed →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {feedItems.slice(0, 5).map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2 border-b border-iron-800 last:border-0">
              <div className="w-8 h-8 rounded-full bg-iron-800 flex items-center justify-center text-iron-400 text-xs flex-shrink-0">
                {users[item.userId]?.displayName?.[0] || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-iron-300 truncate">{getActivityText(item)}</p>
                <p className="text-xs text-iron-600">
                  {item.createdAt?.toDate && format(item.createdAt.toDate(), 'MMM d, h:mm a')}
                </p>
              </div>
              {item.reactionCount > 0 && (
                <span className="text-xs text-iron-500">{item.reactionCount} 💪</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============ WIDGET REGISTRY ============
export const WIDGET_REGISTRY = {
  stats: {
    id: 'stats',
    label: 'Weekly Stats',
    icon: TrendingUp,
    component: StatsWidget,
    defaultEnabled: true,
    size: 'half'
  },
  recentWorkouts: {
    id: 'recentWorkouts',
    label: 'Recent Workouts',
    icon: Dumbbell,
    component: RecentWorkoutsWidget,
    defaultEnabled: true,
    size: 'half'
  },
  goals: {
    id: 'goals',
    label: 'Active Goals',
    icon: Target,
    component: GoalsWidget,
    defaultEnabled: true,
    size: 'half'
  },
  health: {
    id: 'health',
    label: "Today's Health",
    icon: Heart,
    component: HealthWidget,
    defaultEnabled: true,
    size: 'half'
  },
  profile: {
    id: 'profile',
    label: 'My Profile',
    icon: User,
    component: ProfileWidget,
    defaultEnabled: true,
    size: 'half'
  },
  feed: {
    id: 'feed',
    label: 'Activity Feed',
    icon: MessageCircle,
    component: FeedWidget,
    defaultEnabled: false,
    size: 'half'
  },
  calories: {
    id: 'calories',
    label: 'Calories Burned',
    icon: Flame,
    component: CaloriesWidget,
    defaultEnabled: false,
    size: 'half'
  },
  healthChart: {
    id: 'healthChart',
    label: 'Health Trends',
    icon: TrendingUp,
    component: HealthChartWidget,
    defaultEnabled: false,
    size: 'half'
  },
  oneRepMax: {
    id: 'oneRepMax',
    label: '1RM Calculator',
    icon: Calculator,
    component: OneRepMaxWidget,
    defaultEnabled: false,
    size: 'half'
  },
  quickLinks: {
    id: 'quickLinks',
    label: 'Quick Access',
    icon: ChevronRight,
    component: QuickLinksWidget,
    defaultEnabled: true,
    size: 'full'
  },
  addWidget: {
    id: 'addWidget',
    label: 'Add More Widgets',
    icon: Plus,
    component: null, // Special handling in DashboardPage
    defaultEnabled: true,
    size: 'full',
    isSpecial: true
  }
}

export const DEFAULT_WIDGET_ORDER = ['profile', 'stats', 'recentWorkouts', 'goals', 'quickLinks', 'addWidget']

// ============ ADD WIDGET CARD ============
export function AddWidgetCard({ onCustomize, availableCount }) {
  if (availableCount === 0) return null
  
  return (
    <button
      onClick={onCustomize}
      className="card-steel p-6 w-full border-2 border-dashed border-iron-700 hover:border-flame-500/50 transition-colors group"
    >
      <div className="flex flex-col items-center justify-center py-4">
        <div className="w-12 h-12 rounded-xl bg-iron-800 group-hover:bg-flame-500/20 flex items-center justify-center mb-3 transition-colors">
          <Plus className="w-6 h-6 text-iron-500 group-hover:text-flame-400 transition-colors" />
        </div>
        <p className="text-iron-400 group-hover:text-iron-200 font-medium transition-colors">
          Add More Widgets
        </p>
        <p className="text-xs text-iron-600 mt-1">
          {availableCount} more available
        </p>
      </div>
    </button>
  )
}