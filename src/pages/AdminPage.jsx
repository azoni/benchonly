import React, { useState, useEffect } from 'react'
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
  TrendingUp,
  Settings,
  Save
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { collection, getDocs, query, orderBy, limit, doc, setDoc, getDoc } from 'firebase/firestore'
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
  const [activeTab, setActiveTab] = useState('users') // 'users', 'activity', 'usage', or 'settings'
  const [activityData, setActivityData] = useState(null)
  
  // AI Settings state
  const [aiSettings, setAiSettings] = useState({
    painThresholdMin: 3,
    painThresholdCount: 2,
    defaultModel: 'standard',
  })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [usageData, setUsageData] = useState([])
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageFilter, setUsageFilter] = useState('')
  const [expandedUsage, setExpandedUsage] = useState(null)
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
    if (activeTab === 'usage' && usageData.length === 0) {
      loadUsageData()
    }
    if (activeTab === 'settings') {
      loadSettings()
    }
  }, [activeTab])

  const loadSettings = async () => {
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'ai'))
      if (settingsDoc.exists()) {
        setAiSettings({
          painThresholdMin: settingsDoc.data().painThresholdMin ?? 3,
          painThresholdCount: settingsDoc.data().painThresholdCount ?? 2,
          defaultModel: settingsDoc.data().defaultModel ?? 'standard',
        })
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const saveSettings = async () => {
    setSettingsSaving(true)
    setSettingsSaved(false)
    try {
      await setDoc(doc(db, 'settings', 'ai'), {
        painThresholdMin: aiSettings.painThresholdMin,
        painThresholdCount: aiSettings.painThresholdCount,
        defaultModel: aiSettings.defaultModel,
        updatedAt: new Date(),
        updatedBy: user.uid,
      })
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Failed to save settings')
    } finally {
      setSettingsSaving(false)
    }
  }

  const loadUsageData = async () => {
    setUsageLoading(true)
    try {
      const q = query(
        collection(db, 'tokenUsage'),
        orderBy('createdAt', 'desc'),
        limit(200)
      )
      const snapshot = await getDocs(q)
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setUsageData(data)
    } catch (error) {
      console.error('Error loading usage:', error)
    } finally {
      setUsageLoading(false)
    }
  }

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
        targetDate: goalForm.targetDate,
        notes: goalForm.notes || '',
        status: 'active'
      }
      
      // Only add weight fields for weight-type goals
      if (goalForm.metricType === 'weight') {
        goalData.currentWeight = currentVal
        goalData.startWeight = currentVal
        goalData.targetWeight = parseInt(goalForm.targetValue)
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
      <div className="card-steel p-1 mb-6 flex gap-1 max-w-md">
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
        <button
          onClick={() => setActiveTab('usage')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm transition-colors ${
            activeTab === 'usage'
              ? 'bg-flame-500 text-white'
              : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Usage
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium text-sm transition-colors ${
            activeTab === 'settings'
              ? 'bg-flame-500 text-white'
              : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          Settings
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
      ) : activeTab === 'activity' ? (
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
      ) : activeTab === 'usage' ? (
        /* Usage Tab */
        <div className="space-y-6">
          {/* Filter */}
          <div className="card-steel p-4">
            <label className="text-sm text-iron-400 mb-2 block">Filter by User</label>
            <select
              value={usageFilter}
              onChange={(e) => setUsageFilter(e.target.value)}
              className="input-field w-full max-w-xs"
            >
              <option value="">All Users</option>
              {users.map(u => (
                <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>
              ))}
            </select>
          </div>

          {usageLoading ? (
            <div className="card-steel p-12 text-center">
              <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-iron-500 mt-4">Loading usage data...</p>
            </div>
          ) : (
            <>
              {/* Usage Summary */}
              {(() => {
                const filtered = usageFilter 
                  ? usageData.filter(u => u.userId === usageFilter)
                  : usageData
                const totalTokens = filtered.reduce((sum, u) => sum + (u.totalTokens || 0), 0)
                const totalCost = filtered.reduce((sum, u) => sum + (u.estimatedCost || 0), 0)
                
                return (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="card-steel p-4 text-center">
                        <p className="text-3xl font-display text-flame-400">{filtered.length}</p>
                        <p className="text-sm text-iron-500">Total Requests</p>
                      </div>
                      <div className="card-steel p-4 text-center">
                        <p className="text-3xl font-display text-iron-100">{(totalTokens / 1000).toFixed(1)}k</p>
                        <p className="text-sm text-iron-500">Tokens Used</p>
                      </div>
                      <div className="card-steel p-4 text-center">
                        <p className="text-3xl font-display text-green-400">${totalCost.toFixed(2)}</p>
                        <p className="text-sm text-iron-500">Est. Cost</p>
                      </div>
                    </div>

                    {/* Usage Table */}
                    <div className="card-steel overflow-hidden">
                      <div className="max-h-[600px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-iron-800 sticky top-0">
                            <tr>
                              <th className="text-left p-3 text-iron-400 w-8"></th>
                              <th className="text-left p-3 text-iron-400">User</th>
                              <th className="text-left p-3 text-iron-400">Feature</th>
                              <th className="text-left p-3 text-iron-400">Date</th>
                              <th className="text-right p-3 text-iron-400">Tokens</th>
                              <th className="text-right p-3 text-iron-400">Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.slice(0, 100).map((usage) => {
                              const usageUser = users.find(u => u.uid === usage.userId)
                              const isExpanded = expandedUsage === usage.id
                              return (
                                <React.Fragment key={usage.id}>
                                  <tr 
                                    className={`border-t border-iron-800 cursor-pointer hover:bg-iron-800/50 transition-colors ${isExpanded ? 'bg-iron-800/30' : ''}`}
                                    onClick={() => setExpandedUsage(isExpanded ? null : usage.id)}
                                  >
                                    <td className="p-3 text-iron-500">
                                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </td>
                                    <td className="p-3 text-iron-300">
                                      {usageUser?.displayName || usage.userId?.slice(0, 8)}
                                    </td>
                                    <td className="p-3">
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                        usage.feature === 'ask-assistant' 
                                          ? 'bg-purple-500/20 text-purple-400'
                                          : 'bg-blue-500/20 text-blue-400'
                                      }`}>
                                        {usage.feature || 'unknown'}
                                      </span>
                                    </td>
                                    <td className="p-3 text-iron-500">
                                      {usage.createdAt?.toDate && format(usage.createdAt.toDate(), 'MMM d, h:mm a')}
                                    </td>
                                    <td className="p-3 text-right text-iron-300">
                                      {usage.totalTokens?.toLocaleString()}
                                    </td>
                                    <td className="p-3 text-right text-green-400">
                                      ${usage.estimatedCost?.toFixed(4)}
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr className="border-t border-iron-800/50">
                                      <td colSpan={6} className="p-4 bg-iron-800/20">
                                        <div className="space-y-4 max-w-3xl">
                                          {/* User Message */}
                                          {usage.userMessage && (
                                            <div>
                                              <p className="text-xs text-iron-500 mb-1 font-medium">USER MESSAGE</p>
                                              <div className="bg-iron-800 rounded-lg p-3 text-iron-300 text-sm">
                                                {usage.userMessage}
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Assistant Response */}
                                          {usage.assistantResponse && (
                                            <div>
                                              <p className="text-xs text-iron-500 mb-1 font-medium">ASSISTANT RESPONSE</p>
                                              <div className="bg-flame-500/10 border border-flame-500/20 rounded-lg p-3 text-iron-300 text-sm whitespace-pre-wrap">
                                                {usage.assistantResponse}
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* No message data */}
                                          {!usage.userMessage && !usage.assistantResponse && (
                                            <p className="text-iron-500 text-sm italic">
                                              No message data available (older request or different feature)
                                            </p>
                                          )}
                                          
                                          {/* Meta info */}
                                          <div className="flex gap-4 text-xs text-iron-500 pt-2 border-t border-iron-800">
                                            <span>Model: {usage.model || 'gpt-4o-mini'}</span>
                                            <span>Prompt: {usage.promptTokens?.toLocaleString()} tokens</span>
                                            <span>Completion: {usage.completionTokens?.toLocaleString()} tokens</span>
                                            {usage.responseTimeMs && <span>Response time: {usage.responseTimeMs}ms</span>}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )
              })()}
            </>
          )}
        </div>
      ) : null}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl">
          <div className="card-steel p-6">
            <h2 className="text-xl font-display text-iron-100 mb-6 flex items-center gap-2">
              <Settings className="w-5 h-5 text-flame-500" />
              AI Workout Generation Settings
            </h2>

            <div className="space-y-6">
              {/* Pain Threshold Settings */}
              <div className="p-4 bg-iron-800/50 rounded-xl">
                <h3 className="font-medium text-iron-200 mb-4">Pain Detection Thresholds</h3>
                <p className="text-sm text-iron-500 mb-4">
                  Control when exercises are flagged for substitution based on pain history.
                </p>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-iron-400 mb-2">
                      Minimum Pain Level (1-10)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={aiSettings.painThresholdMin}
                      onChange={(e) => setAiSettings(prev => ({
                        ...prev,
                        painThresholdMin: parseInt(e.target.value) || 3
                      }))}
                      className="input-field w-full"
                    />
                    <p className="text-xs text-iron-600 mt-1">
                      Pain level that triggers a flag (currently: ≥{aiSettings.painThresholdMin})
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-iron-400 mb-2">
                      Recurring Pain Count
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={aiSettings.painThresholdCount}
                      onChange={(e) => setAiSettings(prev => ({
                        ...prev,
                        painThresholdCount: parseInt(e.target.value) || 2
                      }))}
                      className="input-field w-full"
                    />
                    <p className="text-xs text-iron-600 mt-1">
                      Times pain reported to trigger flag (currently: ≥{aiSettings.painThresholdCount})
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-iron-900/50 rounded-lg">
                  <p className="text-sm text-iron-400">
                    <strong className="text-iron-300">Current Logic:</strong> Flag exercise if pain ≥{aiSettings.painThresholdMin}/10 OR reported ≥{aiSettings.painThresholdCount} times
                  </p>
                </div>
              </div>

              {/* Default Model Setting */}
              <div className="p-4 bg-iron-800/50 rounded-xl">
                <h3 className="font-medium text-iron-200 mb-4">Default AI Model</h3>
                <p className="text-sm text-iron-500 mb-4">
                  Set the default model for AI workout generation.
                </p>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAiSettings(prev => ({ ...prev, defaultModel: 'standard' }))}
                    className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-colors ${
                      aiSettings.defaultModel === 'standard'
                        ? 'bg-flame-500 text-white'
                        : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                    }`}
                  >
                    <div className="font-semibold">Standard</div>
                    <div className="text-xs opacity-75 mt-1">GPT-4o-mini (~$0.001/workout)</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiSettings(prev => ({ ...prev, defaultModel: 'premium' }))}
                    className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-colors ${
                      aiSettings.defaultModel === 'premium'
                        ? 'bg-purple-500 text-white'
                        : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                    }`}
                  >
                    <div className="font-semibold">Premium</div>
                    <div className="text-xs opacity-75 mt-1">GPT-4o (~$0.02/workout)</div>
                  </button>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-between pt-4 border-t border-iron-800">
                <div className="text-sm text-iron-500">
                  {settingsSaved && (
                    <span className="text-green-400 flex items-center gap-1">
                      <Check className="w-4 h-4" /> Settings saved!
                    </span>
                  )}
                </div>
                <button
                  onClick={saveSettings}
                  disabled={settingsSaving}
                  className="btn-primary flex items-center gap-2"
                >
                  {settingsSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Settings
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
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