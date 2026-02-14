import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Gift,
  BookOpen,
  Target,
  Dumbbell,
  Sparkles,
  UserPlus,
  Check,
  Zap,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { creditService, goalService, workoutService } from '../services/firestore'
import { friendService } from '../services/friendService'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../services/firebase'

const CHECKLIST_TASKS = [
  {
    id: 'docs',
    label: 'Read the docs',
    description: 'Learn how BenchOnly works',
    icon: BookOpen,
    credits: 25,
    link: '/docs',
    linkLabel: 'Open Docs',
    color: 'blue',
  },
  {
    id: 'goal',
    label: 'Set your first goal',
    description: 'Pick a lift and set a target',
    icon: Target,
    credits: 100,
    link: '/goals',
    linkLabel: 'Go to Goals',
    color: 'flame',
  },
  {
    id: 'workout',
    label: 'Complete a workout',
    description: 'Log a workout with actual sets',
    icon: Dumbbell,
    credits: 100,
    link: '/workouts/new',
    linkLabel: 'New Workout',
    color: 'green',
  },
  {
    id: 'aiWorkout',
    label: 'Generate an AI workout',
    description: 'Let AI build a session for you',
    icon: Sparkles,
    credits: 50,
    link: '/workouts/generate',
    linkLabel: 'Generate',
    color: 'purple',
  },
  {
    id: 'friend',
    label: 'Add a friend',
    description: 'Connect with a training partner',
    icon: UserPlus,
    credits: 50,
    link: '/friends',
    linkLabel: 'Find Friends',
    color: 'cyan',
  },
]

const TOTAL_CREDITS = CHECKLIST_TASKS.reduce((sum, t) => sum + t.credits, 0)

const colorMap = {
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  flame: 'bg-flame-500/15 text-flame-400 border-flame-500/20',
  green: 'bg-green-500/15 text-green-400 border-green-500/20',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
}

export default function OnboardingChecklist({ embedded = false }) {
  const { user, userProfile, updateProfile, isGuest } = useAuth()
  const [checklist, setChecklist] = useState(null)
  const [taskStatus, setTaskStatus] = useState({})
  const [claiming, setClaiming] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [dismissToast, setDismissToast] = useState(false)

  useEffect(() => {
    if (!user || isGuest) return
    
    const cl = userProfile?.onboardingChecklist || {}
    setChecklist(cl)
    
    // Check real data for task completion
    checkTaskCompletion(cl)
  }, [user, userProfile])

  const checkTaskCompletion = async (cl) => {
    if (!user) return
    const status = {}
    
    try {
      // Check if docs were visited (trust the claim — no perfect way to verify)
      status.docs = cl.docs === true ? 'claimed' : 'ready'
      
      // Check if user has any goals
      const goalSnap = await getDocs(query(
        collection(db, 'goals'), where('userId', '==', user.uid), limit(1)
      ))
      status.goal = cl.goal === true ? 'claimed' : goalSnap.size > 0 ? 'completed' : 'pending'
      
      // Check if user has any completed workouts
      const workoutSnap = await getDocs(query(
        collection(db, 'workouts'), where('userId', '==', user.uid), where('status', '==', 'completed'), limit(1)
      ))
      status.workout = cl.workout === true ? 'claimed' : workoutSnap.size > 0 ? 'completed' : 'pending'
      
      // Check if user has any AI-generated workouts
      const aiSnap = await getDocs(query(
        collection(db, 'workouts'), where('userId', '==', user.uid), where('generatedByAI', '==', true), limit(1)
      ))
      status.aiWorkout = cl.aiWorkout === true ? 'claimed' : aiSnap.size > 0 ? 'completed' : 'pending'
      
      // Check if user has any friends
      const friends = await friendService.getFriends(user.uid)
      const pending = await friendService.getSentRequests(user.uid)
      status.friend = cl.friend === true ? 'claimed' : (friends.length > 0 || pending.length > 0) ? 'completed' : 'pending'
      
    } catch (err) {
      console.error('Checklist check error:', err)
      // Default everything to ready/pending on error
      CHECKLIST_TASKS.forEach(t => {
        if (!status[t.id]) status[t.id] = cl[t.id] === true ? 'claimed' : 'pending'
      })
    }
    
    setTaskStatus(status)
    setLoaded(true)
  }

  const claimReward = async (taskId, credits) => {
    if (claiming) return
    setClaiming(taskId)
    
    try {
      await creditService.add(user.uid, credits)
      const newChecklist = { ...(userProfile?.onboardingChecklist || {}), [taskId]: true }
      await updateProfile({ 
        onboardingChecklist: newChecklist,
        credits: (userProfile?.credits ?? 0) + credits,
      })
      setTaskStatus(prev => ({ ...prev, [taskId]: 'claimed' }))
      setChecklist(newChecklist)
    } catch (err) {
      console.error('Claim error:', err)
    } finally {
      setClaiming(null)
    }
  }

  const dismissChecklist = async () => {
    try {
      await updateProfile({ 
        onboardingChecklist: { ...(userProfile?.onboardingChecklist || {}), dismissed: true }
      })
      setChecklist(prev => ({ ...prev, dismissed: true }))
      setDismissToast(true)
      setTimeout(() => setDismissToast(false), 4000)
    } catch (err) {
      console.error('Dismiss error:', err)
    }
  }

  // Don't show for guests or if profile not loaded
  if (isGuest || !userProfile || !loaded) return null
  
  // Don't show if all tasks are claimed
  const allClaimed = CHECKLIST_TASKS.every(t => taskStatus[t.id] === 'claimed')
  if (allClaimed) return null

  // On TodayPage: hide if dismissed (but show toast briefly)
  // In Settings (embedded): always show if not all claimed
  if (!embedded && checklist?.dismissed) {
    if (!dismissToast) return null
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mb-6 p-3 bg-iron-800/80 border border-iron-700 rounded-xl flex items-center gap-3"
      >
        <Gift className="w-4 h-4 text-flame-400 flex-shrink-0" />
        <p className="text-sm text-iron-300 flex-1">You can find the getting started checklist in <Link to="/settings" className="text-flame-400 hover:underline">Settings</Link>.</p>
        <button onClick={() => setDismissToast(false)} className="text-iron-500 hover:text-iron-300">
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    )
  }

  const claimedCount = CHECKLIST_TASKS.filter(t => taskStatus[t.id] === 'claimed').length
  const earnedCredits = CHECKLIST_TASKS.filter(t => taskStatus[t.id] === 'claimed').reduce((s, t) => s + t.credits, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <div className="card-steel rounded-xl overflow-hidden border border-flame-500/20">
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 p-4 hover:bg-iron-800/30 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-flame-500/20 flex items-center justify-center flex-shrink-0">
            <Gift className="w-5 h-5 text-flame-400" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-semibold text-iron-100">Get Started — Earn {TOTAL_CREDITS} Credits</h3>
            <p className="text-xs text-iron-500">{claimedCount}/{CHECKLIST_TASKS.length} complete · {earnedCredits} credits earned</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Progress ring */}
            <div className="relative w-8 h-8">
              <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="3" className="text-iron-800" />
                <circle
                  cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="3"
                  strokeDasharray={`${(claimedCount / CHECKLIST_TASKS.length) * 81.7} 81.7`}
                  className="text-flame-500 transition-all duration-500"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-iron-300">
                {claimedCount}/{CHECKLIST_TASKS.length}
              </span>
            </div>
            {collapsed ? <ChevronDown className="w-4 h-4 text-iron-500" /> : <ChevronUp className="w-4 h-4 text-iron-500" />}
          </div>
        </button>

        {/* Tasks */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-2">
                {CHECKLIST_TASKS.map((task) => {
                  const status = taskStatus[task.id]
                  const Icon = task.icon
                  const isClaimed = status === 'claimed'
                  const isCompleted = status === 'completed'
                  const isReady = status === 'ready'
                  const canClaim = isCompleted || isReady
                  
                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        isClaimed ? 'bg-iron-800/30 opacity-60' : 'bg-iron-800/50'
                      }`}
                    >
                      {/* Icon */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isClaimed ? 'bg-green-500/20' : `${colorMap[task.color]?.split(' ')[0] || 'bg-iron-700'}`
                      }`}>
                        {isClaimed ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Icon className={`w-4 h-4 ${colorMap[task.color]?.split(' ')[1] || 'text-iron-400'}`} />
                        )}
                      </div>
                      
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isClaimed ? 'text-iron-500 line-through' : 'text-iron-200'}`}>
                          {task.label}
                        </p>
                        <p className="text-[11px] text-iron-600">{task.description}</p>
                      </div>
                      
                      {/* Action */}
                      {isClaimed ? (
                        <span className="text-[10px] text-green-400/70 flex items-center gap-1 flex-shrink-0">
                          <Zap className="w-3 h-3" />+{task.credits}
                        </span>
                      ) : canClaim ? (
                        <button
                          onClick={() => claimReward(task.id, task.credits)}
                          disabled={!!claiming}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-flame-500/20 text-flame-400 border border-flame-500/30 hover:bg-flame-500/30 transition-colors flex items-center gap-1 flex-shrink-0"
                        >
                          {claiming === task.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Zap className="w-3 h-3" />
                              Claim {task.credits}
                            </>
                          )}
                        </button>
                      ) : (
                        <Link
                          to={task.link}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-iron-700/50 text-iron-400 hover:bg-iron-700 transition-colors flex-shrink-0"
                        >
                          {task.linkLabel}
                        </Link>
                      )}
                    </div>
                  )
                })}
                
                {/* Dismiss */}
                {!embedded && (
                  <button
                    onClick={dismissChecklist}
                    className="w-full text-center text-xs text-iron-600 hover:text-iron-400 py-2 transition-colors"
                  >
                    Dismiss checklist
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}