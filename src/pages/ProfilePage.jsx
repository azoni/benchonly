import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { 
  User, 
  Dumbbell, 
  Target, 
  Flame, 
  Calendar,
  Lock,
  ArrowLeft,
  Activity,
  Trophy,
  Loader2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { userService, workoutService, goalService } from '../services/firestore'
import { feedService, FEED_TYPES, REACTIONS } from '../services/feedService'

export default function ProfilePage() {
  const { userId: handle } = useParams() // Can be username or uid
  const { user: currentUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [recentActivity, setRecentActivity] = useState([])
  const [isOwnProfile, setIsOwnProfile] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [handle, currentUser])

  const loadProfile = async () => {
    setLoading(true)
    try {
      let userData = null
      let targetUserId = null
      
      if (!handle) {
        // No handle provided, show current user's profile
        targetUserId = currentUser?.uid
        userData = await userService.get(targetUserId)
      } else {
        // First try to find by username
        userData = await userService.getByUsername(handle)
        
        if (userData) {
          targetUserId = userData.uid
        } else {
          // Fall back to looking up by uid (for backward compatibility)
          userData = await userService.get(handle)
          targetUserId = handle
        }
      }
      
      setIsOwnProfile(targetUserId === currentUser?.uid)
      
      if (!userData) {
        setProfile(null)
        setLoading(false)
        return
      }

      // Check if profile is private and not own profile
      if (userData.isPrivate && targetUserId !== currentUser?.uid) {
        setProfile({ ...userData, isPrivate: true })
        setLoading(false)
        return
      }

      setProfile(userData)

      // Load stats
      const [workouts, goals] = await Promise.all([
        workoutService.getByUser(targetUserId, 100),
        goalService.getByUser(targetUserId)
      ])

      const completedWorkouts = workouts.filter(w => w.status === 'completed')
      const completedGoals = goals.filter(g => g.status === 'completed')

      setStats({
        totalWorkouts: completedWorkouts.length,
        totalGoals: goals.length,
        completedGoals: completedGoals.length,
        // Calculate streak (consecutive days with workouts)
        streak: calculateStreak(completedWorkouts)
      })

      // Load recent activity
      const feedResult = await feedService.getFeed(5, null, targetUserId)
      setRecentActivity(feedResult.items)

    } catch (error) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateStreak = (workouts) => {
    if (!workouts.length) return 0
    
    // Sort by date descending
    const sorted = [...workouts].sort((a, b) => {
      const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date)
      const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date)
      return dateB - dateA
    })

    let streak = 0
    let currentDate = new Date()
    currentDate.setHours(0, 0, 0, 0)

    for (const workout of sorted) {
      const workoutDate = workout.date?.toDate ? workout.date.toDate() : new Date(workout.date)
      workoutDate.setHours(0, 0, 0, 0)
      
      const diffDays = Math.floor((currentDate - workoutDate) / (1000 * 60 * 60 * 24))
      
      if (diffDays <= 1) {
        streak++
        currentDate = workoutDate
      } else {
        break
      }
    }

    return streak
  }

  const getActivityIcon = (type) => {
    switch (type) {
      case FEED_TYPES.WORKOUT_COMPLETED:
        return <Dumbbell className="w-4 h-4 text-green-400" />
      case FEED_TYPES.CARDIO_LOGGED:
        return <Activity className="w-4 h-4 text-orange-400" />
      case FEED_TYPES.GOAL_COMPLETED:
        return <Trophy className="w-4 h-4 text-yellow-400" />
      case FEED_TYPES.GOAL_CREATED:
        return <Target className="w-4 h-4 text-purple-400" />
      default:
        return <Activity className="w-4 h-4 text-iron-400" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-flame-500 animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <User className="w-16 h-16 text-iron-600 mx-auto mb-4" />
        <h2 className="text-xl font-display text-iron-200 mb-2">User Not Found</h2>
        <p className="text-iron-500 mb-6">This user doesn't exist or has been deleted.</p>
        <Link to="/feed" className="btn-primary">Back to Feed</Link>
      </div>
    )
  }

  if (profile.isPrivate && !isOwnProfile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <Lock className="w-16 h-16 text-iron-600 mx-auto mb-4" />
        <h2 className="text-xl font-display text-iron-200 mb-2">Private Profile</h2>
        <p className="text-iron-500 mb-6">This user has set their profile to private.</p>
        <Link to="/feed" className="btn-primary">Back to Feed</Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Back button */}
      <Link 
        to="/feed" 
        className="inline-flex items-center gap-2 text-iron-400 hover:text-iron-200 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Feed
      </Link>

      {/* Profile Header */}
      <div className="card-steel p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-iron-800 flex items-center justify-center">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt="" className="w-20 h-20 rounded-full" />
            ) : (
              <User className="w-10 h-10 text-iron-400" />
            )}
          </div>
          
          <div className="flex-1">
            <h1 className="text-2xl font-display text-iron-100">
              {profile.displayName || 'User'}
            </h1>
            {profile.createdAt && (
              <p className="text-sm text-iron-500">
                Member since {format(profile.createdAt.toDate ? profile.createdAt.toDate() : new Date(profile.createdAt), 'MMMM yyyy')}
              </p>
            )}
          </div>

          {isOwnProfile && (
            <Link 
              to="/settings" 
              className="btn-secondary text-sm"
            >
              Edit Profile
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="card-steel p-4 text-center">
            <Dumbbell className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <p className="text-2xl font-display text-iron-100">{stats.totalWorkouts}</p>
            <p className="text-xs text-iron-500">Workouts</p>
          </div>
          
          <div className="card-steel p-4 text-center">
            <Target className="w-6 h-6 text-purple-400 mx-auto mb-2" />
            <p className="text-2xl font-display text-iron-100">
              {stats.completedGoals}/{stats.totalGoals}
            </p>
            <p className="text-xs text-iron-500">Goals</p>
          </div>
          
          <div className="card-steel p-4 text-center">
            <Flame className="w-6 h-6 text-flame-400 mx-auto mb-2" />
            <p className="text-2xl font-display text-iron-100">{stats.streak}</p>
            <p className="text-xs text-iron-500">Day Streak</p>
          </div>
          
          <div className="card-steel p-4 text-center">
            <Trophy className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
            <p className="text-2xl font-display text-iron-100">{stats.completedGoals}</p>
            <p className="text-xs text-iron-500">Achieved</p>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="card-steel p-4">
        <h2 className="font-display text-lg text-iron-100 mb-4">Recent Activity</h2>
        
        {recentActivity.length === 0 ? (
          <p className="text-center text-iron-500 py-8">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map(item => (
              <div key={item.id} className="flex items-center gap-3 py-2 border-b border-iron-800 last:border-0">
                {getActivityIcon(item.type)}
                <div className="flex-1">
                  <p className="text-sm text-iron-300">
                    {item.data?.name || item.type.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-iron-600">
                    {item.createdAt?.toDate && formatDistanceToNow(item.createdAt.toDate(), { addSuffix: true })}
                  </p>
                </div>
                
                {/* Reaction summary */}
                {item.reactionCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-iron-500">
                    {Object.entries(item.reactions || {}).slice(0, 3).map(([emoji, users]) => (
                      users.length > 0 && <span key={emoji}>{emoji}</span>
                    ))}
                    <span>{item.reactionCount}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <Link 
          to={`/feed?user=${profile?.uid || currentUser?.uid}`}
          className="block mt-4 text-center text-sm text-flame-400 hover:text-flame-300"
        >
          View all activity →
        </Link>
      </div>
    </div>
  )
}