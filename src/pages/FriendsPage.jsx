import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  Check, 
  X, 
  Loader2, 
  Search,
  Clock,
  ArrowLeft,
  User,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { friendService, FRIEND_STATUS } from '../services/friendService'
import { userService } from '../services/firestore'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../services/firebase'

export default function FriendsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('friends') // 'friends' | 'requests' | 'find'
  const [friends, setFriends] = useState([])
  const [receivedRequests, setReceivedRequests] = useState([])
  const [sentRequests, setSentRequests] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({}) // { [userId]: true }
  const [usersMap, setUsersMap] = useState({})

  useEffect(() => {
    if (user) loadData()
  }, [user])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load all users for display names
      const usersSnap = await getDocs(collection(db, 'users'))
      const uMap = {}
      const uList = []
      usersSnap.docs.forEach(doc => {
        const data = { id: doc.id, uid: doc.id, ...doc.data() }
        uMap[doc.id] = data
        if (doc.id !== user.uid) uList.push(data)
      })
      setUsersMap(uMap)
      setAllUsers(uList)

      // Load friends, received requests, sent requests in parallel
      const [friendIds, received, sent] = await Promise.all([
        friendService.getFriends(user.uid),
        friendService.getReceivedRequests(user.uid),
        friendService.getSentRequests(user.uid),
      ])

      setFriends(friendIds.map(id => uMap[id]).filter(Boolean))
      setReceivedRequests(received)
      setSentRequests(sent)
    } catch (error) {
      console.error('Error loading friends data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async (requestId) => {
    setActionLoading(prev => ({ ...prev, [requestId]: true }))
    try {
      await friendService.acceptRequest(requestId)
      await loadData()
    } catch (e) {
      console.error('Accept error:', e)
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }))
    }
  }

  const handleDecline = async (requestId) => {
    setActionLoading(prev => ({ ...prev, [requestId]: true }))
    try {
      await friendService.declineRequest(requestId)
      setReceivedRequests(prev => prev.filter(r => r.id !== requestId))
    } catch (e) {
      console.error('Decline error:', e)
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }))
    }
  }

  const handleCancelSent = async (requestId) => {
    setActionLoading(prev => ({ ...prev, [requestId]: true }))
    try {
      await friendService.cancelRequest(requestId)
      setSentRequests(prev => prev.filter(r => r.id !== requestId))
    } catch (e) {
      console.error('Cancel error:', e)
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }))
    }
  }

  const handleRemoveFriend = async (friendId) => {
    if (!confirm('Remove this friend?')) return
    setActionLoading(prev => ({ ...prev, [friendId]: true }))
    try {
      await friendService.removeFriend(user.uid, friendId)
      setFriends(prev => prev.filter(f => f.uid !== friendId && f.id !== friendId))
    } catch (e) {
      console.error('Remove error:', e)
    } finally {
      setActionLoading(prev => ({ ...prev, [friendId]: false }))
    }
  }

  const handleSendRequest = async (toUserId) => {
    setActionLoading(prev => ({ ...prev, [toUserId]: true }))
    try {
      await friendService.sendRequest(user.uid, toUserId)
      // Reload to update sent requests
      const sent = await friendService.getSentRequests(user.uid)
      setSentRequests(sent)
    } catch (e) {
      console.error('Send request error:', e)
      alert(e.message)
    } finally {
      setActionLoading(prev => ({ ...prev, [toUserId]: false }))
    }
  }

  // Build sets for quick lookup in "Find" tab
  const friendIdSet = new Set(friends.map(f => f.uid || f.id))
  const sentToSet = new Set(sentRequests.map(r => r.to))
  const receivedFromSet = new Set(receivedRequests.map(r => r.from))

  const filteredFindUsers = searchQuery.trim()
    ? allUsers.filter(u => {
        const q = searchQuery.toLowerCase()
        return (u.displayName?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q))
          && !friendIdSet.has(u.id)
      })
    : []

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <Loader2 className="w-8 h-8 text-flame-500 animate-spin mx-auto" />
        <p className="text-iron-500 mt-4">Loading friends...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/feed" className="text-iron-400 hover:text-iron-200">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-display text-iron-100 flex items-center gap-3">
            <Users className="w-7 h-7 text-flame-500" />
            Friends
          </h1>
          <p className="text-iron-500 text-sm mt-1">
            {friends.length} friend{friends.length !== 1 ? 's' : ''}
            {receivedRequests.length > 0 && (
              <> · <span className="text-flame-400">{receivedRequests.length} pending request{receivedRequests.length !== 1 ? 's' : ''}</span></>
            )}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'friends', label: 'Friends', icon: Users, count: friends.length },
          { key: 'requests', label: 'Requests', icon: Clock, count: receivedRequests.length + sentRequests.length },
          { key: 'find', label: 'Find People', icon: Search },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-flame-500/20 text-flame-400 border border-flame-500/30'
                : 'bg-iron-800/50 text-iron-400 border border-iron-700/50 hover:text-iron-200'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 rounded-full ${
                tab === t.key ? 'bg-flame-500/30' : 'bg-iron-700'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Friends List */}
      {tab === 'friends' && (
        <div className="space-y-2">
          {friends.length === 0 ? (
            <div className="card-steel p-12 text-center">
              <Users className="w-12 h-12 text-iron-600 mx-auto mb-4" />
              <p className="text-iron-500 mb-2">No friends yet</p>
              <button onClick={() => setTab('find')} className="text-sm text-flame-400 hover:text-flame-300">
                Find people to add
              </button>
            </div>
          ) : friends.map(friend => (
            <div key={friend.uid || friend.id} className="card-steel p-4 flex items-center gap-3">
              <Link 
                to={`/profile/${friend.username || friend.uid || friend.id}`}
                className="w-10 h-10 rounded-full bg-iron-800 flex items-center justify-center hover:bg-iron-700 transition-colors"
              >
                {friend.photoURL ? (
                  <img src={friend.photoURL} alt="" className="w-10 h-10 rounded-full" />
                ) : (
                  <User className="w-5 h-5 text-iron-400" />
                )}
              </Link>
              <Link 
                to={`/profile/${friend.username || friend.uid || friend.id}`}
                className="flex-1 min-w-0"
              >
                <p className="font-medium text-iron-200 truncate">{friend.displayName || 'User'}</p>
                {friend.username && <p className="text-xs text-flame-400">@{friend.username}</p>}
              </Link>
              <button
                onClick={() => handleRemoveFriend(friend.uid || friend.id)}
                disabled={actionLoading[friend.uid || friend.id]}
                className="p-2 text-iron-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Remove friend"
              >
                {actionLoading[friend.uid || friend.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Requests Tab */}
      {tab === 'requests' && (
        <div className="space-y-4">
          {/* Received */}
          {receivedRequests.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-iron-400 mb-2">Received</h3>
              <div className="space-y-2">
                {receivedRequests.map(req => {
                  const fromUser = usersMap[req.from]
                  return (
                    <div key={req.id} className="card-steel p-4 flex items-center gap-3">
                      <Link 
                        to={`/profile/${fromUser?.username || req.from}`}
                        className="w-10 h-10 rounded-full bg-iron-800 flex items-center justify-center hover:bg-iron-700 transition-colors"
                      >
                        {fromUser?.photoURL ? (
                          <img src={fromUser.photoURL} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <User className="w-5 h-5 text-iron-400" />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-iron-200 truncate">{fromUser?.displayName || 'User'}</p>
                        {fromUser?.username && <p className="text-xs text-flame-400">@{fromUser.username}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAccept(req.id)}
                          disabled={actionLoading[req.id]}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors"
                        >
                          {actionLoading[req.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Accept
                        </button>
                        <button
                          onClick={() => handleDecline(req.id)}
                          disabled={actionLoading[req.id]}
                          className="p-1.5 text-iron-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Sent */}
          {sentRequests.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-iron-400 mb-2">Sent</h3>
              <div className="space-y-2">
                {sentRequests.map(req => {
                  const toUser = usersMap[req.to]
                  return (
                    <div key={req.id} className="card-steel p-4 flex items-center gap-3">
                      <Link 
                        to={`/profile/${toUser?.username || req.to}`}
                        className="w-10 h-10 rounded-full bg-iron-800 flex items-center justify-center hover:bg-iron-700 transition-colors"
                      >
                        {toUser?.photoURL ? (
                          <img src={toUser.photoURL} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <User className="w-5 h-5 text-iron-400" />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-iron-200 truncate">{toUser?.displayName || 'User'}</p>
                        {toUser?.username && <p className="text-xs text-flame-400">@{toUser.username}</p>}
                      </div>
                      <button
                        onClick={() => handleCancelSent(req.id)}
                        disabled={actionLoading[req.id]}
                        className="flex items-center gap-1 px-3 py-1.5 bg-iron-700 text-iron-300 hover:bg-iron-600 rounded-lg text-sm font-medium transition-colors"
                      >
                        {actionLoading[req.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        Cancel
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {receivedRequests.length === 0 && sentRequests.length === 0 && (
            <div className="card-steel p-12 text-center">
              <Clock className="w-12 h-12 text-iron-600 mx-auto mb-4" />
              <p className="text-iron-500">No pending requests</p>
            </div>
          )}
        </div>
      )}

      {/* Find People Tab */}
      {tab === 'find' && (
        <div>
          <div className="card-steel p-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500" />
              <input
                type="text"
                placeholder="Search by name or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field w-full pl-10"
                autoFocus
              />
            </div>
          </div>

          {searchQuery.trim() ? (
            <div className="space-y-2">
              {filteredFindUsers.length === 0 ? (
                <div className="card-steel p-8 text-center">
                  <p className="text-iron-500">No users found matching "{searchQuery}"</p>
                </div>
              ) : filteredFindUsers.map(u => {
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
                          if (req) handleAccept(req.id)
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" /> Accept
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSendRequest(u.id)}
                        disabled={actionLoading[u.id]}
                        className="flex items-center gap-1 px-3 py-1.5 bg-flame-500/20 text-flame-400 hover:bg-flame-500/30 rounded-lg text-sm font-medium transition-colors"
                      >
                        {actionLoading[u.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                        Add
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="card-steel p-8 text-center">
              <Search className="w-12 h-12 text-iron-600 mx-auto mb-4" />
              <p className="text-iron-500">Type a name or username to find people</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
