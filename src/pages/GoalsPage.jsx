import { useState, useEffect } from 'react'
import { format, differenceInDays, isPast } from 'date-fns'
import { 
  Target, 
  Plus, 
  TrendingUp, 
  Calendar,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronRight,
  Flame,
  Award
} from 'lucide-react'
import { goalService } from '../services/firestore'
import { useAuth } from '../context/AuthContext'

const COMMON_LIFTS = [
  'Bench Press',
  'Squat',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
  'Pull-ups',
  'Incline Bench',
  'Romanian Deadlift',
  'Front Squat',
  'Close Grip Bench'
]

export default function GoalsPage() {
  const { user, isGuest } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [formData, setFormData] = useState({
    lift: '',
    metricType: 'weight', // weight, reps, time
    currentValue: '',
    targetValue: '',
    targetDate: '',
    notes: ''
  })
  const [saving, setSaving] = useState(false)

  const METRIC_LABELS = {
    weight: { label: 'Weight', unit: 'lbs', placeholder: '225' },
    reps: { label: 'Reps', unit: 'reps', placeholder: '10' },
    time: { label: 'Time', unit: 'seconds', placeholder: '60' }
  }

  useEffect(() => {
    async function fetchGoals() {
      if (!user) return
      try {
        if (isGuest) {
          const { SAMPLE_GOALS } = await import('../context/AuthContext')
          setGoals(SAMPLE_GOALS)
          setLoading(false)
          return
        }
        const data = await goalService.getByUser(user.uid)
        setGoals(data)
      } catch (error) {
        console.error('Error fetching goals:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchGoals()
  }, [user, isGuest])

  const openModal = (goal = null) => {
    if (goal) {
      setEditingGoal(goal)
      setFormData({
        lift: goal.lift,
        metricType: goal.metricType || 'weight',
        currentValue: (goal.currentWeight || goal.currentValue || '').toString(),
        targetValue: (goal.targetWeight || goal.targetValue || '').toString(),
        targetDate: goal.targetDate,
        notes: goal.notes || ''
      })
    } else {
      setEditingGoal(null)
      setFormData({
        lift: '',
        metricType: 'weight',
        currentValue: '',
        targetValue: '',
        targetDate: '',
        notes: ''
      })
    }
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.lift || !formData.targetValue || !formData.targetDate) return
    
    setSaving(true)
    try {
      const currentVal = parseInt(formData.currentValue) || 0
      const targetVal = parseInt(formData.targetValue)
      const goalData = {
        lift: formData.lift,
        metricType: formData.metricType,
        currentValue: currentVal,
        startValue: editingGoal?.startValue || currentVal,
        targetValue: targetVal,
        targetDate: formData.targetDate,
        notes: formData.notes || '',
        status: 'active'
      }
      
      // Add legacy weight fields only for weight-type goals
      if (formData.metricType === 'weight') {
        goalData.currentWeight = currentVal
        goalData.startWeight = editingGoal?.startWeight || currentVal
        goalData.targetWeight = targetVal
      }
      
      if (isGuest) {
        // Guest mode - just update local state
        if (editingGoal) {
          setGoals(prev => prev.map(g => 
            g.id === editingGoal.id ? { ...g, ...goalData } : g
          ))
        } else {
          setGoals(prev => [...prev, { id: `guest-${Date.now()}`, ...goalData }])
        }
        setShowModal(false)
        setSaving(false)
        return
      }
      
      if (editingGoal) {
        await goalService.update(editingGoal.id, goalData)
        setGoals(prev => prev.map(g => 
          g.id === editingGoal.id ? { ...g, ...goalData } : g
        ))
      } else {
        const newGoal = await goalService.create(user.uid, goalData)
        setGoals(prev => [...prev, { ...newGoal, status: 'active', progress: 0 }])
      }
      
      setShowModal(false)
    } catch (error) {
      console.error('Error saving goal:', error)
      alert('Failed to save goal. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (goalId) => {
    if (!confirm('Delete this goal?')) return
    
    if (isGuest) {
      setGoals(prev => prev.filter(g => g.id !== goalId))
      return
    }
    
    try {
      await goalService.delete(goalId)
      setGoals(prev => prev.filter(g => g.id !== goalId))
    } catch (error) {
      console.error('Error deleting goal:', error)
    }
  }

  const markComplete = async (goal) => {
    if (isGuest) {
      setGoals(prev => prev.map(g => 
        g.id === goal.id ? { ...g, status: 'completed' } : g
      ))
      return
    }
    try {
      await goalService.update(goal.id, { 
        status: 'completed',
        completedAt: new Date().toISOString()
      })
      setGoals(prev => prev.map(g => 
        g.id === goal.id ? { ...g, status: 'completed' } : g
      ))
    } catch (error) {
      console.error('Error completing goal:', error)
    }
  }

  const getGoalValues = (goal) => {
    // Support both old (weight-only) and new (metric types) formats
    const metricType = goal.metricType || 'weight'
    const startVal = goal.startValue ?? goal.startWeight ?? goal.currentValue ?? goal.currentWeight ?? 0
    const currentVal = goal.currentValue ?? goal.currentWeight ?? startVal
    const targetVal = goal.targetValue ?? goal.targetWeight ?? 0
    const unit = METRIC_LABELS[metricType]?.unit || 'lbs'
    return { metricType, startVal, currentVal, targetVal, unit }
  }

  const calculateProgress = (goal) => {
    const { startVal, currentVal, targetVal } = getGoalValues(goal)
    
    // If already at or past target, return 100
    if (currentVal >= targetVal) return 100
    
    // If no progress made yet (current equals start), return 0
    if (currentVal <= startVal) return 0
    
    // Calculate progress as percentage of the journey from start to target
    const totalGain = targetVal - startVal
    const currentGain = currentVal - startVal
    
    if (totalGain <= 0) return 0
    return Math.min(100, Math.round((currentGain / totalGain) * 100))
  }

  const getDaysRemaining = (date) => {
    const days = differenceInDays(new Date(date), new Date())
    if (days < 0) return 'Overdue'
    if (days === 0) return 'Today'
    if (days === 1) return '1 day left'
    return `${days} days left`
  }

  const activeGoals = goals.filter(g => g.status === 'active')
  const completedGoals = goals.filter(g => g.status === 'completed')

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display text-iron-100">Goals</h1>
          <p className="text-iron-500 text-sm mt-1">
            Track your strength milestones
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Goal
        </button>
      </div>

      {/* Summary Stats */}
      {goals.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card-steel p-4 text-center">
            <p className="text-3xl font-display text-flame-400">
              {activeGoals.length}
            </p>
            <p className="text-sm text-iron-500">Active</p>
          </div>
          <div className="card-steel p-4 text-center">
            <p className="text-3xl font-display text-green-400">
              {completedGoals.length}
            </p>
            <p className="text-sm text-iron-500">Completed</p>
          </div>
          <div className="card-steel p-4 text-center">
            <p className="text-3xl font-display text-iron-200">
              {goals.length}
            </p>
            <p className="text-sm text-iron-500">Total</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : goals.length === 0 ? (
        <div className="card-steel p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-iron-800 flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-iron-500" />
          </div>
          <h3 className="text-lg font-display text-iron-300 mb-2">No goals yet</h3>
          <p className="text-iron-500 text-sm mb-6 max-w-sm mx-auto">
            Set strength goals to track your progress and stay motivated
          </p>
          <button onClick={() => openModal()} className="btn-primary">
            Set Your First Goal
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active Goals */}
          {activeGoals.length > 0 && (
            <div>
              <h2 className="text-lg font-display text-iron-300 mb-4 flex items-center gap-2">
                <Flame className="w-5 h-5 text-flame-500" />
                Active Goals
              </h2>
              <div className="space-y-4">
                {activeGoals.map(goal => (
                  <div key={goal.id} className="card-steel p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-iron-100">
                          {goal.lift}
                        </h3>
                        <p className="text-sm text-iron-500 flex items-center gap-2 mt-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(goal.targetDate), 'MMM d, yyyy')}
                          <span className={`ml-2 ${
                            isPast(new Date(goal.targetDate)) 
                              ? 'text-red-400' 
                              : 'text-iron-400'
                          }`}>
                            ({getDaysRemaining(goal.targetDate)})
                          </span>
                        </p>
                        {goal.notes && (
                          <p className="text-xs text-iron-500 mt-1 italic">{goal.notes}</p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => markComplete(goal)}
                          className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors"
                          title="Mark as complete"
                        >
                          <Check className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => openModal(goal)}
                          className="p-2 text-iron-400 hover:bg-iron-700 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Progress */}
                    <div className="mb-4">
                      {(() => {
                        const { currentVal, targetVal, unit } = getGoalValues(goal)
                        return (
                          <>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="text-iron-400">
                                Current: <span className="text-iron-200 font-medium">{currentVal} {unit}</span>
                              </span>
                              <span className="text-iron-400">
                                Target: <span className="text-flame-400 font-medium">{targetVal} {unit}</span>
                              </span>
                            </div>
                            <div className="h-3 bg-iron-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-flame-600 to-flame-500 rounded-full transition-all duration-500"
                                style={{ width: `${calculateProgress(goal)}%` }}
                              />
                            </div>
                          </>
                        )
                      })()}
                    </div>
                    
                    {/* Value to gain */}
                    <div className="flex items-center justify-between text-sm">
                      {(() => {
                        const { currentVal, targetVal, unit } = getGoalValues(goal)
                        return (
                          <span className="text-iron-500">
                            {targetVal - currentVal} {unit} to go
                          </span>
                        )
                      })()}
                      <span className="flex items-center gap-1 text-iron-400">
                        <TrendingUp className="w-4 h-4" />
                        {calculateProgress(goal)}% there
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Goals */}
          {completedGoals.length > 0 && (
            <div>
              <h2 className="text-lg font-display text-iron-300 mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-green-500" />
                Completed
              </h2>
              <div className="space-y-3">
                {completedGoals.map(goal => {
                  const { targetVal, unit } = getGoalValues(goal)
                  return (
                    <div key={goal.id} className="card-steel p-4 flex items-center gap-4 opacity-75">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-iron-200">
                          {goal.lift}
                        </h3>
                        <p className="text-sm text-iron-500">
                          {targetVal} {unit} achieved
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(goal.id)}
                        className="p-2 text-iron-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-iron-900 border border-iron-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto animate-scale-in">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-iron-500 hover:text-iron-300"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl font-display text-iron-100 mb-6">
              {editingGoal ? 'Edit Goal' : 'New Goal'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Exercise/Lift Selection */}
              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">
                  Exercise *
                </label>
                <select
                  value={formData.lift}
                  onChange={(e) => setFormData(prev => ({ ...prev, lift: e.target.value }))}
                  className="input-field w-full"
                  required
                >
                  <option value="">Select an exercise</option>
                  {COMMON_LIFTS.map(lift => (
                    <option key={lift} value={lift}>{lift}</option>
                  ))}
                </select>
              </div>

              {/* Metric Type */}
              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">
                  Goal Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(METRIC_LABELS).map(([key, { label }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, metricType: key }))}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        formData.metricType === key
                          ? 'bg-flame-500 text-white'
                          : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Current Value */}
              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">
                  Current {METRIC_LABELS[formData.metricType].label} ({METRIC_LABELS[formData.metricType].unit})
                </label>
                <input
                  type="number"
                  value={formData.currentValue}
                  onChange={(e) => setFormData(prev => ({ ...prev, currentValue: e.target.value }))}
                  placeholder={`e.g., ${METRIC_LABELS[formData.metricType].placeholder}`}
                  className="input-field w-full"
                />
              </div>
              
              {/* Target Value */}
              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">
                  Target {METRIC_LABELS[formData.metricType].label} ({METRIC_LABELS[formData.metricType].unit}) *
                </label>
                <input
                  type="number"
                  value={formData.targetValue}
                  onChange={(e) => setFormData(prev => ({ ...prev, targetValue: e.target.value }))}
                  placeholder={`e.g., ${parseInt(METRIC_LABELS[formData.metricType].placeholder) + 20}`}
                  className="input-field w-full"
                  required
                />
              </div>
              
              {/* Target Date */}
              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">
                  Target Date *
                </label>
                <input
                  type="date"
                  value={formData.targetDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, targetDate: e.target.value }))}
                  className="input-field w-full"
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-iron-400 mb-2">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g., with pause, 20lb vest, strict form"
                  className="input-field w-full"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.lift || !formData.targetValue || !formData.targetDate}
                  className="btn-primary flex-1"
                >
                  {saving ? 'Saving...' : editingGoal ? 'Update Goal' : 'Create Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}