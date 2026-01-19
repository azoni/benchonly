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
  UserCog
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../services/firebase'
import { workoutService, goalService } from '../services/firestore'
import { format } from 'date-fns'

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

      const newGoal = await goalService.create(impersonating.uid, goalData)
      setUserGoals(prev => [...prev, { ...newGoal, ...goalData }])
      setShowGoalModal(false)
      setGoalForm({
        lift: '',
        metricType: 'weight',
        currentValue: '',
        targetValue: '',
        targetDate: '',
        notes: ''
      })
    } catch (error) {
      console.error('Error creating goal:', error)
      alert('Failed to create goal')
    }
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
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                goal.status === 'active' 
                                  ? 'bg-green-500/20 text-green-400' 
                                  : 'bg-iron-700 text-iron-400'
                              }`}>
                                {goal.status}
                              </span>
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
                          <div key={workout.id} className="p-3 bg-iron-800/50 rounded-lg flex items-center justify-between">
                            <div>
                              <p className="font-medium text-iron-100">{workout.name || 'Workout'}</p>
                              <p className="text-sm text-iron-500">
                                {format(date, 'MMM d, yyyy')} · {workout.exercises?.length || 0} exercises
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              workout.status === 'completed' 
                                ? 'bg-green-500/20 text-green-400' 
                                : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              {workout.status}
                            </span>
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
              Create Goal for {impersonating?.displayName}
            </h2>
            <p className="text-sm text-iron-500 mb-6">
              This goal will be added to the user's account
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