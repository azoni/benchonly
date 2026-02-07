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
// Grid has 12 columns (like Bootstrap). rowHeight is 50px
// w: 1-12 for width control, h: any height
// No min/max constraints - user can resize freely
const DEFAULT_LAYOUTS = {
  profile: { w: 4, h: 2 },
  stats: { w: 12, h: 2 },
  recentWorkouts: { w: 6, h: 5 },
  goals: { w: 4, h: 4 },
  calendar: { w: 6, h: 7 },
  health: { w: 4, h: 3 },
  feed: { w: 6, h: 5 },
  calories: { w: 4, h: 3 },
  healthChart: { w: 6, h: 4 },
  oneRepMax: { w: 4, h: 3 },
  quickLinks: { w: 4, h: 2 },
}

// Default layout positions for the initial dashboard
const getDefaultLayout = () => [
  { i: 'profile', x: 0, y: 0, w: 4, h: 2 },
  { i: 'quickLinks', x: 0, y: 2, w: 4, h: 2 },
  { i: 'goals', x: 0, y: 4, w: 4, h: 4 },
  { i: 'calendar', x: 4, y: 0, w: 8, h: 7 },
]

// Generate layout - uses saved layout if available, otherwise generates fresh
const generateLayout = (enabledWidgets, savedLayout = null, cols = 12, isMobile = false) => {
  // For mobile, stack all widgets vertically at full width
  if (isMobile) {
    let y = 0
    return enabledWidgets.map(widgetId => {
      const defaults = DEFAULT_LAYOUTS[widgetId] || { w: 12, h: 3 }
      const saved = savedLayout?.find(item => item.i === widgetId)
      // Use saved height if available, otherwise use default
      const h = saved?.h || defaults.h
      const item = { i: widgetId, x: 0, y: y, w: 12, h: h }
      y += h
      return item
    })
  }

  // If we have a saved layout, use it (filtering to only enabled widgets)
  if (savedLayout && savedLayout.length > 0) {
    const layoutMap = {}
    savedLayout.forEach(item => { layoutMap[item.i] = item })
    
    const result = []
    let maxY = 0
    
    // First pass: add widgets that exist in saved layout
    enabledWidgets.forEach(widgetId => {
      if (layoutMap[widgetId]) {
        const saved = layoutMap[widgetId]
        const defaults = DEFAULT_LAYOUTS[widgetId] || { w: 4, h: 3 }
        result.push({
          i: widgetId,
          x: saved.x,
          y: saved.y,
          w: saved.w || defaults.w,
          h: saved.h || defaults.h,
        })
        maxY = Math.max(maxY, saved.y + (saved.h || defaults.h))
      }
    })
    
    // Second pass: add new widgets not in saved layout
    enabledWidgets.forEach(widgetId => {
      if (!layoutMap[widgetId]) {
        const defaults = DEFAULT_LAYOUTS[widgetId] || { w: 4, h: 3 }
        result.push({ i: widgetId, x: 0, y: maxY, w: defaults.w, h: defaults.h })
        maxY += defaults.h
      }
    })
    
    return result
  }
  
  // Check if this is the default widget set - use predefined layout
  const defaultSet = ['profile', 'quickLinks', 'goals', 'calendar']
  const isDefaultSet = enabledWidgets.length === defaultSet.length && 
    defaultSet.every(w => enabledWidgets.includes(w))
  
  if (isDefaultSet) {
    return getDefaultLayout()
  }
  
  // Generate fresh layout - pack widgets in rows
  const layout = []
  let currentX = 0
  let currentY = 0
  let rowMaxH = 0
  
  enabledWidgets.forEach(widgetId => {
    const defaults = DEFAULT_LAYOUTS[widgetId] || { w: 4, h: 3 }
    
    // If widget doesn't fit in current row, move to next row
    if (currentX + defaults.w > cols) {
      currentX = 0
      currentY += rowMaxH
      rowMaxH = 0
    }
    
    layout.push({ i: widgetId, x: currentX, y: currentY, w: defaults.w, h: defaults.h })
    currentX += defaults.w
    rowMaxH = Math.max(rowMaxH, defaults.h)
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
  
  // Grid layout state - validate before using
  const [layout, setLayout] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LAYOUT)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Validate layout structure (12 columns)
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(item =>
          item && item.i && 
          typeof item.x === 'number' && item.x >= 0 && item.x <= 11 &&
          typeof item.y === 'number' && item.y >= 0 &&
          typeof item.w === 'number' && item.w >= 1 && item.w <= 12 &&
          typeof item.h === 'number' && item.h >= 1
        )) {
          return parsed
        }
        // Invalid layout, clear it
        localStorage.removeItem(STORAGE_KEY_LAYOUT)
        return null
      } catch {
        localStorage.removeItem(STORAGE_KEY_LAYOUT)
        return null
      }
    }
    return null
  })
  
  // Container width for grid - use window-based calculation
  const [containerWidth, setContainerWidth] = useState(0)
  const containerRef = useRef(null)
  const [configLoaded, setConfigLoaded] = useState(false)
  const saveTimeoutRef = useRef(null)

  // Calculate width based on container or window
  useEffect(() => {
    const calculateWidth = () => {
      // Try container first
      if (containerRef.current) {
        const width = containerRef.current.clientWidth
        if (width > 0) {
          setContainerWidth(width)
          return
        }
      }
      // Fallback to window-based calculation
      // max-w-7xl = 80rem = 1280px, minus padding
      const maxWidth = 1280
      const padding = 32 // px-4 on mobile
      const windowWidth = window.innerWidth - padding
      setContainerWidth(Math.min(windowWidth, maxWidth))
    }

    // Calculate immediately and after delays
    calculateWidth()
    const t1 = setTimeout(calculateWidth, 0)
    const t2 = setTimeout(calculateWidth, 100)
    const t3 = setTimeout(calculateWidth, 300)

    window.addEventListener('resize', calculateWidth)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      window.removeEventListener('resize', calculateWidth)
    }
  }, [configLoaded])

  // Validate and clean layout when loaded
  useEffect(() => {
    if (layout && layout.length > 0) {
      // Check if layout has valid structure (12 columns, so x can be 0-11)
      const isValid = layout.every(item => 
        item && item.i && 
        typeof item.x === 'number' && item.x >= 0 && item.x <= 11 &&
        typeof item.y === 'number' && item.y >= 0 &&
        typeof item.w === 'number' && item.w >= 1 && item.w <= 12 &&
        typeof item.h === 'number' && item.h >= 1
      )
      if (!isValid) {
        console.warn('Invalid layout detected, resetting to defaults')
        setLayout(null)
        localStorage.removeItem(STORAGE_KEY_LAYOUT)
      }
    }
  }, [layout])

  // Load dashboard config from Firestore or localStorage
  useEffect(() => {
    const isValidLayout = (layoutArray) => {
      if (!Array.isArray(layoutArray) || layoutArray.length === 0) return false
      return layoutArray.every(item => 
        item && item.i && 
        typeof item.x === 'number' && item.x >= 0 && item.x <= 11 &&
        typeof item.y === 'number' && item.y >= 0 &&
        typeof item.w === 'number' && item.w >= 1 && item.w <= 12 &&
        typeof item.h === 'number' && item.h >= 1
      )
    }

    const loadConfig = async () => {
      if (user && !isGuest) {
        try {
          const config = await userService.getDashboardConfig(user.uid)
          if (config) {
            if (config.widgetOrder && Array.isArray(config.widgetOrder)) {
              setWidgetOrder(config.widgetOrder)
            }
            if (config.enabledWidgets && Array.isArray(config.enabledWidgets)) {
              setEnabledWidgets(config.enabledWidgets)
            }
            // Only use layout if it's valid
            if (config.layout && isValidLayout(config.layout)) {
              setLayout(config.layout)
            } else if (config.layout) {
              console.warn('Invalid layout from Firestore, ignoring')
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
    
    // Save to localStorage immediately
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgetOrder))
    localStorage.setItem(STORAGE_KEY + '_enabled', JSON.stringify(enabledWidgets))
    if (layout) {
      localStorage.setItem(STORAGE_KEY_LAYOUT, JSON.stringify(layout))
    } else {
      localStorage.removeItem(STORAGE_KEY_LAYOUT)
    }
    
    // Debounced save to Firestore
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
      }, 1000)
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

  // Save config immediately (used when exiting edit mode)
  const saveConfigNow = useCallback(async () => {
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgetOrder))
    localStorage.setItem(STORAGE_KEY + '_enabled', JSON.stringify(enabledWidgets))
    if (layout) {
      localStorage.setItem(STORAGE_KEY_LAYOUT, JSON.stringify(layout))
    } else {
      localStorage.removeItem(STORAGE_KEY_LAYOUT)
    }
    
    // Save to Firestore
    if (user && !isGuest) {
      try {
        await userService.saveDashboardConfig(user.uid, {
          widgetOrder,
          enabledWidgets,
          layout
        })
      } catch (error) {
        console.error('Error saving dashboard config:', error)
      }
    }
  }, [widgetOrder, enabledWidgets, layout, user, isGuest])

  const finishEditing = async () => {
    await saveConfigNow()
    setCustomizeMode(false)
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
                onClick={finishEditing}
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

      {/* Grid Layout Container */}
      <div 
        ref={containerRef}
        className={`w-full ${customizeMode ? 'editing-dashboard' : ''}`}
      >
        {configLoaded && containerWidth > 0 && (
          <GridLayout
            className="layout"
            layout={generateLayout(visibleWidgets, layout, 12, containerWidth < 500)}
            cols={12}
            rowHeight={50}
            width={containerWidth}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            isDraggable={customizeMode}
            isResizable={customizeMode}
            compactType={null}
            preventCollision={true}
            onLayoutChange={(newLayout) => {
              if (customizeMode) {
                setLayout(newLayout)
              }
            }}
            draggableHandle=".widget-drag-handle"
            resizeHandles={customizeMode ? ['se', 'e', 's'] : []}
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
        )}
      </div>
      
      {/* Loading state */}
      {!configLoaded && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Add widget button when not customizing */}
      {configLoaded && !customizeMode && Object.keys(WIDGET_REGISTRY).filter(id => !enabledWidgets.includes(id) && !WIDGET_REGISTRY[id].isSpecial).length > 0 && (
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