import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { 
  Activity, 
  Dumbbell, 
  Target, 
  Flame, 
  MessageCircle, 
  Search,
  ChevronDown,
  ChevronRight,
  Send,
  X,
  Trophy,
  Loader2,
  User,
  Users,
  Globe,
  Trash2,
  Clock,
  Heart,
  Copy,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { feedService, notificationService } from '../services/feedService'
import { friendService } from '../services/friendService'
import { groupService, workoutService } from '../services/firestore'
import { collection, getDocs, query } from 'firebase/firestore'
import { db } from '../services/firebase'
import { formatDuration } from '../utils/workoutUtils'
import usePageTitle from '../utils/usePageTitle'

export default function FeedPage() {
  usePageTitle('Feed')
  const { user, isGuest, isAppAdmin, isRealAdmin, impersonating, realUser } = useAuth()
  const navigate = useNavigate()
  const [feedItems, setFeedItems] = useState([])
  const [users, setUsers] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastDoc, setLastDoc] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [friendSet, setFriendSet] = useState(new Set())
  const [userGroupIds, setUserGroupIds] = useState(new Set())
  const [feedFilter, setFeedFilter] = useState('all') // 'all' | 'friends' | 'mine'
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'workout' | 'cardio' | 'personal_record' | 'goal_completed'
  const [expandedItems, setExpandedItems] = useState(new Set())
  const [copying, setCopying] = useState(null)

  // Copy a workout from the feed as a new scheduled workout
  const copyWorkout = async (item) => {
    if (!user || isGuest || copying) return
    setCopying(item.id)
    try {
      const summary = item.data?.exerciseSummary || []
      if (!summary.length) {
        alert('No exercise data to copy')
        return
      }
      const exercises = summary.map(ex => ({
        name: ex.name,
        type: ex.topWeight ? 'weight' : 'bodyweight',
        sets: Array.from({ length: ex.sets || 3 }, () => ({
          prescribedWeight: ex.topWeight ? String(ex.topWeight) : '',
          prescribedReps: ex.topReps ? String(ex.topReps) : '',
          actualWeight: '',
          actualReps: '',
          rpe: '',
          painLevel: 0,
        })),
        restSeconds: 90,
        notes: '',
      }))
      const userName = users[item.userId]?.displayName || 'someone'
      const result = await workoutService.create(user.uid, {
        name: `${item.data?.name || 'Workout'} (from ${userName})`,
        exercises,
        date: new Date(),
        workoutType: 'strength',
      })
      navigate(`/workouts/${result.id}`)
    } catch (err) {
      console.error('Copy failed:', err)
      alert('Failed to copy workout')
    } finally {
      setCopying(null)
    }
  }

  // Visibility check — determines if current user can see a feed item
  const canSeeItem = (item) => {
    if (!user) return item.visibility === 'public' || !item.visibility

    if (item.userId === user.uid) return true

    const visibility = item.visibility || 'public'
    switch (visibility) {
      case 'public': return true
      case 'friends': return friendSet.has(item.userId)
      case 'group': return true // Group workouts now visible to everyone
      case 'private': return false
      default: return true
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [user?.uid])

  const loadInitialData = async () => {
    setLoading(true)
    try {
      // Mark all notifications as read when user visits feed
      if (user && !isGuest) {
        notificationService.markAllAsRead(user.uid).catch(() => {})
      }

      // Load users, friends, and groups in parallel
      const [usersSnap, friends, groups] = await Promise.all([
        getDocs(collection(db, 'users')),
        user && !isGuest ? friendService.getFriendSet(user.uid) : Promise.resolve(new Set()),
        user && !isGuest ? groupService.getByUser(user.uid) : Promise.resolve([]),
      ])

      const usersMap = {}
      usersSnap.docs.forEach(doc => {
        usersMap[doc.id] = { id: doc.id, ...doc.data() }
      })
      setUsers(usersMap)
      setFriendSet(friends)
      setUserGroupIds(new Set(groups.map(g => g.id)))
      
      // Load feed — visibility filtering happens in render via canSeeItem
      const result = await feedService.getFeed(30)
      
      setFeedItems(result.items)
      setLastDoc(result.lastDoc)
      setHasMore(result.hasMore)
    } catch (error) {
      console.error('Error loading feed:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      // Load all users for display names
      const snapshot = await getDocs(collection(db, 'users'))
      const usersMap = {}
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        usersMap[doc.id] = { id: doc.id, ...data }
      })
      setUsers(usersMap)
      return usersMap
    } catch (error) {
      console.error('Error loading users:', error)
      return {}
    }
  }

  const loadFeed = async (loadMore = false) => {
    if (loadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const result = await feedService.getFeed(30, loadMore ? lastDoc : null)
      
      if (loadMore) {
        setFeedItems(prev => [...prev, ...result.items])
      } else {
        setFeedItems(result.items)
      }
      
      setLastDoc(result.lastDoc)
      setHasMore(result.hasMore && result.items.length > 0)
    } catch (error) {
      console.error('Error loading feed:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const openComments = async (item) => {
    setSelectedItem(item)
    const commentsData = await feedService.getComments(item.id)
    setComments(commentsData)
  }

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedItem || isGuest) return
    
    setSubmittingComment(true)
    try {
      const result = await feedService.addComment(selectedItem.id, user.uid, newComment.trim(), user.displayName || '')
      if (result) {
        setComments(prev => [...prev, {
          id: result.id,
          userId: user.uid,
          text: newComment.trim(),
          createdAt: { toDate: () => new Date() }
        }])
        setNewComment('')
        
        // Update comment count in feed
        setFeedItems(prev => prev.map(i => 
          i.id === selectedItem.id 
            ? { ...i, commentCount: (i.commentCount || 0) + 1 }
            : i
        ))
      }
    } catch (error) {
      console.error('Error adding comment:', error)
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleDeleteFeedItem = async (feedId) => {
    if (!confirm('Delete this post from the feed?')) return
    try {
      await feedService.deleteFeedItem(feedId, user.uid, isAppAdmin)
      setFeedItems(prev => prev.filter(i => i.id !== feedId))
    } catch (e) {
      console.error('Error deleting feed item:', e)
    }
  }

  const getActivityIcon = (type, item) => {
    // Event workouts get a special heart icon
    if (item?.data?.eventId) {
      return <Heart className="w-5 h-5 text-pink-400 fill-pink-400" />
    }
    switch (type) {
      case 'workout':
        return <Dumbbell className="w-5 h-5 text-green-400" />
      case 'cardio':
        return <Activity className="w-5 h-5 text-orange-400" />
      case 'group_workout':
        return <Dumbbell className="w-5 h-5 text-green-400" />
      case 'goal_completed':
        return <Trophy className="w-5 h-5 text-yellow-400" />
      case 'goal_created':
        return <Target className="w-5 h-5 text-purple-400" />
      case 'personal_record':
        return <Flame className="w-5 h-5 text-flame-400" />
      default:
        return <Activity className="w-5 h-5 text-iron-400" />
    }
  }

  const getActivityText = (item) => {
    const userName = users[item.userId]?.displayName || 'Someone'
    
    switch (item.type) {
      case 'workout':
        return <><strong>{userName}</strong> completed <span className="text-flame-400">{item.data?.name || 'a workout'}</span></>
      case 'cardio':
        return <><strong>{userName}</strong> logged <span className="text-orange-400">{item.data?.duration}min of {item.data?.name || 'cardio'}</span></>
      case 'group_workout':
        return <><strong>{userName}</strong> completed <span className="text-flame-400">{item.data?.name || 'a workout'}</span>{item.data?.groupName ? <span className="text-iron-600"> · {item.data.groupName}</span> : ''}</>
      case 'goal_completed':
        return <><strong>{userName}</strong> achieved their goal: <span className="text-yellow-400">{item.data?.lift} - {item.data?.targetValue} {item.data?.unit}</span></>
      case 'goal_created':
        return <><strong>{userName}</strong> set a new goal: <span className="text-purple-400">{item.data?.lift} - {item.data?.targetValue} {item.data?.unit}</span></>
      case 'personal_record':
        return <><strong>{userName}</strong> hit a new PR: <span className="text-flame-400">{item.data?.exercise} - {item.data?.weight}lbs</span></>
      default:
        return <><strong>{userName}</strong> was active</>
    }
  }

  // Apply visibility filter, then tab filter, then search
  const visibleItems = feedItems.filter(canSeeItem)
  
  const tabFilteredItems = feedFilter === 'all' 
    ? visibleItems
    : feedFilter === 'friends'
    ? visibleItems.filter(item => friendSet.has(item.userId) || item.userId === user?.uid)
    : visibleItems.filter(item => item.userId === user?.uid) // 'mine'

  const typeFilteredItems = typeFilter === 'all'
    ? tabFilteredItems
    : typeFilter === 'workout'
    ? tabFilteredItems.filter(item => item.type === 'workout' || item.type === 'group_workout')
    : typeFilter === 'goal_completed'
    ? tabFilteredItems.filter(item => item.type === 'goal_completed' || item.type === 'goal_created')
    : tabFilteredItems.filter(item => item.type === typeFilter)

  const filteredItems = searchQuery
    ? typeFilteredItems.filter(item => {
        const userName = users[item.userId]?.displayName?.toLowerCase() || ''
        const activityName = item.data?.name?.toLowerCase() || ''
        const q = searchQuery.toLowerCase()
        return userName.includes(q) || activityName.includes(q)
      })
    : typeFilteredItems

  if (isGuest) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <Activity className="w-16 h-16 text-iron-600 mx-auto mb-4" />
        <h2 className="text-xl font-display text-iron-200 mb-2">Community Feed</h2>
        <p className="text-iron-500 mb-6">Sign in to see what others are up to and share your progress!</p>
        <Link to="/login" className="btn-primary">Sign In</Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display text-iron-100 flex items-center gap-3">
            <Activity className="w-7 h-7 text-flame-500" />
            Community Feed
          </h1>
          <p className="text-iron-500 text-sm mt-1">
            See what the community is up to
          </p>
        </div>
        {Object.keys(users).length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-iron-800/50 rounded-full border border-iron-700/50">
            <Users className="w-4 h-4 text-flame-400" />
            <span className="text-sm font-medium text-iron-300">{Object.keys(users).length}</span>
            <span className="text-xs text-iron-500">Active</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="card-steel p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500" />
          <input
            type="text"
            placeholder="Search by name or activity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field w-full pl-10"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-3">
        {[
          { key: 'all', label: 'All', icon: Globe },
          { key: 'friends', label: 'Friends', icon: Users },
          { key: 'mine', label: 'Mine', icon: User },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFeedFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              feedFilter === tab.key
                ? 'bg-flame-500/20 text-flame-400 border border-flame-500/30'
                : 'bg-iron-800/50 text-iron-400 border border-iron-700/50 hover:text-iron-200'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Type Filter */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1">
        {[
          { key: 'all', label: 'All' },
          { key: 'workout', label: 'Workouts' },
          { key: 'cardio', label: 'Cardio' },
          { key: 'personal_record', label: 'PRs' },
          { key: 'goal_completed', label: 'Goals' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTypeFilter(t.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              typeFilter === t.key
                ? 'bg-iron-700 text-iron-100'
                : 'text-iron-500 hover:text-iron-300'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="card-steel p-12 text-center">
          <Loader2 className="w-8 h-8 text-flame-500 animate-spin mx-auto" />
          <p className="text-iron-500 mt-4">Loading feed...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card-steel p-12 text-center">
          <Activity className="w-12 h-12 text-iron-600 mx-auto mb-4" />
          <p className="text-iron-500">No activity yet. Be the first to log a workout!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const itemUser = users[item.userId]
            const profileLink = `/profile/${itemUser?.username || item.userId}`
            
            return (
            <div key={item.id} className="card-steel p-4">
              {/* Header */}
              <div className="flex items-start gap-3">
                <Link 
                  to={profileLink}
                  state={{ from: '/feed', fromLabel: 'Back to Feed' }}
                  className="w-10 h-10 rounded-full bg-iron-800 flex items-center justify-center text-iron-400 hover:bg-iron-700 transition-colors"
                >
                  {itemUser?.photoURL ? (
                    <img src={itemUser.photoURL} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <User className="w-5 h-5" />
                  )}
                </Link>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getActivityIcon(item.type, item)}
                    <p className="text-sm text-iron-200">
                      {getActivityText(item)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-iron-600">
                      {item.createdAt?.toDate && formatDistanceToNow(item.createdAt.toDate(), { addSuffix: true })}
                    </p>
                    {item.visibility && item.visibility !== 'public' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        item.visibility === 'friends' ? 'bg-blue-500/10 text-blue-400' :
                        item.visibility === 'group' ? 'bg-green-500/10 text-green-400' :
                        'bg-iron-700 text-iron-500'
                      }`}>
                        {item.visibility === 'friends' ? 'Friends' : 
                         item.visibility === 'group' ? 'Group' : 'Private'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Duration estimate */}
              {(item.type === 'workout' || item.type === 'group_workout') && (() => {
                const dur = formatDuration(item.data?.totalSets, item.data?.duration)
                return dur ? (
                  <div className="mt-2 ml-[52px] flex items-center gap-1.5 text-xs text-iron-500">
                    <Clock className="w-3 h-3" />
                    {dur}
                    {item.data?.exerciseCount ? ` · ${item.data.exerciseCount} exercises` : ''}
                    {item.data?.totalSets ? ` · ${item.data.totalSets} sets` : ''}
                  </div>
                ) : item.data?.exerciseCount ? (
                  <div className="mt-2 ml-[52px] flex items-center gap-1.5 text-xs text-iron-500">
                    <Dumbbell className="w-3 h-3" />
                    {item.data.exerciseCount} exercises
                  </div>
                ) : null
              })()}

              {/* Expandable exercise summary */}
              {(item.type === 'workout' || item.type === 'group_workout') && item.data?.exerciseSummary?.length > 0 && (
                <div className="mt-2 ml-[52px]">
                  <button
                    onClick={() => setExpandedItems(prev => {
                      const next = new Set(prev)
                      next.has(item.id) ? next.delete(item.id) : next.add(item.id)
                      return next
                    })}
                    className="text-xs text-iron-500 hover:text-iron-300 transition-colors flex items-center gap-1"
                  >
                    {expandedItems.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {expandedItems.has(item.id) ? 'Hide exercises' : 'Show exercises'}
                  </button>
                  {expandedItems.has(item.id) && (
                    <div className="mt-2 space-y-1">
                      {item.data.exerciseSummary.map((ex, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-iron-800/40 rounded-lg">
                          <span className="text-xs text-iron-300">{ex.name}</span>
                          <span className="text-xs text-iron-500">
                            {ex.sets}×{ex.topWeight ? `${ex.topReps}@${ex.topWeight}lbs` : ex.topReps ? `${ex.topReps} reps` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* View full details — own workouts only */}
              {item.data?.workoutId && item.userId === user?.uid && (
                <Link 
                  to={item.type === 'group_workout' ? `/workouts/group/${item.data.workoutId}` : `/workouts/${item.data.workoutId}`}
                  className="mt-2 ml-[52px] block p-2.5 bg-iron-800/50 rounded-lg text-xs text-iron-400 hover:text-iron-200 hover:bg-iron-800 transition-colors"
                >
                  View full workout details →
                </Link>
              )}

              {/* Actions */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => openComments(item)}
                  className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 bg-iron-800 text-iron-400 hover:bg-iron-700 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  {item.commentCount > 0 ? `${item.commentCount} comment${item.commentCount !== 1 ? 's' : ''}` : 'Comment'}
                </button>
                {(item.type === 'workout' || item.type === 'group_workout') && item.data?.exerciseSummary?.length > 0 && item.userId !== user?.uid && !isGuest && (
                  <button
                    onClick={() => copyWorkout(item)}
                    disabled={copying === item.id}
                    className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 bg-iron-800 text-iron-400 hover:bg-iron-700 hover:text-flame-400 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    {copying === item.id ? 'Copying...' : 'Copy Workout'}
                  </button>
                )}
                {isAppAdmin && (
                  <button
                    onClick={() => handleDeleteFeedItem(item.id)}
                    className="ml-auto p-1.5 rounded-lg text-iron-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete post"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            )
          })}

          {/* Load More */}
          {hasMore && (
            <button
              onClick={() => loadFeed(true)}
              disabled={loadingMore}
              className="w-full py-3 text-center text-iron-400 hover:text-iron-200 transition-colors flex items-center justify-center gap-2"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Load more
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Comments Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedItem(null)}
          />
          
          <div className="relative bg-iron-900 border border-iron-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-iron-800">
              <h3 className="font-display text-lg text-iron-100">Comments</h3>
              <button 
                onClick={() => setSelectedItem(null)}
                className="text-iron-500 hover:text-iron-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Original post summary */}
            <div className="p-4 bg-iron-800/50 border-b border-iron-800">
              <div className="flex items-center gap-2 text-sm text-iron-300">
                {getActivityIcon(selectedItem.type, selectedItem)}
                {getActivityText(selectedItem)}
              </div>
            </div>
            
            {/* Comments list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {comments.length === 0 ? (
                <p className="text-center text-iron-500 py-8">No comments yet. Be the first!</p>
              ) : (
                comments.map(comment => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-iron-800 flex items-center justify-center text-iron-400 flex-shrink-0 overflow-hidden">
                      {users[comment.userId]?.photoURL ? (
                        <img src={users[comment.userId].photoURL} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="bg-iron-800 rounded-lg p-3">
                        <p className="text-xs text-iron-500 mb-1">
                          {users[comment.userId]?.displayName || 'User'}
                        </p>
                        <p className="text-sm text-iron-200">{comment.text}</p>
                      </div>
                      <p className="text-xs text-iron-600 mt-1">
                        {comment.createdAt?.toDate && formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* Add comment */}
            <div className="p-4 border-t border-iron-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  placeholder="Add a comment..."
                  className="input-field flex-1"
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || submittingComment}
                  className="btn-primary px-4"
                >
                  {submittingComment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}