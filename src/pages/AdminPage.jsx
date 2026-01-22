import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Users, 
  Search, 
  ChevronDown, 
  Target, 
  Dumbbell, 
  Calendar,
  Plus,
  X,
  Check,
  Eye,
  UserCog,
  Edit2,
  Trash2,
  Activity,
  TrendingUp
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../services/firebase'
import { workoutService, goalService } from '../services/firestore'
import { analyticsService } from '../services/analyticsService'
import { format, formatDistanceToNow } from 'date-fns'

const ADMIN_EMAILS = ['charltonuw@gmail.com']

export default function AdminPage() {
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [impersonating, setImpersonating] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [userWorkouts, setUserWorkouts] = useState([])
  const [userGoals, setUserGoals] = useState([])
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [showWorkoutModal, setShowWorkoutModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [activeTab, setActiveTab] = useState('users') // 'users' or 'activity'
  const [activityData, setActivityData] = useState(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [goalForm, setGoalForm] = useState({
    lift: '',
    metricType: 'weight',
    currentValue: '',
    targetValue: '',
    targetDate: '',
    notes: ''
  })

  const COMMON_LIFTS = [
    'Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row',
    'Pull-ups', 'Incline Bench', 'Romanian Deadlift', 'Front Squat', 'Close Grip Bench',
    'Dead Hang', 'Plank', 'Dips', 'Chin-ups'
  ]

  const METRIC_LABELS = {
    weight: { label: 'Weight', unit: 'lbs' },
    reps: { label: 'Reps', unit: 'reps' },
    time: { label: 'Time', unit: 'seconds' }
  }

  // Check if current user is admin
  const isAdmin = user && ADMIN_EMAILS.includes(user.email)

  useEffect(() => {
    if (!isAdmin) {
      navigate('/dashboard')
      return
    }
    loadUsers()
  }, [isAdmin, navigate])

  const loadUsers = async () => {
    try {
      const q = query(collection(db, 'users'), orderBy('displayName'))
      const snapshot = await getDocs(q)
      const userData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setUsers(userData)
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectUser = async (selectedUserData) => {
    setSelectedUser(selectedUserData)
    setImpersonating(selectedUserData)
    
    // Load user's workouts and goals
    try {
      const [workouts, goals] = await Promise.all([
        workoutService.getByUser(selectedUserData.uid, 20),
        goalService.getByUser(selectedUserData.uid)
      ])
      setUserWorkouts(workouts)
      setUserGoals(goals)
    } catch (error) {
      console.error('Error loading user data:', error)
    }
  }

  const loadActivityData = async () => {
    setActivityLoading(true)
    try {
      const data = await analyticsService.getActivitySummary(7)
      setActivityData(data)
    } catch (error) {
      console.error('Error loading activity:', error)
    } finally {
      setActivityLoading(false)
    }
  }

  // Load activity when tab changes
  useEffect(() => {
    if (activeTab === 'activity' && !activityData) {
      loadActivityData()
    }
  }, [activeTab])

  const handleCreateGoal = async (e) => {
    e.preventDefault()
    if (!impersonating) return

    try {
      const currentVal = parseInt(goalForm.currentValue) || 0
      const goalData = {
        lift: goalForm.lift,
        metricType: goalForm.metricType,
        currentValue: currentVal,
        startValue: currentVal,
        targetValue: parseInt(goalForm.targetValue),
        currentWeight: goalForm.metricType === 'weight' ? currentVal : undefined,
        startWeight: goalForm.metricType === 'weight' ? currentVal : undefined,
        targetWeight: goalForm.metricType === 'weight' ? parseInt(goalForm.targetValue) : undefined,
        targetDate: goalForm.targetDate,
        notes: goalForm.notes,
        status: 'active'
      }

      if (editingGoal) {
        await goalService.update(editingGoal.id, goalData)
        setUserGoals(prev => prev.map(g => g.id === editingGoal.id ? { ...g, ...goalData } : g))
      } else {
        const newGoal = await goalService.create(impersonating.uid, goalData)
        setUserGoals(prev => [...prev, { ...newGoal, ...goalData }])
      }
      setShowGoalModal(false)
      setEditingGoal(null)
      setGoalForm({
        lift: '',
        metricType: 'weight',
        currentValue: '',
        targetValue: '',
        targetDate: '',
        notes: ''
      })
    } catch (error) {
      console.error('Error saving goal:', error)
      alert('Failed to save goal')
    }
  }

  const handleDeleteGoal = async (goalId) => {
    if (!confirm('Delete this goal?')) return
    try {
      await goalService.delete(goalId)
      setUserGoals(prev => prev.filter(g => g.id !== goalId))
    } catch (error) {
      console.error('Error deleting goal:', error)
      alert('Failed to delete goal')
    }
  }

  const handleDeleteWorkout = async (workoutId) => {
    if (!confirm('Delete this workout?')) return
    try {
      await workoutService.delete(workoutId)
      setUserWorkouts(prev => prev.filter(w => w.id !== workoutId))
    } catch (error) {
      console.error('Error deleting workout:', error)
      alert('Failed to delete workout')
    }
  }

  const handleEditGoal = (goal) => {
    setEditingGoal(goal)
    setGoalForm({
      lift: goal.lift,
      metricType: goal.metricType || 'weight',
      currentValue: (goal.currentValue ?? goal.currentWeight ?? '').toString(),
      targetValue: (goal.targetValue ?? goal.targetWeight ?? '').toString(),
      targetDate: goal.targetDate || '',
      notes: goal.notes || ''
    })
    setShowGoalModal(true)
  }

  const filteredUsers = users.filter(u => 
    u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (!isAdmin) {
    return null
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display text-iron-100 flex items-center gap-3">
            <UserCog className="w-7 h-7 text-flame-500" />
            Admin Panel
          </h1>
          <p className="text-iron-500 text-sm mt-1">
            Manage users, create workouts and goals
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="card-steel p-1 mb-6 flex gap-1 max-w-xs">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm transition-colors ${
            activeTab === 'users'
              ? 'bg-flame-500 text-white'
              : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Users
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm transition-colors ${
            activeTab === 'activity'
              ? 'bg-flame-500 text-white'
              : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          Activity
        </button>
      </div>

      {/* Impersonation Banner */}
      {impersonating && (
        <div className="mb-6 p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-purple-400" />
            <span className="text-purple-200">
              Viewing as: <strong>{impersonating.displayName || impersonating.email}</strong>
            </span>
          </div>
          <button
            onClick={() => {
              setImpersonating(null)
              setSelectedUser(null)
              setUserWorkouts([])
              setUserGoals([])
            }}
            className="text-purple-400 hover:text-purple-300 text-sm"
          >
            Clear Selection
          </button>
        </div>
      )}

      {activeTab === 'users' ? (
      <>
      <div className="grid lg:grid-cols-3 gap-6">
        {/* User List */}
        <div className="card-steel rounded-xl">
          <div className="p-4 border-b border-iron-800">
            <h2 className="font-display text-lg text-iron-100 mb-3">Users</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field w-full pl-10"
              />
            </div>
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : filteredUsers.length > 0 ? (
              <div className="divide-y divide-iron-800">
                {filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className={`w-full p-4 text-left hover:bg-iron-800/50 transition-colors flex items-center gap-3
                      ${selectedUser?.id === u.id ? 'bg-flame-500/10 border-l-2 border-l-flame-500' : ''}`}
                  >
                    <img
                      src={u.photoURL || '/default-avatar.png'}
                      alt={u.displayName}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-iron-100 truncate">
                        {u.displayName || 'No Name'}
                      </p>
                      <p className="text-sm text-iron-500 truncate">{u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-iron-500">
                No users found
              </div>
            )}
          </div>
        </div>

        {/* User Details */}
        <div className="lg:col-span-2 space-y-6">
          {selectedUser ? (
            <>
              {/* User Info Card */}
              <div className="card-steel p-6 rounded-xl">
                <div className="flex items-center gap-4 mb-4">
                  <img
                    src={selectedUser.photoURL || '/default-avatar.png'}
                    alt={selectedUser.displayName}
                    className="w-16 h-16 rounded-full"
                  />
                  <div>
                    <h2 className="text-xl font-display text-iron-100">
                      {selectedUser.displayName || 'No Name'}
                    </h2>
                    <p className="text-iron-400">{selectedUser.email}</p>
                    <p className="text-sm text-iron-500">
                      UID: {selectedUser.uid}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-iron-800/50 rounded-lg">
                    <Dumbbell className="w-5 h-5 text-flame-400 mx-auto mb-1" />
                    <p className="text-lg font-display text-iron-100">{userWorkouts.length}</p>
                    <p className="text-xs text-iron-500">Workouts</p>
                  </div>
                  <div className="text-center p-3 bg-iron-800/50 rounded-lg">
                    <Target className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                    <p className="text-lg font-display text-iron-100">{userGoals.filter(g => g.status === 'active').length}</p>
                    <p className="text-xs text-iron-500">Active Goals</p>
                  </div>
                  <div className="text-center p-3 bg-iron-800/50 rounded-lg">
                    <Calendar className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-lg font-display text-iron-100">
                      {userWorkouts.filter(w => w.status === 'scheduled').length}
                    </p>
                    <p className="text-xs text-iron-500">Scheduled</p>
                  </div>
                </div>
              </div>

              {/* Goals Section */}
              <div className="card-steel rounded-xl">
                <div className="flex items-center justify-between p-4 border-b border-iron-800">
                  <h3 className="font-display text-lg text-iron-100">Goals</h3>
                  <button
                    onClick={() => setShowGoalModal(true)}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Goal
                  </button>
                </div>

                <div className="p-4">
                  {userGoals.length > 0 ? (
                    <div className="space-y-3">
                      {userGoals.map(goal => {
                        const metricType = goal.metricType || 'weight'
                        const unit = METRIC_LABELS[metricType]?.unit || 'lbs'
                        const current = goal.currentValue ?? goal.currentWeight ?? 0
                        const target = goal.targetValue ?? goal.targetWeight ?? 0
                        
                        return (
                          <div key={goal.id} className="p-3 bg-iron-800/50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-iron-100">{goal.lift}</span>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  goal.status === 'active' 
                                    ? 'bg-green-500/20 text-green-400' 
                                    : 'bg-iron-700 text-iron-400'
                                }`}>
                                  {goal.status}
                                </span>
                                <button
                                  onClick={() => handleEditGoal(goal)}
                                  className="p-1 text-iron-400 hover:text-iron-200 hover:bg-iron-700 rounded"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteGoal(goal.id)}
                                  className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <p className="text-sm text-iron-400">
                              {current} → {target} {unit}
                            </p>
                            {goal.notes && (
                              <p className="text-xs text-iron-500 mt-1 italic">{goal.notes}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-iron-500 text-center py-4">No goals set</p>
                  )}
                </div>
              </div>

              {/* Recent Workouts */}
              <div className="card-steel rounded-xl">
                <div className="flex items-center justify-between p-4 border-b border-iron-800">
                  <h3 className="font-display text-lg text-iron-100">Recent Workouts</h3>
                  <button
                    onClick={() => navigate(`/workouts/new?userId=${selectedUser.uid}`)}
                    className="btn-secondary text-sm flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Create Workout
                  </button>
                </div>

                <div className="p-4">
                  {userWorkouts.length > 0 ? (
                    <div className="space-y-2">
                      {userWorkouts.slice(0, 5).map(workout => {
                        const date = workout.date?.toDate ? workout.date.toDate() : new Date(workout.date)
                        return (
                          <div key={workout.id} className="p-3 bg-iron-800/50 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-iron-100">{workout.name || 'Workout'}</p>
                                <p className="text-sm text-iron-500">
                                  {format(date, 'MMM d, yyyy')} · {workout.exercises?.length || 0} exercises
                                  {workout.workoutType === 'cardio' && ` · ${workout.duration}min`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  workout.status === 'completed' 
                                    ? 'bg-green-500/20 text-green-400' 
                                    : 'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                  {workout.workoutType === 'cardio' ? 'cardio' : workout.status}
                                </span>
                                <button
                                  onClick={() => navigate(`/workouts/${workout.id}`)}
                                  className="p-1.5 text-iron-400 hover:text-iron-200 hover:bg-iron-700 rounded transition-colors"
                                  title="View/Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteWorkout(workout.id)}
                                  className="p-1.5 text-iron-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-iron-500 text-center py-4">No workouts yet</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="card-steel p-12 rounded-xl text-center">
              <Users className="w-16 h-16 text-iron-700 mx-auto mb-4" />
              <h3 className="text-lg font-display text-iron-300 mb-2">Select a User</h3>
              <p className="text-iron-500 text-sm">
                Choose a user from the list to view their details and manage their data
              </p>
            </div>
          )}
        </div>
      </div>
      </>
      ) : (
        /* Activity Tab */
        <div className="space-y-6">
          {activityLoading ? (
            <div className="card-steel p-12 text-center">
              <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-iron-500 mt-4">Loading activity data...</p>
            </div>
          ) : activityData ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card-steel p-4 text-center">
                  <p className="text-3xl font-display text-flame-400">{activityData.uniqueUsers}</p>
                  <p className="text-sm text-iron-500">Active Users (7d)</p>
                </div>
                <div className="card-steel p-4 text-center">
                  <p className="text-3xl font-display text-iron-100">{activityData.totalEvents}</p>
                  <p className="text-sm text-iron-500">Total Events</p>
                </div>
                <div className="card-steel p-4 text-center">
                  <p className="text-3xl font-display text-green-400">{activityData.actionCounts?.workout_created || 0}</p>
                  <p className="text-sm text-iron-500">Workouts Created</p>
                </div>
                <div className="card-steel p-4 text-center">
                  <p className="text-3xl font-display text-orange-400">{activityData.actionCounts?.cardio_logged || 0}</p>
                  <p className="text-sm text-iron-500">Cardio Logged</p>
                </div>
              </div>

              {/* Daily Active Users Chart */}
              <div className="card-steel p-4">
                <h3 className="font-display text-lg text-iron-100 mb-4">Daily Active Users</h3>
                <div className="flex items-end gap-2 h-32">
                  {activityData.dailyActiveCounts?.map((day, i) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                      <div 
                        className="w-full bg-flame-500 rounded-t"
                        style={{ height: `${Math.max(8, (day.count / Math.max(...activityData.dailyActiveCounts.map(d => d.count), 1)) * 100)}%` }}
                      />
                      <span className="text-xs text-iron-500">{format(new Date(day.date), 'EEE')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Page Views */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="card-steel p-4">
                  <h3 className="font-display text-lg text-iron-100 mb-4">Top Pages</h3>
                  <div className="space-y-2">
                    {Object.entries(activityData.pageCounts || {})
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 8)
                      .map(([page, count]) => (
                        <div key={page} className="flex justify-between items-center py-2 border-b border-iron-800 last:border-0">
                          <span className="text-iron-300 text-sm">{page}</span>
                          <span className="text-flame-400 font-medium">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="card-steel p-4">
                  <h3 className="font-display text-lg text-iron-100 mb-4">Action Breakdown</h3>
                  <div className="space-y-2">
                    {Object.entries(activityData.actionCounts || {})
                      .sort(([,a], [,b]) => b - a)
                      .map(([action, count]) => (
                        <div key={action} className="flex justify-between items-center py-2 border-b border-iron-800 last:border-0">
                          <span className="text-iron-300 text-sm">{action.replace(/_/g, ' ')}</span>
                          <span className="text-iron-400 font-medium">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="card-steel p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-lg text-iron-100">Recent Activity</h3>
                  <button 
                    onClick={loadActivityData}
                    className="text-sm text-flame-400 hover:text-flame-300"
                  >
                    Refresh
                  </button>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {activityData.recentEvents?.map((event) => {
                    const eventUser = users.find(u => u.uid === event.userId)
                    return (
                      <div key={event.id} className="flex items-center gap-3 py-2 border-b border-iron-800 last:border-0">
                        <div className="w-8 h-8 rounded-full bg-iron-800 flex items-center justify-center text-iron-400 text-xs">
                          {eventUser?.displayName?.[0] || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-iron-200 truncate">
                            <span className="text-iron-400">{eventUser?.displayName || 'Unknown'}</span>
                            {' · '}
                            <span className="text-flame-400">{event.action.replace(/_/g, ' ')}</span>
                            {event.metadata?.page && <span className="text-iron-500"> {event.metadata.page}</span>}
                          </p>
                          <p className="text-xs text-iron-600">
                            {event.timestamp?.toDate && formatDistanceToNow(event.timestamp.toDate(), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="card-steel p-12 text-center">
              <Activity className="w-12 h-12 text-iron-600 mx-auto mb-4" />
              <p className="text-iron-500">No activity data yet</p>
            </div>
          )}
        </div>
      )}

      {/* Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowGoalModal(false)}
          />
          <div className="relative bg-iron-900 border border-iron-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowGoalModal(false)}
              className="absolute top-4 right-4 text-iron-500 hover:text-iron-300"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl font-display text-iron-100 mb-2">
              {editingGoal ? 'Edit' : 'Create'} Goal for {impersonating?.displayName}
            </h2>
            <p className="text-sm text-iron-500 mb-6">
              {editingGoal ? 'Update this goal' : 'This goal will be added to the user\'s account'}
            </p>
            
            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">Exercise *</label>
                <select
                  value={goalForm.lift}
                  onChange={(e) => setGoalForm(prev => ({ ...prev, lift: e.target.value }))}
                  className="input-field w-full"
                  required
                >
                  <option value="">Select an exercise</option>
                  {COMMON_LIFTS.map(lift => (
                    <option key={lift} value={lift}>{lift}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">Goal Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(METRIC_LABELS).map(([key, { label }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setGoalForm(prev => ({ ...prev, metricType: key }))}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        goalForm.metricType === key
                          ? 'bg-flame-500 text-white'
                          : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">
                  Current {METRIC_LABELS[goalForm.metricType].label} ({METRIC_LABELS[goalForm.metricType].unit})
                </label>
                <input
                  type="number"
                  value={goalForm.currentValue}
                  onChange={(e) => setGoalForm(prev => ({ ...prev, currentValue: e.target.value }))}
                  className="input-field w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">
                  Target {METRIC_LABELS[goalForm.metricType].label} ({METRIC_LABELS[goalForm.metricType].unit}) *
                </label>
                <input
                  type="number"
                  value={goalForm.targetValue}
                  onChange={(e) => setGoalForm(prev => ({ ...prev, targetValue: e.target.value }))}
                  className="input-field w-full"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">Target Date *</label>
                <input
                  type="date"
                  value={goalForm.targetDate}
                  onChange={(e) => setGoalForm(prev => ({ ...prev, targetDate: e.target.value }))}
                  className="input-field w-full"
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">Notes (optional)</label>
                <input
                  type="text"
                  value={goalForm.notes}
                  onChange={(e) => setGoalForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g., with pause, 20lb vest"
                  className="input-field w-full"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowGoalModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!goalForm.lift || !goalForm.targetValue || !goalForm.targetDate}
                  className="btn-primary flex-1"
                >
                  Create Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
