import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { 
  Activity, 
  Dumbbell, 
  Target, 
  Flame, 
  MessageCircle, 
  Search,
  ChevronDown,
  Send,
  X,
  Trophy,
  Loader2,
  User,
  Lock
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { feedService, REACTIONS, FEED_TYPES } from '../services/feedService'
import { ACTIVITY_METS } from '../services/calorieService'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../services/firebase'

export default function FeedPage() {
  const { user, isGuest } = useAuth()
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

  useEffect(() => {
    loadFeed()
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      // Load all users for display names
      const snapshot = await getDocs(collection(db, 'users'))
      const usersMap = {}
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        // Only include non-private users
        if (!data.isPrivate) {
          usersMap[doc.id] = { id: doc.id, ...data }
        }
      })
      setUsers(usersMap)
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }

  const loadFeed = async (loadMore = false) => {
    if (loadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const result = await feedService.getFeed(15, loadMore ? lastDoc : null)
      
      // Filter out items from private users
      const publicItems = result.items.filter(item => users[item.userId] || !users[item.userId]?.isPrivate)
      
      if (loadMore) {
        setFeedItems(prev => [...prev, ...publicItems])
      } else {
        setFeedItems(publicItems)
      }
      
      setLastDoc(result.lastDoc)
      setHasMore(result.hasMore)
    } catch (error) {
      console.error('Error loading feed:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleReaction = async (itemId, emoji) => {
    if (!user || isGuest) return
    
    const item = feedItems.find(i => i.id === itemId)
    const hasReacted = item?.reactions?.[emoji]?.includes(user.uid)
    
    if (hasReacted) {
      await feedService.removeReaction(itemId, user.uid, emoji)
    } else {
      await feedService.addReaction(itemId, user.uid, emoji)
    }
    
    // Update local state
    setFeedItems(prev => prev.map(i => {
      if (i.id !== itemId) return i
      
      const reactions = { ...i.reactions }
      if (hasReacted) {
        reactions[emoji] = (reactions[emoji] || []).filter(id => id !== user.uid)
      } else {
        reactions[emoji] = [...(reactions[emoji] || []), user.uid]
      }
      
      return { 
        ...i, 
        reactions,
        reactionCount: hasReacted ? i.reactionCount - 1 : i.reactionCount + 1
      }
    }))
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
      const result = await feedService.addComment(selectedItem.id, user.uid, newComment.trim())
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

  const getActivityIcon = (type) => {
    switch (type) {
      case FEED_TYPES.WORKOUT_COMPLETED:
        return <Dumbbell className="w-5 h-5 text-green-400" />
      case FEED_TYPES.CARDIO_LOGGED:
        return <Activity className="w-5 h-5 text-orange-400" />
      case FEED_TYPES.GOAL_COMPLETED:
        return <Trophy className="w-5 h-5 text-yellow-400" />
      case FEED_TYPES.GOAL_CREATED:
        return <Target className="w-5 h-5 text-purple-400" />
      case FEED_TYPES.PR:
        return <Flame className="w-5 h-5 text-flame-400" />
      default:
        return <Activity className="w-5 h-5 text-iron-400" />
    }
  }

  const getActivityText = (item) => {
    const userName = users[item.userId]?.displayName || 'Someone'
    
    switch (item.type) {
      case FEED_TYPES.WORKOUT_COMPLETED:
        return <><strong>{userName}</strong> completed a workout: <span className="text-flame-400">{item.data?.name || 'Workout'}</span></>
      case FEED_TYPES.CARDIO_LOGGED:
        return <><strong>{userName}</strong> logged <span className="text-orange-400">{item.data?.duration}min of {item.data?.name || 'cardio'}</span></>
      case FEED_TYPES.GOAL_COMPLETED:
        return <><strong>{userName}</strong> achieved their goal: <span className="text-yellow-400">{item.data?.lift} - {item.data?.targetValue} {item.data?.unit}</span> 🎉</>
      case FEED_TYPES.GOAL_CREATED:
        return <><strong>{userName}</strong> set a new goal: <span className="text-purple-400">{item.data?.lift} - {item.data?.targetValue} {item.data?.unit}</span></>
      case FEED_TYPES.PR:
        return <><strong>{userName}</strong> hit a new PR: <span className="text-flame-400">{item.data?.exercise} - {item.data?.weight}lbs</span> 🔥</>
      default:
        return <><strong>{userName}</strong> did something awesome</>
    }
  }

  const filteredItems = searchQuery
    ? feedItems.filter(item => {
        const userName = users[item.userId]?.displayName?.toLowerCase() || ''
        const activityName = item.data?.name?.toLowerCase() || ''
        const query = searchQuery.toLowerCase()
        return userName.includes(query) || activityName.includes(query)
      })
    : feedItems

  if (isGuest) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <Activity className="w-16 h-16 text-iron-600 mx-auto mb-4" />
        <h2 className="text-xl font-display text-iron-200 mb-2">Activity Feed</h2>
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
            Activity Feed
          </h1>
          <p className="text-iron-500 text-sm mt-1">
            See what the community is up to
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="card-steel p-4 mb-6">
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
                    {getActivityIcon(item.type)}
                    <p className="text-sm text-iron-200">
                      {getActivityText(item)}
                    </p>
                  </div>
                  <p className="text-xs text-iron-600 mt-1">
                    {item.createdAt?.toDate && formatDistanceToNow(item.createdAt.toDate(), { addSuffix: true })}
                  </p>
                </div>
              </div>

              {/* Workout/Activity Details Link */}
              {item.data?.workoutId && (
                <Link 
                  to={`/workouts/${item.data.workoutId}`}
                  className="mt-3 block p-3 bg-iron-800/50 rounded-lg text-sm text-iron-400 hover:text-iron-200 hover:bg-iron-800 transition-colors"
                >
                  View {item.type === FEED_TYPES.CARDIO_LOGGED ? 'activity' : 'workout'} details →
                </Link>
              )}

              {/* Reactions */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {REACTIONS.map(emoji => {
                  const count = item.reactions?.[emoji]?.length || 0
                  const hasReacted = item.reactions?.[emoji]?.includes(user?.uid)
                  
                  return (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(item.id, emoji)}
                      className={`px-2 py-1 rounded-full text-sm flex items-center gap-1 transition-colors ${
                        hasReacted 
                          ? 'bg-flame-500/20 text-flame-400' 
                          : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                      }`}
                    >
                      <span>{emoji}</span>
                      {count > 0 && <span className="text-xs">{count}</span>}
                    </button>
                  )
                })}
                
                {/* Comment button */}
                <button
                  onClick={() => openComments(item)}
                  className="px-2 py-1 rounded-full text-sm flex items-center gap-1 bg-iron-800 text-iron-400 hover:bg-iron-700 transition-colors ml-auto"
                >
                  <MessageCircle className="w-4 h-4" />
                  {item.commentCount > 0 && <span className="text-xs">{item.commentCount}</span>}
                </button>
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
                {getActivityIcon(selectedItem.type)}
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
                    <div className="w-8 h-8 rounded-full bg-iron-800 flex items-center justify-center text-iron-400 flex-shrink-0">
                      {users[comment.userId]?.displayName?.[0] || '?'}
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