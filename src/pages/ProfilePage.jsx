import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { format, formatDistanceToNow, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday } from 'date-fns'
import { 
  User, 
  Dumbbell, 
  Target, 
  Lock,
  ArrowLeft,
  Activity,
  Loader2,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Heart,
  Settings,
  UserPlus,
  UserMinus,
  Clock,
  Check,
  X as XIcon,
  Search,
  Users,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { userService, workoutService, goalService, groupWorkoutService } from '../services/firestore'
import { feedService, FEED_TYPES } from '../services/feedService'
import { friendService, FRIEND_STATUS } from '../services/friendService'
import { toDateString } from '../utils/dateUtils'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../services/firebase'
import usePageTitle from '../utils/usePageTitle'

function FriendButton({ friendStatus, loading, onAction }) {
  if (!friendStatus) return null
  
  const config = {
    [FRIEND_STATUS.NONE]: { label: 'Add Friend', icon: UserPlus, className: 'bg-flame-500/20 text-flame-400 hover:bg-flame-500/30' },
    [FRIEND_STATUS.PENDING_SENT]: { label: 'Pending', icon: Clock, className: 'bg-iron-700 text-iron-300 hover:bg-iron-600' },
    [FRIEND_STATUS.PENDING_RECEIVED]: { label: 'Accept', icon: Check, className: 'bg-green-500/20 text-green-400 hover:bg-green-500/30' },
    [FRIEND_STATUS.FRIENDS]: { label: 'Friends', icon: Heart, className: 'bg-blue-500/10 text-blue-400 hover:bg-red-500/10 hover:text-red-400' },
  }
  
  const c = config[friendStatus.status] || config[FRIEND_STATUS.NONE]
  const Icon = c.icon
  
  return (
    <button
      onClick={onAction}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${c.className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {c.label}
    </button>
  )
}

export default function ProfilePage() {
  const { userId: handle } = useParams() // Can be username or uid
  usePageTitle('Profile')
  const { user: currentUser, isRealAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [recentActivity, setRecentActivity] = useState([])
  const [isOwnProfile, setIsOwnProfile] = useState(false)
  
  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [workouts, setWorkouts] = useState([])
  const [goals, setGoals] = useState([])
  
  const [goalsExpanded, setGoalsExpanded] = useState(false)

  // Friend state
  const [friendStatus, setFriendStatus] = useState(null) // { status, requestId?, friendshipId? }
  const [friendActionLoading, setFriendActionLoading] = useState(false)
  const [friendCount, setFriendCount] = useState(0)
  
  // Profile tabs (own profile only)
  const [profileTab, setProfileTab] = useState('overview') // 'overview' | 'friends'
  const [friendsList, setFriendsList] = useState([])
  const [receivedRequests, setReceivedRequests] = useState([])
  const [sentRequests, setSentRequests] = useState([])
  const [friendsLoading, setFriendsLoading] = useState(false)
  const [friendsTab, setFriendsTab] = useState('friends') // 'friends' | 'requests' | 'sent' | 'find'
  const [friendSearch, setFriendSearch] = useState('')
  const [allUsers, setAllUsers] = useState([])
  const [friendActionStates, setFriendActionStates] = useState({}) // { [id]: loading }
  // Smart back navigation
  const handleBack = () => {
    if (location.state?.from) {
      navigate(location.state.from)
    } else {
      navigate(-1)
    }
  }

  const backLabel = location.state?.fromLabel || 'Back'

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

      // Load friend status for non-own profiles
      let currentFriendStatus = { status: FRIEND_STATUS.NONE }
      if (currentUser && targetUserId !== currentUser.uid) {
        try {
          currentFriendStatus = await friendService.getFriendshipStatus(currentUser.uid, targetUserId)
          setFriendStatus(currentFriendStatus)
        } catch (e) {
          console.error('Friend status error:', e)
        }
      }

      // Load friend count
      try {
        const count = await friendService.getFriendCount(targetUserId)
        setFriendCount(count)
        // For own profile, also load pending request count for tab badge
        if (targetUserId === currentUser?.uid) {
          const received = await friendService.getReceivedRequests(currentUser.uid)
          setReceivedRequests(received)
        }
      } catch (e) {
        console.error('Friend count error:', e)
      }

      // Check visibility — allow friends to see "friends" visibility profiles
      const defaultVis = userData.defaultVisibility || (userData.isPrivate ? 'private' : 'public')
      const isFriend = currentFriendStatus.status === FRIEND_STATUS.FRIENDS
      const canView = targetUserId === currentUser?.uid || 
                       isRealAdmin ||
                       defaultVis === 'public' || 
                       (defaultVis === 'friends' && isFriend)
      
      if (!canView) {
        setProfile({ ...userData, isPrivate: true, defaultVisibility: defaultVis, uid: targetUserId })
        setLoading(false)
        return
      }

      setProfile(userData)

      // Load workouts (personal + group) to calculate stats
      const [workoutsData, groupWorkoutsData] = await Promise.all([
        workoutService.getByUser(targetUserId, 500),
        groupWorkoutService.getByUser(targetUserId)
      ])
      
      const completedPersonal = workoutsData.filter(w => w.status === 'completed')
      const completedGroup = groupWorkoutsData.filter(w => w.status === 'completed')
      const allCompletedWorkouts = [...completedPersonal, ...completedGroup]
      
      // Store all workouts for calendar (both scheduled and completed)
      setWorkouts([...workoutsData, ...groupWorkoutsData])

      // Calculate maxes from workout history
      const maxes = { bench: 0, squat: 0, deadlift: 0 }
      const bestSets = { bench: null, squat: null, deadlift: null }
      
      const calcE1RM = (w, r) => {
        if (!w || !r || r < 1) return 0
        if (r === 1) return w
        return Math.round(w * (1 + r / 30))
      }
      
      allCompletedWorkouts.forEach(workout => {
        if (workout.exercises) {
          workout.exercises.forEach(exercise => {
            const name = exercise.name?.toLowerCase() || ''
            let liftKey = null
            
            if (name.includes('bench') && !name.includes('incline') && !name.includes('decline')) {
              liftKey = 'bench'
            } else if (name.includes('squat') && !name.includes('front') && !name.includes('hack')) {
              liftKey = 'squat'
            } else if (name.includes('deadlift') && !name.includes('romanian') && !name.includes('rdl') && !name.includes('stiff')) {
              liftKey = 'deadlift'
            }
            
            if (!liftKey) return
            
            exercise.sets?.forEach(set => {
              const weight = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0
              const reps = parseInt(set.actualReps) || parseInt(set.prescribedReps) || 1
              
              maxes[liftKey] = Math.max(maxes[liftKey], weight)
              
              const e1rm = calcE1RM(weight, reps)
              if (!bestSets[liftKey] || e1rm > bestSets[liftKey].e1rm) {
                bestSets[liftKey] = { weight, reps, e1rm }
              }
            })
          })
        }
      })

      setStats({
        totalWorkouts: allCompletedWorkouts.length,
        bench: maxes.bench,
        squat: maxes.squat,
        deadlift: maxes.deadlift,
        total: maxes.bench + maxes.squat + maxes.deadlift,
        bestSets,
      })

      // Load goals
      const goalsData = await goalService.getByUser(targetUserId)
      setGoals(goalsData.filter(g => g.status === 'active'))

      // Load recent activity
      const feedResult = await feedService.getFeed(5, null, targetUserId)
      setRecentActivity(feedResult.items)

    } catch (error) {
      console.error('Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }

  // Load friends data when Friends tab is selected
  const loadFriendsData = async () => {
    if (!currentUser || friendsLoading) return
    setFriendsLoading(true)
    try {
      const usersSnap = await getDocs(collection(db, 'users'))
      const uMap = {}
      const uList = []
      usersSnap.docs.forEach(d => {
        const data = { id: d.id, uid: d.id, ...d.data() }
        uMap[d.id] = data
        if (d.id !== currentUser.uid) uList.push(data)
      })
      setAllUsers(uList)

      const [friendIds, received, sent] = await Promise.all([
        friendService.getFriends(currentUser.uid),
        friendService.getReceivedRequests(currentUser.uid),
        friendService.getSentRequests(currentUser.uid),
      ])

      setFriendsList(friendIds.map(id => uMap[id]).filter(Boolean))
      setReceivedRequests(received)
      setSentRequests(sent)
      setFriendCount(friendIds.length)
    } catch (e) {
      console.error('Error loading friends:', e)
    } finally {
      setFriendsLoading(false)
    }
  }

  const handleFriendsTabAction = async (action, id, extra) => {
    setFriendActionStates(prev => ({ ...prev, [id]: true }))
    try {
      if (action === 'accept') {
        await friendService.acceptRequest(id)
        await loadFriendsData()
      } else if (action === 'decline') {
        await friendService.declineRequest(id)
        setReceivedRequests(prev => prev.filter(r => r.id !== id))
      } else if (action === 'cancel') {
        await friendService.cancelRequest(id)
        setSentRequests(prev => prev.filter(r => r.id !== id))
      } else if (action === 'remove') {
        if (!confirm('Remove this friend?')) return
        await friendService.removeFriend(currentUser.uid, id)
        setFriendsList(prev => prev.filter(f => (f.uid || f.id) !== id))
        setFriendCount(prev => Math.max(0, prev - 1))
      } else if (action === 'send') {
        await friendService.sendRequest(currentUser.uid, id)
        const sent = await friendService.getSentRequests(currentUser.uid)
        setSentRequests(sent)
      }
    } catch (e) {
      console.error('Friend action error:', e)
      alert(e.message)
    } finally {
      setFriendActionStates(prev => ({ ...prev, [id]: false }))
    }
  }

  const getActivityIcon = (type) => {
    switch (type) {
      case FEED_TYPES.WORKOUT:
        return <Dumbbell className="w-4 h-4 text-green-400" />
      case FEED_TYPES.CARDIO:
        return <Activity className="w-4 h-4 text-orange-400" />
      case FEED_TYPES.GOAL_COMPLETED:
        return <Trophy className="w-4 h-4 text-yellow-400" />
      case FEED_TYPES.GOAL_CREATED:
        return <Target className="w-4 h-4 text-purple-400" />
      default:
        return <Activity className="w-4 h-4 text-iron-400" />
    }
  }

  // Calendar helpers
  const getDaysInMonth = () => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }

  const getWorkoutsForDay = (date) => {
    const dateStr = toDateString(date)
    return workouts.filter(w => {
      const workoutDate = w.date?.toDate ? w.date.toDate() : new Date(w.date)
      return toDateString(workoutDate) === dateStr
    })
  }

  const getGoalDeadline = (date) => {
    const dateStr = toDateString(date)
    return goals.find(g => toDateString(g.targetDate) === dateStr)
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
        <button onClick={handleBack} className="btn-primary">Go Back</button>
      </div>
    )
  }

  if (profile.isPrivate && !isOwnProfile) {
    const handleFriendAction = async () => {
      if (!currentUser) return
      setFriendActionLoading(true)
      try {
        if (!friendStatus || friendStatus.status === FRIEND_STATUS.NONE) {
          await friendService.sendRequest(currentUser.uid, profile.uid || handle)
          setFriendStatus({ status: FRIEND_STATUS.PENDING_SENT })
        } else if (friendStatus.status === FRIEND_STATUS.PENDING_SENT) {
          await friendService.cancelRequest(friendStatus.requestId)
          setFriendStatus({ status: FRIEND_STATUS.NONE })
        } else if (friendStatus.status === FRIEND_STATUS.PENDING_RECEIVED) {
          await friendService.acceptRequest(friendStatus.requestId)
          setFriendStatus({ status: FRIEND_STATUS.FRIENDS })
          loadProfile() // Reload to show full profile
        }
      } catch (e) {
        console.error('Friend action error:', e)
      } finally {
        setFriendActionLoading(false)
      }
    }

    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <Lock className="w-16 h-16 text-iron-600 mx-auto mb-4" />
        <h2 className="text-xl font-display text-iron-200 mb-2">
          {profile.defaultVisibility === 'friends' ? 'Friends Only' : 'Private Profile'}
        </h2>
        <p className="text-iron-500 mb-6">
          {profile.defaultVisibility === 'friends' 
            ? 'This user only shares their activity with friends.'
            : 'This user has set their profile to private.'}
        </p>
        {currentUser && profile.defaultVisibility === 'friends' && (
          <button
            onClick={handleFriendAction}
            disabled={friendActionLoading || friendStatus?.status === FRIEND_STATUS.FRIENDS}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors mb-4 ${
              friendStatus?.status === FRIEND_STATUS.PENDING_SENT
                ? 'bg-iron-700 text-iron-300 hover:bg-iron-600'
                : friendStatus?.status === FRIEND_STATUS.PENDING_RECEIVED
                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                : 'bg-flame-500/20 text-flame-400 hover:bg-flame-500/30'
            }`}
          >
            {friendActionLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
            {friendStatus?.status === FRIEND_STATUS.PENDING_SENT ? 'Cancel Request' :
             friendStatus?.status === FRIEND_STATUS.PENDING_RECEIVED ? 'Accept Friend Request' :
             'Send Friend Request'}
          </button>
        )}
        <br />
        <button onClick={handleBack} className="btn-primary">Go Back</button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Back button - only when navigated from another page, not from nav */}
      {location.state?.from && (
        <button 
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-iron-400 hover:text-iron-200 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </button>
      )}

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
              {isRealAdmin && !isOwnProfile && (
                <span className={`ml-2 text-xs font-normal px-2 py-0.5 rounded-full align-middle ${
                  (profile.defaultVisibility || 'public') === 'public' ? 'bg-green-500/10 text-green-400' :
                  (profile.defaultVisibility) === 'friends' ? 'bg-blue-500/10 text-blue-400' :
                  'bg-red-500/10 text-red-400'
                }`}>
                  {(profile.defaultVisibility || 'public')}
                </span>
              )}
            </h1>
            {profile.username && (
              <p className="text-sm text-flame-400">@{profile.username}</p>
            )}
            {profile.createdAt && (
              <p className="text-xs text-iron-500 mt-1">
                Member since {format(profile.createdAt.toDate ? profile.createdAt.toDate() : new Date(profile.createdAt), 'MMMM yyyy')}
                {friendCount > 0 && (
                  <> · <button 
                    onClick={() => { setProfileTab('friends'); if (friendsList.length === 0) loadFriendsData() }}
                    className="text-flame-400 hover:text-flame-300"
                  >{friendCount} friend{friendCount !== 1 ? 's' : ''}</button></>
                )}
              </p>
            )}
            {/* Badges */}
            {profile.badges?.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {profile.badges.map(badge => (
                  <span
                    key={badge.id}
                    title={badge.name}
                    className="w-7 h-7 flex items-center justify-center bg-iron-800 border border-iron-700 rounded-lg text-sm cursor-default hover:bg-iron-700 transition-colors"
                  >
                    {badge.icon}
                  </span>
                ))}
              </div>
            )}
          </div>

          {isOwnProfile ? (
            <Link 
              to="/settings" 
              className="btn-secondary text-sm"
            >
              Edit Profile
            </Link>
          ) : currentUser && (
            <FriendButton 
              friendStatus={friendStatus} 
              loading={friendActionLoading}
              onAction={async () => {
                setFriendActionLoading(true)
                try {
                  const targetId = profile.uid || handle
                  if (!friendStatus || friendStatus.status === FRIEND_STATUS.NONE) {
                    await friendService.sendRequest(currentUser.uid, targetId)
                    setFriendStatus({ status: FRIEND_STATUS.PENDING_SENT })
                  } else if (friendStatus.status === FRIEND_STATUS.PENDING_SENT) {
                    await friendService.cancelRequest(friendStatus.requestId)
                    setFriendStatus({ status: FRIEND_STATUS.NONE })
                  } else if (friendStatus.status === FRIEND_STATUS.PENDING_RECEIVED) {
                    await friendService.acceptRequest(friendStatus.requestId)
                    setFriendStatus({ status: FRIEND_STATUS.FRIENDS })
                  } else if (friendStatus.status === FRIEND_STATUS.FRIENDS) {
                    if (confirm('Remove this friend?')) {
                      await friendService.removeFriend(currentUser.uid, targetId)
                      setFriendStatus({ status: FRIEND_STATUS.NONE })
                      setFriendCount(prev => Math.max(0, prev - 1))
                    }
                  }
                } catch (e) {
                  console.error('Friend action error:', e)
                  alert(e.message)
                } finally {
                  setFriendActionLoading(false)
                }
              }}
            />
          )}
        </div>
      </div>

      {/* Profile Tabs — own profile only */}
      {isOwnProfile && (
        <div className="flex gap-2 mb-6">
          {[
            { key: 'overview', label: 'Overview', icon: Activity },
            { key: 'friends', label: 'Friends', icon: Users, badge: receivedRequests.length || null },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setProfileTab(tab.key)
                if (tab.key === 'friends' && friendsList.length === 0 && !friendsLoading) {
                  loadFriendsData()
                }
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                profileTab === tab.key
                  ? 'bg-flame-500/20 text-flame-400 border border-flame-500/30'
                  : 'bg-iron-800/50 text-iron-400 border border-iron-700/50 hover:text-iron-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.badge > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-flame-500 text-white font-bold">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ===== FRIENDS TAB ===== */}
      {isOwnProfile && profileTab === 'friends' && (
        <div>
          {/* Friends sub-tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {[
              { key: 'friends', label: 'My Friends', count: friendsList.length },
              { key: 'requests', label: 'Requests', count: receivedRequests.length },
              { key: 'sent', label: 'Sent', count: sentRequests.length },
              { key: 'find', label: 'Find People' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setFriendsTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  friendsTab === t.key
                    ? 'bg-iron-800 text-iron-100'
                    : 'text-iron-500 hover:text-iron-300'
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className="ml-1.5 text-xs opacity-60">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {friendsLoading ? (
            <div className="card-steel p-12 text-center">
              <Loader2 className="w-6 h-6 text-flame-500 animate-spin mx-auto" />
              <p className="text-iron-500 mt-3 text-sm">Loading friends...</p>
            </div>
          ) : friendsTab === 'friends' ? (
            /* Friends List */
            friendsList.length === 0 ? (
              <div className="card-steel p-12 text-center">
                <Users className="w-12 h-12 text-iron-600 mx-auto mb-4" />
                <p className="text-iron-500 mb-2">No friends yet</p>
                <button onClick={() => setFriendsTab('find')} className="text-sm text-flame-400 hover:text-flame-300">
                  Find people to add
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {friendsList.map(friend => {
                  const fid = friend.uid || friend.id
                  return (
                    <div key={fid} className="card-steel p-4 flex items-center gap-3">
                      <Link 
                        to={`/profile/${friend.username || fid}`}
                        className="w-10 h-10 rounded-full bg-iron-800 flex items-center justify-center hover:bg-iron-700 transition-colors"
                      >
                        {friend.photoURL ? (
                          <img src={friend.photoURL} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <User className="w-5 h-5 text-iron-400" />
                        )}
                      </Link>
                      <Link to={`/profile/${friend.username || fid}`} className="flex-1 min-w-0">
                        <p className="font-medium text-iron-200 truncate">{friend.displayName || 'User'}</p>
                        {friend.username && <p className="text-xs text-flame-400">@{friend.username}</p>}
                      </Link>
                      <button
                        onClick={() => handleFriendsTabAction('remove', fid)}
                        disabled={friendActionStates[fid]}
                        className="p-2 text-iron-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Remove friend"
                      >
                        {friendActionStates[fid] ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          ) : friendsTab === 'requests' ? (
            /* Received Requests */
            <div className="space-y-2">
              {receivedRequests.length === 0 ? (
                <div className="card-steel p-12 text-center">
                  <Clock className="w-12 h-12 text-iron-600 mx-auto mb-4" />
                  <p className="text-iron-500">No pending requests</p>
                </div>
              ) : receivedRequests.map(req => {
                  const fromUser = allUsers.find(u => u.id === req.from) || { displayName: 'User' }
                  return (
                    <div key={req.id} className="card-steel p-4 flex items-center gap-3">
                      <Link 
                        to={`/profile/${fromUser.username || req.from}`}
                        className="w-10 h-10 rounded-full bg-iron-800 flex items-center justify-center hover:bg-iron-700 transition-colors"
                      >
                        {fromUser.photoURL ? (
                          <img src={fromUser.photoURL} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <User className="w-5 h-5 text-iron-400" />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-iron-200 truncate">{fromUser.displayName}</p>
                        {fromUser.username && <p className="text-xs text-flame-400">@{fromUser.username}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFriendsTabAction('accept', req.id)}
                          disabled={friendActionStates[req.id]}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors"
                        >
                          {friendActionStates[req.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Accept
                        </button>
                        <button
                          onClick={() => handleFriendsTabAction('decline', req.id)}
                          disabled={friendActionStates[req.id]}
                          className="p-1.5 text-iron-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
              })}
            </div>
          ) : friendsTab === 'sent' ? (
            /* Sent Requests */
            <div className="space-y-2">
              {sentRequests.length === 0 ? (
                <div className="card-steel p-12 text-center">
                  <UserPlus className="w-12 h-12 text-iron-600 mx-auto mb-4" />
                  <p className="text-iron-500">No sent requests</p>
                </div>
              ) : sentRequests.map(req => {
                  const toUser = allUsers.find(u => u.id === req.to) || { displayName: 'User' }
                  return (
                    <div key={req.id} className="card-steel p-4 flex items-center gap-3">
                      <Link 
                        to={`/profile/${toUser.username || req.to}`}
                        className="w-10 h-10 rounded-full bg-iron-800 flex items-center justify-center hover:bg-iron-700 transition-colors"
                      >
                        {toUser.photoURL ? (
                          <img src={toUser.photoURL} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <User className="w-5 h-5 text-iron-400" />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-iron-200 truncate">{toUser.displayName}</p>
                        {toUser.username && <p className="text-xs text-flame-400">@{toUser.username}</p>}
                      </div>
                      <button
                        onClick={() => handleFriendsTabAction('cancel', req.id)}
                        disabled={friendActionStates[req.id]}
                        className="flex items-center gap-1 px-3 py-1.5 bg-iron-700 text-iron-300 hover:bg-iron-600 rounded-lg text-sm font-medium transition-colors"
                      >
                        {friendActionStates[req.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XIcon className="w-3.5 h-3.5" />}
                        Cancel
                      </button>
                    </div>
                  )
              })}
            </div>
          ) : (
            /* Find People */
            <div>
              <div className="card-steel p-4 mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500" />
                  <input
                    type="text"
                    placeholder="Search by name or username..."
                    value={friendSearch}
                    onChange={(e) => setFriendSearch(e.target.value)}
                    className="input-field w-full pl-10"
                    autoFocus
                  />
                </div>
              </div>
              {friendSearch.trim() ? (() => {
                const friendIdSet = new Set(friendsList.map(f => f.uid || f.id))
                const sentToSet = new Set(sentRequests.map(r => r.to))
                const receivedFromSet = new Set(receivedRequests.map(r => r.from))
                const results = allUsers.filter(u => {
                  const q = friendSearch.toLowerCase()
                  return (u.displayName?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q))
                    && !friendIdSet.has(u.id)
                })
                return results.length === 0 ? (
                  <div className="card-steel p-8 text-center">
                    <p className="text-iron-500">No users found matching "{friendSearch}"</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {results.map(u => {
                      const isSent = sentToSet.has(u.id)
                      const isReceived = receivedFromSet.has(u.id)
                      return (
                        <div key={u.id} className="card-steel p-4 flex items-center gap-3">
                          <Link 
                            to={`/profile/${u.username || u.id}`}
                            className="w-10 h-10 rounded-full bg-iron-800 flex items-center justify-center hover:bg-iron-700 transition-colors"
                          >
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-10 h-10 rounded-full" />
                            ) : (
                              <User className="w-5 h-5 text-iron-400" />
                            )}
                          </Link>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-iron-200 truncate">{u.displayName || 'User'}</p>
                            {u.username && <p className="text-xs text-flame-400">@{u.username}</p>}
                          </div>
                          {isSent ? (
                            <span className="text-xs text-iron-500 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" /> Pending
                            </span>
                          ) : isReceived ? (
                            <button
                              onClick={() => {
                                const req = receivedRequests.find(r => r.from === u.id)
                                if (req) handleFriendsTabAction('accept', req.id)
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" /> Accept
                            </button>
                          ) : (
                            <button
                              onClick={() => handleFriendsTabAction('send', u.id)}
                              disabled={friendActionStates[u.id]}
                              className="flex items-center gap-1 px-3 py-1.5 bg-flame-500/20 text-flame-400 hover:bg-flame-500/30 rounded-lg text-sm font-medium transition-colors"
                            >
                              {friendActionStates[u.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                              Add
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })() : (
                <div className="card-steel p-8 text-center">
                  <Search className="w-12 h-12 text-iron-600 mx-auto mb-4" />
                  <p className="text-iron-500">Type a name or username to find people</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== OVERVIEW TAB ===== */}
      {(profileTab === 'overview' || !isOwnProfile) && (<>

      {/* Maxes */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Bench Press', key: 'bench', color: 'text-flame-400', value: stats.bench },
            { label: 'Squat', key: 'squat', color: 'text-purple-400', value: stats.squat },
            { label: 'Deadlift', key: 'deadlift', color: 'text-green-400', value: stats.deadlift },
            { label: 'Total', key: 'total', color: 'text-yellow-400', value: stats.total },
          ].map(lift => {
            const best = lift.key !== 'total' ? stats.bestSets?.[lift.key] : null
            const hasE1rm = best && best.e1rm && best.reps > 1
            return (
              <div key={lift.key} className="card-steel p-4 text-center relative group cursor-default">
                <p className="text-xs text-iron-500 mb-1">{lift.label}</p>
                <p className={`text-2xl font-display ${lift.color}`}>
                  {lift.value > 0 ? `${lift.value}` : '—'}
                </p>
                <p className="text-xs text-iron-600">lbs</p>
                {hasE1rm && (
                  <div className="absolute inset-0 bg-iron-900/95 rounded-xl flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                    <p className="text-[10px] text-iron-500 uppercase tracking-wider">Est. 1RM</p>
                    <p className={`text-2xl font-display ${lift.color}`}>{best.e1rm}</p>
                    <p className="text-[10px] text-iron-500">from {best.weight}×{best.reps}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <div className="card-steel mb-6 overflow-hidden">
          <button
            onClick={() => setGoalsExpanded(!goalsExpanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-iron-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-flame-500" />
              <h2 className="font-display text-lg text-iron-100">Goals</h2>
              <span className="text-xs text-iron-500 ml-1">{goals.length}</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-iron-400 transition-transform duration-200 ${goalsExpanded ? 'rotate-180' : ''}`} />
          </button>
          {goalsExpanded && (
            <div className="px-4 pb-4 space-y-3">
              {goals.map(goal => {
                const progress = goal.targetValue && goal.currentValue
                  ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
                  : 0
                const unit = goal.metricType === 'weight' ? 'lbs' : goal.metricType === 'time' ? 's' : 'reps'
                return (
                  <div key={goal.id} className="bg-iron-800/30 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-iron-200">{goal.lift}</span>
                      <span className="text-xs text-iron-500">
                        {goal.currentValue || 0}{unit} → {goal.targetValue}{unit}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-iron-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-flame-500 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-iron-500">{progress}%</span>
                      {goal.targetDate && (
                        <span className="text-[10px] text-iron-500">
                          by {format(new Date(goal.targetDate), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
              {isOwnProfile && (
                <Link
                  to="/goals"
                  className="block text-center text-xs text-flame-400 hover:text-flame-300 transition-colors pt-1"
                >
                  Manage goals →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mini Calendar */}
      <div className="card-steel p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-iron-100 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-flame-500" />
            Activity Calendar
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1 text-iron-400 hover:text-iron-200"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-iron-300 w-28 text-center">
              {format(currentMonth, 'MMM yyyy')}
            </span>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1 text-iron-400 hover:text-iron-200"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
            <div key={i} className="text-center text-xs text-iron-500 py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {getDaysInMonth().map((day, i) => {
            const dayWorkouts = getWorkoutsForDay(day)
            const strengthWorkouts = dayWorkouts.filter(w => w.workoutType !== 'cardio')
            const cardioWorkouts = dayWorkouts.filter(w => w.workoutType === 'cardio')
            const hasStrength = strengthWorkouts.length > 0
            const hasCardio = cardioWorkouts.length > 0
            const hasCompletedStrength = strengthWorkouts.some(w => w.status === 'completed')
            const hasScheduledStrength = strengthWorkouts.some(w => w.status !== 'completed')
            const goalDeadline = getGoalDeadline(day)
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isTodayDate = isToday(day)

            // Background: green for completed strength, flame for scheduled strength, none otherwise
            const bgClass = hasCompletedStrength ? 'bg-green-500/20' : hasScheduledStrength ? 'bg-flame-500/20' : ''

            return (
              <div
                key={i}
                className={`
                  relative aspect-square flex items-center justify-center text-xs rounded-md
                  ${isCurrentMonth ? 'text-iron-300' : 'text-iron-600'}
                  ${isTodayDate ? 'ring-1 ring-flame-500' : ''}
                  ${bgClass}
                `}
              >
                {format(day, 'd')}
                {/* Dots row at bottom */}
                {(hasCardio || goalDeadline) && (
                  <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5">
                    {hasCardio && (
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    )}
                    {goalDeadline && (
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-xs text-iron-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500/20" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-flame-500/20" />
            <span>Scheduled</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Cardio</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-yellow-400" />
            <span>Goal</span>
          </div>
        </div>
      </div>

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
                    <span>{item.reactionCount} reaction{item.reactionCount !== 1 ? 's' : ''}</span>
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
          View all activity
        </Link>
      </div>

      {/* Quick Links — own profile only */}
      {isOwnProfile && (
        <div className="mt-6">
          <div className="card-steel overflow-hidden divide-y divide-iron-800">
            {[
              { to: '/calendar', icon: CalendarIcon, label: 'Calendar', desc: 'Monthly view & scheduling' },
              { to: '/health', icon: Heart, label: 'Health', desc: 'Weight, sleep & body metrics' },
              { to: '/settings', icon: Settings, label: 'Settings', desc: 'Preferences & account' },
            ].map(item => (
              <Link
                key={item.to}
                to={item.to}
                state={{ from: '/profile', fromLabel: 'Back to Profile' }}
                className="flex items-center gap-4 p-4 hover:bg-iron-800/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-iron-800 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-5 h-5 text-iron-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-iron-200">{item.label}</p>
                  <p className="text-xs text-iron-500">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-iron-600" />
              </Link>
            ))}
          </div>
        </div>
      )}
      </>)}
    </div>
  )
}