import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList, User, Dumbbell, AlertTriangle, Target, Clock,
  ChevronDown, ChevronUp, Loader2, ArrowLeft, Play, CheckCircle,
  FileText, MessageCircle, Trash2, XCircle, Edit2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { trainerRequestService, trainerService, userService, creditService, CREDIT_COSTS } from '../services/firestore'
import { format } from 'date-fns'

const STATUS_STYLES = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  completed: 'bg-green-500/10 text-green-400 border-green-500/20',
  denied: 'bg-red-500/10 text-red-400 border-red-500/20',
  cancelled: 'bg-iron-800 text-iron-500 border-iron-700',
}

const STATUS_LABELS = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  denied: 'Denied',
  cancelled: 'Cancelled',
}

const TYPE_LABELS = {
  custom_workout: 'Custom Workout',
  review: 'Workout Review',
}

export default function TrainerPage() {
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRequest, setExpandedRequest] = useState(null)
  const [userSummaries, setUserSummaries] = useState({})
  const [summaryLoading, setSummaryLoading] = useState({})
  const [users, setUsers] = useState({})
  const [tab, setTab] = useState('active')
  const [claiming, setClaiming] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const isTrainer = trainerService.isTrainer(userProfile, user?.email)

  useEffect(() => {
    if (!isTrainer) return
    loadRequests()
  }, [isTrainer])

  const loadRequests = async () => {
    setLoading(true)
    try {
      const reqs = await trainerRequestService.getAll()
      setRequests(reqs)

      const userIds = [...new Set(reqs.map(r => r.userId))]
      const userMap = {}
      await Promise.all(userIds.map(async uid => {
        try {
          const u = await userService.get(uid)
          if (u) userMap[uid] = u
        } catch {}
      }))
      setUsers(userMap)
    } catch (err) {
      console.error('Error loading requests:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadUserSummary = async (userId) => {
    if (userSummaries[userId]) return
    setSummaryLoading(prev => ({ ...prev, [userId]: true }))
    try {
      const summary = await trainerRequestService.getUserSummary(userId)
      setUserSummaries(prev => ({ ...prev, [userId]: summary }))
    } catch (err) {
      console.error('Error loading user summary:', err)
    } finally {
      setSummaryLoading(prev => ({ ...prev, [userId]: false }))
    }
  }

  const handleClaim = async (requestId) => {
    setClaiming(requestId)
    try {
      await trainerRequestService.claim(requestId, user.uid)
      await loadRequests()
    } catch (err) {
      console.error('Error claiming request:', err)
    } finally {
      setClaiming(null)
    }
  }

  const handleDeny = async (req) => {
    try {
      await trainerRequestService.deny(req.id, '')
      const cost = req.type === 'custom_workout'
        ? CREDIT_COSTS['trainer-custom-workout']
        : CREDIT_COSTS['trainer-review']
      await creditService.add(req.userId, cost)
      await loadRequests()
    } catch (err) {
      console.error('Error denying request:', err)
    }
  }

  const handleDelete = async (requestId) => {
    if (pendingDeleteId !== requestId) {
      setPendingDeleteId(requestId)
      return
    }
    try {
      await trainerRequestService.delete(requestId)
      setRequests(prev => prev.filter(r => r.id !== requestId))
      setPendingDeleteId(null)
    } catch (err) {
      console.error('Error deleting request:', err)
      setPendingDeleteId(null)
    }
  }

  const toggleExpanded = (requestId, userId) => {
    if (expandedRequest === requestId) {
      setExpandedRequest(null)
    } else {
      setExpandedRequest(requestId)
      loadUserSummary(userId)
    }
  }

  if (!isTrainer) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <ClipboardList className="w-12 h-12 text-iron-600 mx-auto mb-4" />
        <h2 className="text-xl font-display text-iron-200 mb-2">Trainer Access Required</h2>
        <p className="text-iron-500 mb-6">You need to be an approved trainer to access this page. Apply in Settings.</p>
        <button onClick={() => navigate('/settings')} className="btn-primary px-6 py-2">
          Go to Settings
        </button>
      </div>
    )
  }

  const activeRequests = requests.filter(r => ['pending', 'in_progress'].includes(r.status))
  const closedRequests = requests.filter(r => ['completed', 'denied', 'cancelled'].includes(r.status))
  const displayed = tab === 'active' ? activeRequests : closedRequests

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-iron-400 hover:text-iron-100 hover:bg-iron-800 rounded-plate transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-display text-display-md text-iron-50">Trainer Dashboard</h1>
          <p className="text-iron-400">Manage workout requests from users</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('active')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
            tab === 'active' ? 'bg-flame-500 text-white' : 'bg-iron-800 text-iron-400 hover:text-iron-200'
          }`}
        >
          Active
          {activeRequests.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              tab === 'active' ? 'bg-white/20' : 'bg-flame-500/20 text-flame-400'
            }`}>{activeRequests.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('completed')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
            tab === 'completed' ? 'bg-green-500 text-white' : 'bg-iron-800 text-iron-400 hover:text-iron-200'
          }`}
        >
          Completed
          {closedRequests.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              tab === 'completed' ? 'bg-white/20' : 'bg-iron-700'
            }`}>{closedRequests.length}</span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-flame-400" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="card-steel p-12 text-center">
          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-iron-200 mb-1">
            {tab === 'active' ? 'All caught up' : 'No completed requests yet'}
          </h3>
          <p className="text-iron-500">
            {tab === 'active' ? 'No pending requests right now.' : 'Completed and denied requests will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed
            .sort((a, b) => {
              const dA = a.createdAt?.toDate?.() || new Date(0)
              const dB = b.createdAt?.toDate?.() || new Date(0)
              return dB - dA
            })
            .map(req => {
              const reqUser = users[req.userId]
              const isExpanded = expandedRequest === req.id
              const summary = userSummaries[req.userId]
              const isSummaryLoading = summaryLoading[req.userId]
              const hasLinkedWorkout = !!req.workoutId

              return (
                <div key={req.id} className="card-steel rounded-xl overflow-hidden">
                  {/* Header */}
                  <button
                    onClick={() => toggleExpanded(req.id, req.userId)}
                    className="w-full p-4 flex items-center gap-3 hover:bg-iron-800/30 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-iron-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {reqUser?.photoURL ? (
                        <img src={reqUser.photoURL} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-iron-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-iron-100 truncate">
                          {reqUser?.displayName || 'User'}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[req.status]}`}>
                          {STATUS_LABELS[req.status]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-iron-500">
                        <span className={req.type === 'custom_workout' ? 'text-flame-400' : 'text-purple-400'}>
                          {TYPE_LABELS[req.type]}
                        </span>
                        {req.createdAt?.toDate && (
                          <span>{format(req.createdAt?.toDate?.(), 'MMM d, h:mm a')}</span>
                        )}
                        {req.targetDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Due {req.targetDate}
                          </span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-iron-500" /> : <ChevronDown className="w-5 h-5 text-iron-500" />}
                  </button>

                  {/* Expanded */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 space-y-4 border-t border-iron-800">
                          {/* Notes */}
                          {req.notes && (
                            <div className="mt-4 p-3 bg-iron-800/50 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <MessageCircle className="w-3.5 h-3.5 text-iron-400" />
                                <span className="text-xs font-medium text-iron-400">User Notes</span>
                              </div>
                              <p className="text-sm text-iron-200">{req.notes}</p>
                            </div>
                          )}

                          {/* Linked workout button */}
                          {hasLinkedWorkout && (
                            <button
                              onClick={() => navigate(`/workouts/${req.workoutId}/edit`)}
                              className="mt-4 w-full p-3 bg-flame-500/10 border border-flame-500/20 rounded-lg
                                text-sm text-flame-300 hover:bg-flame-500/20 transition-colors flex items-center gap-2"
                            >
                              <Edit2 className="w-4 h-4" />
                              Edit Linked Workout
                            </button>
                          )}

                          {/* Review workout (not linked) */}
                          {req.type === 'review' && req.workoutId && !hasLinkedWorkout && (
                            <button
                              onClick={() => navigate(`/workouts/${req.workoutId}/edit`)}
                              className="mt-4 w-full p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg
                                text-sm text-purple-300 hover:bg-purple-500/20 transition-colors flex items-center gap-2"
                            >
                              <FileText className="w-4 h-4" />
                              Open Workout to Review
                            </button>
                          )}

                          {/* Athlete Summary — active only */}
                          {['pending', 'in_progress'].includes(req.status) && (
                            <div className="mt-2">
                              <h4 className="text-xs font-medium text-iron-400 uppercase tracking-wider mb-3">Athlete Summary</h4>
                              {isSummaryLoading ? (
                                <div className="flex items-center gap-2 text-xs text-iron-500 py-4">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Loading athlete data...
                                </div>
                              ) : summary ? (
                                <div className="space-y-3">
                                  <div className="flex flex-wrap gap-3 text-xs text-iron-400">
                                    {summary.profile?.weight && <span>Weight: {summary.profile.weight}lbs</span>}
                                    {summary.profile?.height && <span>Height: {summary.profile.height}</span>}
                                    {summary.profile?.age && <span>Age: {summary.profile.age}</span>}
                                    {summary.profile?.activityLevel && <span>{summary.profile.activityLevel}</span>}
                                  </div>
                                  {Object.keys(summary.maxLifts || {}).length > 0 && (
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <Dumbbell className="w-3.5 h-3.5 text-flame-400" />
                                        <span className="text-xs font-medium text-iron-300">Top Lifts</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        {Object.entries(summary.maxLifts).sort((a, b) => b[1].e1rm - a[1].e1rm).slice(0, 6).map(([name, d]) => (
                                          <div key={name} className="text-xs px-2 py-1.5 bg-iron-800/50 rounded">
                                            <span className="text-iron-300">{name}</span>
                                            <span className="text-iron-500 ml-1">{d.e1rm}lb e1RM</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {Object.keys(summary.painHistory || {}).length > 0 && (
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                        <span className="text-xs font-medium text-iron-300">Pain Areas</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {Object.entries(summary.painHistory).map(([name, d]) => (
                                          <span key={name} className="text-xs px-2 py-1 bg-red-500/10 text-red-300 rounded">
                                            {name}: {d.maxPain}/10 ({d.count}x)
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {summary.goals?.length > 0 && (
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <Target className="w-3.5 h-3.5 text-green-400" />
                                        <span className="text-xs font-medium text-iron-300">Active Goals</span>
                                      </div>
                                      <div className="space-y-1">
                                        {summary.goals.map((g, i) => (
                                          <div key={i} className="text-xs text-iron-400">
                                            {g.lift || g.metricType}: {g.currentWeight || '?'} → {g.targetWeight || '?'}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {summary.recentWorkouts?.length > 0 && (
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
                                        <span className="text-xs font-medium text-iron-300">Recent Sessions</span>
                                      </div>
                                      <div className="space-y-1.5">
                                        {summary.recentWorkouts.slice(0, 3).map((w, i) => (
                                          <div key={i} className="text-xs p-2 bg-iron-800/50 rounded">
                                            <div className="flex justify-between mb-0.5">
                                              <span className="text-iron-200 font-medium">{w.name}</span>
                                              <span className="text-iron-500">{w.date}</span>
                                            </div>
                                            <div className="text-iron-500">{w.exercises?.map(e => e.name).join(', ')}</div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-iron-600">No data available</p>
                              )}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2 pt-2">
                            {req.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleClaim(req.id)}
                                  disabled={claiming === req.id}
                                  className="flex-1 py-2.5 bg-flame-500 hover:bg-flame-400 text-white rounded-lg
                                    text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                >
                                  {claiming === req.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                  Claim
                                </button>
                                <button
                                  onClick={() => handleDeny(req)}
                                  className="py-2.5 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg
                                    text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                                >
                                  <XCircle className="w-4 h-4" /> Deny
                                </button>
                              </>
                            )}
                            {req.status === 'in_progress' && req.trainerId === user?.uid && (
                              <>
                                {req.type === 'custom_workout' && (
                                  <button
                                    onClick={() => {
                                      if (hasLinkedWorkout) {
                                        navigate(`/workouts/${req.workoutId}/edit`)
                                      } else {
                                        const params = new URLSearchParams({ userId: req.userId, requestId: req.id })
                                        if (req.targetDate) params.set('date', req.targetDate)
                                        navigate(`/workouts/new?${params.toString()}`)
                                      }
                                    }}
                                    className="flex-1 py-2.5 bg-flame-500 hover:bg-flame-400 text-white rounded-lg
                                      text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                                  >
                                    {hasLinkedWorkout ? <><Edit2 className="w-4 h-4" /> Edit Workout</> : <><Dumbbell className="w-4 h-4" /> Create Workout</>}
                                  </button>
                                )}
                                {req.type === 'review' && req.workoutId && (
                                  <button
                                    onClick={() => navigate(`/workouts/${req.workoutId}/edit`)}
                                    className="flex-1 py-2.5 bg-purple-500 hover:bg-purple-400 text-white rounded-lg
                                      text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                                  >
                                    <FileText className="w-4 h-4" /> Review Workout
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeny(req)}
                                  className="py-2.5 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg
                                    text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                                >
                                  <XCircle className="w-4 h-4" /> Deny
                                </button>
                              </>
                            )}
                            {['completed', 'denied', 'cancelled'].includes(req.status) && (
                              <>
                                <button
                                  onClick={() => handleDelete(req.id)}
                                  className={`py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                                    pendingDeleteId === req.id
                                      ? 'bg-red-500 hover:bg-red-600 text-white flex-1'
                                      : 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                                  }`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  {pendingDeleteId === req.id ? 'Tap to confirm' : 'Delete'}
                                </button>
                                {pendingDeleteId === req.id && (
                                  <button
                                    onClick={() => setPendingDeleteId(null)}
                                    className="py-2.5 px-4 bg-iron-800 hover:bg-iron-700 text-iron-400 rounded-lg text-sm font-medium transition-colors"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}