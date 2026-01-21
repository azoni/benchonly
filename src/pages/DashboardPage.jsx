import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, Reorder, AnimatePresence } from 'framer-motion'
import {
  Plus,
  HelpCircle,
  Settings,
  X,
  GripVertical,
  Check,
  RotateCcw
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { workoutService, goalService, healthService, scheduleService } from '../services/firestore'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import OnboardingModal, { useOnboarding } from '../components/OnboardingModal'
import {
  WIDGET_REGISTRY,
  DEFAULT_WIDGET_ORDER,
  StatsWidget,
  RecentWorkoutsWidget,
  GoalsWidget,
  HealthWidget,
  HealthChartWidget,
  OneRepMaxWidget,
  QuickLinksWidget,
  AddWidgetCard
} from '../components/DashboardWidgets'

const STORAGE_KEY = 'dashboard_widgets'

export default function DashboardPage() {
  const { user, userProfile, isGuest } = useAuth()
  const { showOnboarding, openOnboarding, closeOnboarding } = useOnboarding()
  
  // Dashboard data
  const [stats, setStats] = useState({ workoutsThisWeek: 0, totalWorkouts: 0, activeGoals: 0 })
  const [recentWorkouts, setRecentWorkouts] = useState([])
  const [goals, setGoals] = useState([])
  const [healthData, setHealthData] = useState([])
  const [healthGoals, setHealthGoals] = useState(() => {
    const saved = localStorage.getItem('health_goals')
    return saved ? JSON.parse(saved) : { sleep: 8, water: 64, protein: 150 }
  })
  const [loading, setLoading] = useState(true)
  
  // Customization state
  const [customizeMode, setCustomizeMode] = useState(false)
  const [widgetOrder, setWidgetOrder] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return DEFAULT_WIDGET_ORDER
      }
    }
    return DEFAULT_WIDGET_ORDER
  })
  const [enabledWidgets, setEnabledWidgets] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_enabled')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return DEFAULT_WIDGET_ORDER
      }
    }
    return DEFAULT_WIDGET_ORDER
  })

  // Save widget config when changed
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgetOrder))
  }, [widgetOrder])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + '_enabled', JSON.stringify(enabledWidgets))
  }, [enabledWidgets])

  useEffect(() => {
    if (user) {
      loadDashboardData()
    }
  }, [user])

  const loadDashboardData = async () => {
    try {
      if (isGuest) {
        const { getSampleWorkouts, SAMPLE_GOALS } = await import('../context/AuthContext')
        const sampleWorkouts = getSampleWorkouts()
        setRecentWorkouts(sampleWorkouts.slice(0, 5))
        setGoals(SAMPLE_GOALS)
        
        const now = new Date()
        const weekStart = startOfWeek(now, { weekStartsOn: 1 })
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
        
        const weekWorkouts = sampleWorkouts.filter((w) => {
          const date = w.date instanceof Date ? w.date : new Date(w.date)
          return date >= weekStart && date <= weekEnd
        })

        setStats({
          workoutsThisWeek: weekWorkouts.length,
          totalWorkouts: sampleWorkouts.length,
          activeGoals: SAMPLE_GOALS.filter((g) => g.status === 'active').length,
        })
        
        // Sample health data for guests
        setHealthData([
          { date: format(new Date(), 'yyyy-MM-dd'), sleep: 7.5, water: 48, protein: 120 }
        ])
        
        setLoading(false)
        return
      }

      // Load all data in parallel
      const [workouts, userGoals, health] = await Promise.all([
        workoutService.getByUser(user.uid, 60),
        goalService.getByUser(user.uid),
        healthService.getByUser(user.uid, 14).catch(() => []) // Don't fail if health errors
      ])
      
      setRecentWorkouts(workouts.slice(0, 5))
      setGoals(userGoals.slice(0, 3))
      setHealthData(health)

      // Calculate stats
      const now = new Date()
      const weekStart = startOfWeek(now, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
      
      const weekWorkouts = workouts.filter((w) => {
        const date = w.date?.toDate ? w.date.toDate() : new Date(w.date)
        return date >= weekStart && date <= weekEnd
      })

      setStats({
        workoutsThisWeek: weekWorkouts.length,
        totalWorkouts: workouts.length,
        activeGoals: userGoals.filter((g) => g.status === 'active').length,
      })

      setLoading(false)
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setLoading(false)
    }
  }

  const toggleWidget = (widgetId) => {
    setEnabledWidgets(prev => {
      if (prev.includes(widgetId)) {
        return prev.filter(id => id !== widgetId)
      } else {
        return [...prev, widgetId]
      }
    })
    // Also update order if adding
    if (!widgetOrder.includes(widgetId)) {
      setWidgetOrder(prev => [...prev, widgetId])
    }
  }

  const resetToDefaults = () => {
    setWidgetOrder(DEFAULT_WIDGET_ORDER)
    setEnabledWidgets(DEFAULT_WIDGET_ORDER)
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const renderWidget = (widgetId) => {
    const config = WIDGET_REGISTRY[widgetId]
    if (!config) return null

    switch (widgetId) {
      case 'stats':
        return <StatsWidget stats={stats} />
      case 'recentWorkouts':
        return <RecentWorkoutsWidget workouts={recentWorkouts} />
      case 'goals':
        return <GoalsWidget goals={goals} />
      case 'health':
        return <HealthWidget healthData={healthData} goals={healthGoals} />
      case 'healthChart':
        return <HealthChartWidget healthData={healthData} />
      case 'oneRepMax':
        return <OneRepMaxWidget />
      case 'quickLinks':
        return <QuickLinksWidget />
      case 'addWidget':
        const availableCount = Object.keys(WIDGET_REGISTRY).filter(
          id => !enabledWidgets.includes(id) && id !== 'addWidget'
        ).length
        return <AddWidgetCard onCustomize={() => setCustomizeMode(true)} availableCount={availableCount} />
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Filter to only show enabled widgets in the correct order (but filter out addWidget if no more available)
  const availableWidgetCount = Object.keys(WIDGET_REGISTRY).filter(
    id => !enabledWidgets.includes(id) && id !== 'addWidget'
  ).length
  const visibleWidgets = widgetOrder.filter(id => {
    if (!enabledWidgets.includes(id)) return false
    if (id === 'addWidget' && availableWidgetCount === 0) return false
    return true
  })

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Onboarding Modal */}
      <OnboardingModal isOpen={showOnboarding} onClose={closeOnboarding} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md text-iron-50">
            {getGreeting()}, {user?.displayName?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-iron-400 mt-1">
            {format(new Date(), "EEEE, MMMM d")} — Let's crush it today.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openOnboarding}
            className="p-2 text-iron-500 hover:text-iron-300 hover:bg-iron-800 rounded-lg transition-colors"
            title="App Guide"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCustomizeMode(true)}
            className="p-2 text-iron-500 hover:text-iron-300 hover:bg-iron-800 rounded-lg transition-colors"
            title="Customize Dashboard"
          >
            <Settings className="w-5 h-5" />
          </button>
          <Link to="/workouts/new" className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            New Workout
          </Link>
        </div>
      </div>

      {/* Widgets Grid */}
      {customizeMode ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Customize Mode Header */}
          <div className="flex items-center justify-between p-4 bg-flame-500/10 border border-flame-500/30 rounded-xl">
            <div>
              <h3 className="font-medium text-iron-100">Customize Dashboard</h3>
              <p className="text-sm text-iron-400">Drag to reorder, toggle to show/hide</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={resetToDefaults}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-iron-400 hover:text-iron-200 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
              <button
                onClick={() => setCustomizeMode(false)}
                className="flex items-center gap-1 px-4 py-1.5 bg-flame-500 text-white rounded-lg text-sm font-medium"
              >
                <Check className="w-4 h-4" />
                Done
              </button>
            </div>
          </div>

          {/* Draggable Widget List */}
          <Reorder.Group 
            axis="y" 
            values={widgetOrder} 
            onReorder={setWidgetOrder}
            className="space-y-3"
          >
            {widgetOrder.map((widgetId) => {
              const config = WIDGET_REGISTRY[widgetId]
              if (!config) return null
              const Icon = config.icon
              const isEnabled = enabledWidgets.includes(widgetId)

              return (
                <Reorder.Item
                  key={widgetId}
                  value={widgetId}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-grab active:cursor-grabbing ${
                    isEnabled 
                      ? 'bg-iron-800 border-iron-700' 
                      : 'bg-iron-900 border-iron-800 opacity-60'
                  }`}
                >
                  <GripVertical className="w-5 h-5 text-iron-500 flex-shrink-0" />
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isEnabled ? 'bg-flame-500/20' : 'bg-iron-800'
                  }`}>
                    <Icon className={`w-5 h-5 ${isEnabled ? 'text-flame-400' : 'text-iron-500'}`} />
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${isEnabled ? 'text-iron-100' : 'text-iron-400'}`}>
                      {config.label}
                    </p>
                    <p className="text-xs text-iron-500">
                      {config.size === 'full' ? 'Full width' : 'Half width'}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleWidget(widgetId)}
                    className={`w-12 h-7 rounded-full transition-colors relative ${
                      isEnabled ? 'bg-flame-500' : 'bg-iron-700'
                    }`}
                  >
                    <span 
                      className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                        isEnabled ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </Reorder.Item>
              )
            })}
          </Reorder.Group>

          {/* Add widgets that aren't in order yet */}
          {Object.keys(WIDGET_REGISTRY).filter(id => !widgetOrder.includes(id)).length > 0 && (
            <div className="pt-4 border-t border-iron-800">
              <p className="text-sm text-iron-500 mb-3">Available Widgets</p>
              <div className="space-y-2">
                {Object.entries(WIDGET_REGISTRY)
                  .filter(([id]) => !widgetOrder.includes(id))
                  .map(([widgetId, config]) => {
                    const Icon = config.icon
                    return (
                      <button
                        key={widgetId}
                        onClick={() => {
                          setWidgetOrder(prev => [...prev, widgetId])
                          setEnabledWidgets(prev => [...prev, widgetId])
                        }}
                        className="w-full flex items-center gap-4 p-4 rounded-xl bg-iron-900 border border-iron-800 hover:border-iron-700 transition-colors"
                      >
                        <Plus className="w-5 h-5 text-iron-500" />
                        <div className="w-10 h-10 rounded-lg bg-iron-800 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-iron-500" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-medium text-iron-300">{config.label}</p>
                        </div>
                      </button>
                    )
                  })}
              </div>
            </div>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {visibleWidgets.map((widgetId) => {
              const config = WIDGET_REGISTRY[widgetId]
              if (!config) return null
              const isFullWidth = config.size === 'full'

              return (
                <motion.div
                  key={widgetId}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={isFullWidth ? 'md:col-span-2' : ''}
                >
                  {renderWidget(widgetId)}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}