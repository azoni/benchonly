import { useState } from 'react'
import { 
  ArrowLeft, 
  Save, 
  Loader2,
  Repeat,
  Clock,
  Flame,
  ChevronDown,
  X,
  Plus
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { workoutService, recurringActivityService } from '../services/firestore'
import { 
  ACTIVITY_CATEGORIES, 
  ACTIVITY_METS, 
  getActivitiesByCategory,
  calculateActivityCalories 
} from '../services/calorieService'
import { getTodayString, parseLocalDate } from '../utils/dateUtils'

const DAYS_OF_WEEK = [
  { id: 0, short: 'Sun', full: 'Sunday' },
  { id: 1, short: 'Mon', full: 'Monday' },
  { id: 2, short: 'Tue', full: 'Tuesday' },
  { id: 3, short: 'Wed', full: 'Wednesday' },
  { id: 4, short: 'Thu', full: 'Thursday' },
  { id: 5, short: 'Fri', full: 'Friday' },
  { id: 6, short: 'Sat', full: 'Saturday' },
]

export default function CardioForm({ onBack }) {
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [showActivityPicker, setShowActivityPicker] = useState(false)
  const [showRecurring, setShowRecurring] = useState(false)
  
  const [cardio, setCardio] = useState({
    date: getTodayString(),
    activityType: '',
    duration: '',
    distance: '',
    notes: '',
    recurring: false,
    recurringDays: []
  })

  const activitiesByCategory = getActivitiesByCategory()
  const selectedActivity = ACTIVITY_METS[cardio.activityType]
  const estimatedCalories = cardio.activityType && cardio.duration
    ? calculateActivityCalories(cardio.activityType, parseInt(cardio.duration), userProfile?.weight)
    : 0

  const toggleRecurringDay = (dayId) => {
    setCardio(prev => ({
      ...prev,
      recurringDays: prev.recurringDays.includes(dayId)
        ? prev.recurringDays.filter(d => d !== dayId)
        : [...prev.recurringDays, dayId]
    }))
  }

  const handleSave = async () => {
    if (!cardio.activityType) {
      alert('Please select an activity')
      return
    }
    if (!cardio.duration) {
      alert('Please enter duration')
      return
    }

    setSaving(true)
    try {
      // Create the cardio workout
      const workoutData = {
        workoutType: 'cardio',
        name: selectedActivity?.label || 'Cardio',
        date: parseLocalDate(cardio.date),
        activityType: cardio.activityType,
        duration: parseInt(cardio.duration),
        distance: cardio.distance ? parseFloat(cardio.distance) : null,
        estimatedCalories,
        notes: cardio.notes
      }
      
      await workoutService.create(user.uid, workoutData)

      // Create recurring activity if selected
      if (cardio.recurring && cardio.recurringDays.length > 0) {
        await recurringActivityService.create(user.uid, {
          activityType: cardio.activityType,
          duration: parseInt(cardio.duration),
          distance: cardio.distance ? parseFloat(cardio.distance) : null,
          days: cardio.recurringDays,
          name: selectedActivity?.label || 'Cardio'
        })
      }

      navigate('/workouts')
    } catch (error) {
      console.error('Error saving cardio:', error)
      alert('Failed to save activity')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="p-2 text-iron-400 hover:text-iron-100 hover:bg-iron-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-display text-2xl text-iron-50">Log Cardio</h1>
          <p className="text-iron-400 text-sm">Track your cardio activity</p>
        </div>
      </div>

      {/* Date */}
      <div className="card-steel p-5 mb-4">
        <label className="block text-sm font-medium text-iron-300 mb-2">
          Date
        </label>
        <input
          type="date"
          value={cardio.date}
          onChange={(e) => setCardio(prev => ({ ...prev, date: e.target.value }))}
          className="input-field w-full"
        />
      </div>

      {/* Activity Picker */}
      <div className="card-steel p-5 mb-4">
        <label className="block text-sm font-medium text-iron-300 mb-2">
          Activity Type
        </label>
        <button
          onClick={() => setShowActivityPicker(true)}
          className="input-field w-full text-left flex items-center justify-between"
        >
          <span className={selectedActivity ? 'text-iron-100' : 'text-iron-500'}>
            {selectedActivity?.label || 'Select activity...'}
          </span>
          <ChevronDown className="w-4 h-4 text-iron-500" />
        </button>
      </div>

      {/* Duration & Distance */}
      <div className="card-steel p-5 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-iron-300 mb-2">
              <Clock className="w-4 h-4 inline mr-1" />
              Duration (minutes)
            </label>
            <input
              type="number"
              value={cardio.duration}
              onChange={(e) => setCardio(prev => ({ ...prev, duration: e.target.value }))}
              placeholder="30"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-iron-300 mb-2">
              Distance (optional)
            </label>
            <input
              type="number"
              step="0.1"
              value={cardio.distance}
              onChange={(e) => setCardio(prev => ({ ...prev, distance: e.target.value }))}
              placeholder="3.5 mi"
              className="input-field w-full"
            />
          </div>
        </div>

        {/* Calorie Estimate */}
        {estimatedCalories > 0 && (
          <div className="mt-4 p-3 bg-flame-500/10 rounded-lg flex items-center gap-3">
            <Flame className="w-5 h-5 text-flame-400" />
            <div>
              <p className="text-sm text-iron-300">Estimated calories burned</p>
              <p className="text-xl font-display text-flame-400">{estimatedCalories} cal</p>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="card-steel p-5 mb-4">
        <label className="block text-sm font-medium text-iron-300 mb-2">
          Notes (optional)
        </label>
        <textarea
          value={cardio.notes}
          onChange={(e) => setCardio(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="How did it feel? Any details..."
          rows={2}
          className="input-field w-full resize-none"
        />
      </div>

      {/* Recurring Option */}
      <div className="card-steel p-5 mb-6">
        <button
          onClick={() => setShowRecurring(!showRecurring)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Repeat className="w-5 h-5 text-purple-400" />
            <div className="text-left">
              <p className="font-medium text-iron-200">Make this recurring</p>
              <p className="text-sm text-iron-500">Auto-schedule weekly</p>
            </div>
          </div>
          <div className={`w-12 h-7 rounded-full transition-colors ${
            cardio.recurring ? 'bg-flame-500' : 'bg-iron-700'
          }`}>
            <div className={`w-5 h-5 bg-white rounded-full mt-1 transition-transform ${
              cardio.recurring ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </div>
        </button>

        {showRecurring && (
          <div className="mt-4 pt-4 border-t border-iron-800">
            <p className="text-sm text-iron-400 mb-3">Repeat on these days:</p>
            <div className="flex gap-2">
              {DAYS_OF_WEEK.map(day => (
                <button
                  key={day.id}
                  onClick={() => {
                    toggleRecurringDay(day.id)
                    setCardio(prev => ({ ...prev, recurring: true }))
                  }}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                    cardio.recurringDays.includes(day.id)
                      ? 'bg-flame-500 text-white'
                      : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                  }`}
                >
                  {day.short}
                </button>
              ))}
            </div>
            {cardio.recurringDays.length > 0 && (
              <p className="text-xs text-iron-500 mt-2">
                This will create a recurring schedule. You can skip individual days or mark them complete.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving || !cardio.activityType || !cardio.duration}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3"
      >
        {saving ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="w-5 h-5" />
            Save Activity
          </>
        )}
      </button>

      {/* Activity Picker Modal */}
      {showActivityPicker && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-iron-900 w-full sm:w-[480px] max-h-[80vh] rounded-t-2xl sm:rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-iron-800 flex items-center justify-between sticky top-0 bg-iron-900">
              <h3 className="font-display text-lg text-iron-100">Select Activity</h3>
              <button
                onClick={() => setShowActivityPicker(false)}
                className="p-2 text-iron-400 hover:text-iron-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="overflow-y-auto max-h-[60vh] p-4">
              {ACTIVITY_CATEGORIES.map(category => {
                const activities = activitiesByCategory[category.id] || []
                if (activities.length === 0) return null
                
                return (
                  <div key={category.id} className="mb-6">
                    <h4 className="text-sm font-medium text-iron-400 mb-2 flex items-center gap-2">
                      <span>{category.icon}</span>
                      {category.label}
                    </h4>
                    <div className="space-y-1">
                      {activities.map(activity => (
                        <button
                          key={activity.id}
                          onClick={() => {
                            setCardio(prev => ({ ...prev, activityType: activity.id }))
                            setShowActivityPicker(false)
                          }}
                          className={`w-full p-3 rounded-lg text-left transition-colors flex items-center justify-between ${
                            cardio.activityType === activity.id
                              ? 'bg-flame-500/20 border border-flame-500'
                              : 'bg-iron-800 hover:bg-iron-700'
                          }`}
                        >
                          <span className="text-iron-200">{activity.label}</span>
                          <span className="text-xs text-iron-500">{activity.met} MET</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
