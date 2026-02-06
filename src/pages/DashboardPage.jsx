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
  RotateCcw,
  Dumbbell,
  Edit2,
  Eye,
  EyeOff
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { workoutService, goalService, healthService, scheduleService, userService, groupWorkoutService } from '../services/firestore'
import { format, startOfWeek, endOfWeek, subDays } from 'date-fns'
import OnboardingModal, { useOnboarding } from '../components/OnboardingModal'
import ProfileSetupModal, { useProfileSetup } from '../components/ProfileSetupModal'
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
  AddWidgetCard,
  CaloriesWidget,
  ProfileWidget,
  FeedWidget,
  CalendarWidget
} from '../components/DashboardWidgets'
import { calculateTDEE, calculateActivityCalories, calculateStrengthWorkoutCalories } from '../services/calorieService'
import { getTodayString, toDateString } from '../utils/dateUtils'
import { feedService } from '../services/feedService'

const STORAGE_KEY = 'dashboard_widgets'

export default function DashboardPage() {
  const { user, userProfile, isGuest } = useAuth()
  const { showOnboarding, openOnboarding, closeOnboarding } = useOnboarding()
  const { showModal: showProfileSetup, dismissModal: dismissProfileSetup } = useProfileSetup()
  
  // Dashboard data
  const [stats, setStats] = useState({ workoutsThisWeek: 0, totalWorkouts: 0, activeGoals: 0 })
  const [recentWorkouts, setRecentWorkouts] = useState([])
  const [allWorkouts, setAllWorkouts] = useState([])
  const [goals, setGoals] = useState([])
  const [allGoals, setAllGoals] = useState([])
  const [healthData, setHealthData] = useState([])
  const [calorieData, setCalorieData] = useState({ todayTotal: 0, weekTotal: 0, lifetimeTotal: 0 })
  const [feedItems, setFeedItems] = useState([])
  const [feedUsers, setFeedUsers] = useState({})
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
        let parsed = JSON.parse(saved)
        // Migration: Replace 'feed' with 'profile', add 'profile' if missing
        const feedIndex = parsed.indexOf('feed')
        if (feedIndex !== -1) {
          parsed[feedIndex] = 'profile'
        } else if (!parsed.includes('profile')) {
          const insertIndex = parsed.indexOf('quickLinks')
          if (insertIndex !== -1) {
            parsed.splice(insertIndex, 0, 'profile')
          } else {
            parsed.push('profile')
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
        return parsed
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
        let parsed = JSON.parse(saved)
        // Migration: Replace 'feed' with 'profile', add 'profile' if missing
        const feedIndex = parsed.indexOf('feed')
        if (feedIndex !== -1) {
          parsed[feedIndex] = 'profile'
        } else if (!parsed.includes('profile')) {
          parsed.push('profile')
        }
        localStorage.setItem(STORAGE_KEY + '_enabled', JSON.stringify(parsed))
        return parsed
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
          { date: getTodayString(), sleep: 7.5, water: 48, protein: 120 }
        ])
        
        // Sample calorie data for guests
        setCalorieData({ todayTotal: 2450, weekTotal: 17150, lifetimeTotal: 245000 })
        
        setLoading(false)
        return
      }

      // Load all data in parallel
      const [personalWorkouts, groupWorkouts, userGoals, health] = await Promise.all([
        workoutService.getByUser(user.uid, 60),
        groupWorkoutService.getByUser(user.uid),
        goalService.getByUser(user.uid),
        healthService.getByUser(user.uid, 14).catch(() => []), // Don't fail if health errors
      ])
      
      // Merge personal and group workouts, sort by date
      const workouts = [...personalWorkouts, ...groupWorkouts].sort((a, b) => {
        const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date)
        const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date)
        return dateB - dateA
      })
      
      setRecentWorkouts(workouts.slice(0, 5))
      setAllWorkouts(workouts)
      setGoals(userGoals.slice(0, 3))
      setAllGoals(userGoals.filter(g => g.status === 'active'))
      setHealthData(health)

      // Calculate stats
      const now = new Date()
      const weekStart = startOfWeek(now, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
      const todayStr = getTodayString()
      
      const weekWorkouts = workouts.filter((w) => {
        const date = w.date?.toDate ? w.date.toDate() : new Date(w.date)
        return date >= weekStart && date <= weekEnd
      })

      setStats({
        workoutsThisWeek: weekWorkouts.length,
        totalWorkouts: workouts.length,
        activeGoals: userGoals.filter((g) => g.status === 'active').length,
      })

      // Calculate calories
      const dailyBase = calculateTDEE(userProfile)
      const weight = userProfile?.weight || 170
      
      // Today's exercise calories
      const todayWorkouts = workouts.filter(w => {
        return toDateString(w.date) === todayStr
      })
      let todayExercise = 0
      todayWorkouts.forEach(w => {
        if (w.workoutType === 'cardio' && w.activityType && w.duration) {
          todayExercise += calculateActivityCalories(w.activityType, w.duration, weight)
        } else {
          todayExercise += calculateStrengthWorkoutCalories(w, weight)
        }
      })
      
      // Week's exercise calories (just from workouts, not base)
      let weekExercise = 0
      weekWorkouts.forEach(w => {
        if (w.workoutType === 'cardio' && w.activityType && w.duration) {
          weekExercise += calculateActivityCalories(w.activityType, w.duration, weight)
        } else {
          weekExercise += calculateStrengthWorkoutCalories(w, weight)
        }
      })
      
      // Lifetime exercise calories (total from all workouts)
      let lifetimeExercise = 0
      let oldestWorkoutDate = null
      workouts.forEach(w => {
        if (w.workoutType === 'cardio' && w.activityType && w.duration) {
          lifetimeExercise += calculateActivityCalories(w.activityType, w.duration, weight)
        } else {
          lifetimeExercise += calculateStrengthWorkoutCalories(w, weight)
        }
        // Track oldest workout date
        const wDate = w.date?.toDate ? w.date.toDate() : new Date(w.date)
        if (!oldestWorkoutDate || wDate < oldestWorkoutDate) {
          oldestWorkoutDate = wDate
        }
      })
      
      setCalorieData({
        dailyBase,                    // Base calories per day (BMR + NEAT)
        todayExercise,               // Exercise calories today
        todayTotal: dailyBase + todayExercise, // Total for today
        weekExercise,                // Exercise calories this week
        lifetimeExercise,            // Total exercise calories all time
        trackingStartDate: oldestWorkoutDate?.toISOString() || null
      })

      // Load feed data (non-blocking) - show public users' activity
      try {
        const feedResult = await feedService.getFeed(20) // Get more to account for filtering
        if (feedResult?.items?.length > 0) {
          // Get all users to check privacy settings
          const allUsers = await userService.getAll()
          const usersMap = {}
          const publicUserIds = new Set()
          
          allUsers.forEach(u => {
            usersMap[u.uid] = u
            // Include public users and always include current user
            if (!u.isPrivate || u.uid === user?.uid) {
              publicUserIds.add(u.uid)
            }
          })
          
          // Filter feed to only show public users' activity
          const publicFeedItems = feedResult.items.filter(item => publicUserIds.has(item.userId))
          
          setFeedItems(publicFeedItems.slice(0, 10))
          setFeedUsers(usersMap)
        }
      } catch (feedError) {
        console.error('Error loading feed:', feedError)
        // Don't fail dashboard if feed fails
      }

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
      case 'calendar':
        return <CalendarWidget workouts={allWorkouts} goals={allGoals} />
      case 'health':
        return <HealthWidget healthData={healthData} goals={healthGoals} />
      case 'profile':
        return <ProfileWidget user={user} userProfile={userProfile} />
      case 'feed':
        return <FeedWidget feedItems={feedItems} users={feedUsers} />
      case 'calories':
        return <CaloriesWidget calorieData={calorieData} profile={userProfile} />
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
      
      {/* Profile Setup Modal */}
      {!isGuest && <ProfileSetupModal isOpen={showProfileSetup} onClose={dismissProfileSetup} />}

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
            className="flex items-center gap-1.5 px-3 py-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-lg transition-colors"
            title="Customize Dashboard"
          >
            <Edit2 className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">Edit</span>
          </button>
          <Link to="/workouts" className="btn-primary flex items-center gap-2">
            <Dumbbell className="w-5 h-5" />
            Workouts
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
              <p className="text-sm text-iron-400">Drag widgets to reorder, click eye to show/hide</p>
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

          {/* Draggable Widget Grid - Shows actual widgets */}
          <Reorder.Group 
            axis="y" 
            values={widgetOrder} 
            onReorder={setWidgetOrder}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {widgetOrder.map((widgetId) => {
              const config = WIDGET_REGISTRY[widgetId]
              if (!config) return null
              const Icon = config.icon
              const isEnabled = enabledWidgets.includes(widgetId)
              const isFullWidth = config.size === 'full'

              return (
                <Reorder.Item
                  key={widgetId}
                  value={widgetId}
                  className={`relative ${isFullWidth ? 'md:col-span-2' : ''}`}
                  whileDrag={{ scale: 1.02, zIndex: 50 }}
                >
                  {/* Widget with edit overlay */}
                  <div className={`relative rounded-xl overflow-hidden transition-all ${
                    !isEnabled ? 'opacity-40 grayscale' : ''
                  }`}>
                    {/* Edit controls overlay */}
                    <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-2 bg-gradient-to-b from-iron-900/95 via-iron-900/80 to-transparent">
                      <div className="flex items-center gap-2 cursor-grab active:cursor-grabbing px-2 py-1 rounded-lg bg-iron-800/50">
                        <GripVertical className="w-4 h-4 text-iron-400" />
                        <span className="text-xs font-medium text-iron-300">{config.label}</span>
                        <span className="text-[10px] text-iron-500 bg-iron-700 px-1.5 py-0.5 rounded">
                          {config.size === 'full' ? 'Full' : 'Half'}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleWidget(widgetId)
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                          isEnabled 
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                            : 'bg-iron-700 text-iron-400 hover:bg-iron-600'
                        }`}
                        title={isEnabled ? 'Hide widget' : 'Show widget'}
                      >
                        {isEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                    </div>
                    
                    {/* Actual widget content (with top padding for overlay) */}
                    <div className="pt-8 pointer-events-none">
                      {renderWidget(widgetId)}
                    </div>
                    
                    {/* Drag hint border */}
                    <div className="absolute inset-0 border-2 border-dashed border-iron-600 rounded-xl pointer-events-none" />
                  </div>
                </Reorder.Item>
              )
            })}
          </Reorder.Group>

          {/* Add Available Widgets */}
          {Object.keys(WIDGET_REGISTRY).filter(id => !widgetOrder.includes(id)).length > 0 && (
            <div className="pt-4 border-t border-iron-800">
              <p className="text-sm text-iron-500 mb-3">Available Widgets</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                        className="flex items-center gap-3 p-3 rounded-xl bg-iron-900 border border-iron-800 hover:border-flame-500/50 hover:bg-iron-800/50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-iron-800 flex items-center justify-center">
                          <Icon className="w-4 h-4 text-iron-500" />
                        </div>
                        <div className="flex-1 text-left">
                          <span className="text-sm text-iron-300">{config.label}</span>
                        </div>
                        <Plus className="w-4 h-4 text-flame-500" />
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