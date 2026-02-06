import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import GridLayout from 'react-grid-layout'
import {
  Plus,
  HelpCircle,
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
const STORAGE_KEY_LAYOUT = 'dashboard_layout'

// Default grid layout for widgets
// Grid has 2 columns, rowHeight is 50px
// w: 1 = half width, w: 2 = full width
// Sizes are calibrated to actual widget content - minH=1 allows very compact sizing
const DEFAULT_LAYOUTS = {
  profile: { w: 1, h: 2, minH: 1, maxH: 4 },
  stats: { w: 1, h: 2, minH: 1, maxH: 4 },
  recentWorkouts: { w: 1, h: 5, minH: 2, maxH: 10 },
  goals: { w: 1, h: 3, minH: 2, maxH: 8 },
  calendar: { w: 1, h: 8, minH: 5, maxH: 12 },
  health: { w: 1, h: 3, minH: 1, maxH: 6 },
  feed: { w: 1, h: 4, minH: 2, maxH: 8 },
  calories: { w: 1, h: 2, minH: 1, maxH: 5 },
  healthChart: { w: 1, h: 4, minH: 2, maxH: 8 },
  oneRepMax: { w: 1, h: 3, minH: 2, maxH: 8 },
  quickLinks: { w: 2, h: 3, minH: 2, maxH: 5 },
}

// Generate initial layout from widget order
const generateLayout = (enabledWidgets, savedLayout = null) => {
  if (savedLayout && savedLayout.length > 0) {
    // Use saved layout but filter to only enabled widgets
    const layoutMap = {}
    savedLayout.forEach(item => { layoutMap[item.i] = item })
    
    const result = []
    let maxY = 0
    
    enabledWidgets.forEach(widgetId => {
      if (layoutMap[widgetId]) {
        result.push(layoutMap[widgetId])
        const itemBottom = layoutMap[widgetId].y + layoutMap[widgetId].h
        if (itemBottom > maxY) maxY = itemBottom
      } else {
        // New widget not in saved layout, add at bottom
        const defaults = DEFAULT_LAYOUTS[widgetId] || { w: 1, h: 3, minH: 1, maxH: 8 }
        result.push({ 
          i: widgetId, 
          x: 0, 
          y: maxY,
          ...defaults 
        })
        maxY += defaults.h
      }
    })
    
    return result
  }
  
  // Generate fresh layout - pack widgets efficiently
  const layout = []
  let col0Y = 0 // Track Y position for column 0
  let col1Y = 0 // Track Y position for column 1
  
  enabledWidgets.forEach(widgetId => {
    const defaults = DEFAULT_LAYOUTS[widgetId] || { w: 1, h: 3, minH: 1, maxH: 8 }
    
    if (defaults.w === 2) {
      // Full width - place at the max of both columns
      const y = Math.max(col0Y, col1Y)
      layout.push({ i: widgetId, x: 0, y, ...defaults })
      col0Y = y + defaults.h
      col1Y = y + defaults.h
    } else {
      // Half width - place in shorter column
      if (col0Y <= col1Y) {
        layout.push({ i: widgetId, x: 0, y: col0Y, ...defaults })
        col0Y += defaults.h
      } else {
        layout.push({ i: widgetId, x: 1, y: col1Y, ...defaults })
        col1Y += defaults.h
      }
    }
  })
  
  return layout
}

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
  
  // Grid layout state
  const [layout, setLayout] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LAYOUT)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return null
      }
    }
    return null
  })
  
  // Container width for grid
  const [containerWidth, setContainerWidth] = useState(800)
  const [configLoaded, setConfigLoaded] = useState(false)
  const saveTimeoutRef = useRef(null)

  // Load dashboard config from Firestore or localStorage
  useEffect(() => {
    const loadConfig = async () => {
      if (user && !isGuest) {
        try {
          const config = await userService.getDashboardConfig(user.uid)
          if (config) {
            // Cloud config exists - use it
            if (config.widgetOrder) setWidgetOrder(config.widgetOrder)
            if (config.enabledWidgets) setEnabledWidgets(config.enabledWidgets)
            if (config.layout) setLayout(config.layout)
          } else {
            // No cloud config - sync current localStorage config to cloud
            const localOrder = localStorage.getItem(STORAGE_KEY)
            const localEnabled = localStorage.getItem(STORAGE_KEY + '_enabled')
            const localLayout = localStorage.getItem(STORAGE_KEY_LAYOUT)
            
            if (localOrder || localEnabled || localLayout) {
              await userService.saveDashboardConfig(user.uid, {
                widgetOrder: localOrder ? JSON.parse(localOrder) : DEFAULT_WIDGET_ORDER,
                enabledWidgets: localEnabled ? JSON.parse(localEnabled) : DEFAULT_WIDGET_ORDER,
                layout: localLayout ? JSON.parse(localLayout) : null
              })
            }
          }
        } catch (error) {
          console.error('Error loading dashboard config:', error)
        }
      }
      setConfigLoaded(true)
    }
    loadConfig()
  }, [user, isGuest])

  // Save dashboard config to Firestore (debounced) and localStorage
  useEffect(() => {
    if (!configLoaded) return // Don't save before initial load
    
    // Always save to localStorage as backup
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgetOrder))
    localStorage.setItem(STORAGE_KEY + '_enabled', JSON.stringify(enabledWidgets))
    if (layout) {
      localStorage.setItem(STORAGE_KEY_LAYOUT, JSON.stringify(layout))
    }
    
    // Save to Firestore for logged-in users (debounced)
    if (user && !isGuest) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await userService.saveDashboardConfig(user.uid, {
            widgetOrder,
            enabledWidgets,
            layout
          })
        } catch (error) {
          console.error('Error saving dashboard config:', error)
        }
      }, 1000) // Debounce 1 second
    }
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [widgetOrder, enabledWidgets, layout, user, isGuest, configLoaded])

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

  const resetToDefaults = async () => {
    setWidgetOrder(DEFAULT_WIDGET_ORDER)
    setEnabledWidgets(DEFAULT_WIDGET_ORDER)
    setLayout(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_KEY + '_enabled')
    localStorage.removeItem(STORAGE_KEY_LAYOUT)
    
    // Also clear from Firestore immediately
    if (user && !isGuest) {
      try {
        await userService.saveDashboardConfig(user.uid, {
          widgetOrder: DEFAULT_WIDGET_ORDER,
          enabledWidgets: DEFAULT_WIDGET_ORDER,
          layout: null
        })
      } catch (error) {
        console.error('Error resetting dashboard config:', error)
      }
    }
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
    id => !enabledWidgets.includes(id) && !WIDGET_REGISTRY[id]?.isSpecial
  ).length
  const visibleWidgets = widgetOrder.filter(id => {
    if (!enabledWidgets.includes(id)) return false
    if (WIDGET_REGISTRY[id]?.isSpecial) return false // Filter out addWidget etc.
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
      {customizeMode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4"
        >
          {/* Customize Mode Header */}
          <div className="flex items-center justify-between p-4 bg-flame-500/10 border border-flame-500/30 rounded-xl">
            <div>
              <h3 className="font-medium text-iron-100">Customize Dashboard</h3>
              <p className="text-sm text-iron-400">Drag widgets to move • Drag corners to resize</p>
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

          {/* Widget Toggle List */}
          <div className="mt-4 p-4 bg-iron-900/50 rounded-xl border border-iron-800">
            <p className="text-xs text-iron-500 mb-3 uppercase tracking-wide">Toggle Widgets</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(WIDGET_REGISTRY)
                .filter(([id, config]) => !config.isSpecial)
                .map(([widgetId, config]) => {
                  const Icon = config.icon
                  const isEnabled = enabledWidgets.includes(widgetId)
                  return (
                    <button
                      key={widgetId}
                      onClick={() => toggleWidget(widgetId)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isEnabled 
                          ? 'bg-flame-500/20 text-flame-300 border border-flame-500/30' 
                          : 'bg-iron-800 text-iron-500 border border-iron-700 hover:border-iron-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {config.label}
                      {isEnabled ? <Eye className="w-3 h-3 ml-1" /> : <EyeOff className="w-3 h-3 ml-1" />}
                    </button>
                  )
                })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Grid Layout */}
      <div 
        ref={(node) => {
          if (node && node.offsetWidth !== containerWidth) {
            setContainerWidth(node.offsetWidth)
          }
        }}
      >
        <GridLayout
          className="layout"
          layout={generateLayout(visibleWidgets, layout)}
          cols={2}
          rowHeight={50}
          width={containerWidth}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          isDraggable={customizeMode}
          isResizable={customizeMode}
          compactType="vertical"
          preventCollision={false}
          onLayoutChange={(newLayout) => {
            if (customizeMode) {
              setLayout(newLayout)
            }
          }}
          draggableHandle=".widget-drag-handle"
          resizeHandles={['se']}
        >
          {visibleWidgets.map((widgetId) => {
            const config = WIDGET_REGISTRY[widgetId]
            if (!config) return null

            return (
              <div key={widgetId} className="h-full">
                {customizeMode && (
                  <div className="widget-drag-handle absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-2 bg-iron-900/95 border-b border-iron-700 rounded-t-xl cursor-move">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-iron-400" />
                      <span className="text-xs font-medium text-iron-300">{config.label}</span>
                    </div>
                    <button
                      onClick={() => toggleWidget(widgetId)}
                      className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      title="Hide widget"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className={`h-full ${customizeMode ? 'pt-9' : ''}`}>
                  <div className="h-full overflow-auto">
                    {renderWidget(widgetId)}
                  </div>
                </div>
                {customizeMode && (
                  <div className="absolute inset-0 border-2 border-dashed border-flame-500/30 rounded-xl pointer-events-none" />
                )}
              </div>
            )
          })}
        </GridLayout>
      </div>

      {/* Add widget button when not customizing */}
      {!customizeMode && Object.keys(WIDGET_REGISTRY).filter(id => !enabledWidgets.includes(id) && !WIDGET_REGISTRY[id].isSpecial).length > 0 && (
        <button
          onClick={() => setCustomizeMode(true)}
          className="mt-4 w-full card-steel p-4 border-2 border-dashed border-iron-700 hover:border-flame-500/50 transition-colors group"
        >
          <div className="flex items-center justify-center gap-2">
            <Plus className="w-5 h-5 text-iron-500 group-hover:text-flame-400 transition-colors" />
            <span className="text-iron-400 group-hover:text-iron-200 transition-colors">
              Add More Widgets
            </span>
          </div>
        </button>
      )}
    </div>
  )
}