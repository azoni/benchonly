import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Users,
  Check,
  Loader2,
  Save,
  Info,
  X
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { groupWorkoutService, groupService } from '../services/firestore'

const PAIN_LEVELS = [
  { value: 0, label: 'None', color: 'bg-green-500' },
  { value: 1, label: '1', color: 'bg-green-400' },
  { value: 2, label: '2', color: 'bg-lime-400' },
  { value: 3, label: '3', color: 'bg-yellow-400' },
  { value: 4, label: '4', color: 'bg-yellow-500' },
  { value: 5, label: '5', color: 'bg-orange-400' },
  { value: 6, label: '6', color: 'bg-orange-500' },
  { value: 7, label: '7', color: 'bg-red-400' },
  { value: 8, label: '8', color: 'bg-red-500' },
  { value: 9, label: '9', color: 'bg-red-600' },
  { value: 10, label: '10', color: 'bg-red-700' },
]

export default function GroupWorkoutPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [workout, setWorkout] = useState(null)
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rpeModalOpen, setRpeModalOpen] = useState(false)

  useEffect(() => {
    loadWorkout()
  }, [id])

  const loadWorkout = async () => {
    try {
      const data = await groupWorkoutService.get(id)
      if (data) {
        setWorkout(data)
        // Load group info
        const groupData = await groupService.get(data.groupId)
        setGroup(groupData)
      }
    } catch (error) {
      console.error('Error loading workout:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateSet = (exerciseIndex, setIndex, updates) => {
    setWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, ei) =>
        ei === exerciseIndex
          ? {
              ...ex,
              sets: ex.sets.map((set, si) =>
                si === setIndex ? { ...set, ...updates } : set
              )
            }
          : ex
      )
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await groupWorkoutService.complete(id, {
        exercises: workout.exercises
      })
      navigate(-1)
    } catch (error) {
      console.error('Error saving workout:', error)
      alert('Failed to save workout')
    } finally {
      setSaving(false)
    }
  }

  const safeFormatDate = (date) => {
    if (!date) return ''
    try {
      const dateObj = date?.toDate ? date.toDate() : new Date(date)
      if (isNaN(dateObj.getTime())) return ''
      return format(dateObj, 'EEEE, MMMM d')
    } catch {
      return ''
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-flame-500 animate-spin" />
      </div>
    )
  }

  if (!workout) {
    return (
      <div className="text-center py-12">
        <p className="text-iron-400">Workout not found</p>
      </div>
    )
  }

  const isCompleted = workout.status === 'completed'
  const isOwner = workout.assignedTo === user?.uid

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-iron-400 hover:text-iron-100 hover:bg-iron-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl text-iron-50">{workout.name}</h1>
            {isCompleted && (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                Completed
              </span>
            )}
          </div>
          <p className="text-iron-400 text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            {group?.name} · {safeFormatDate(workout.date)}
          </p>
        </div>
      </div>

      {/* Exercises */}
      <div className="space-y-4">
        {workout.exercises?.map((exercise, exerciseIndex) => (
          <div key={exerciseIndex} className="card-steel rounded-xl overflow-hidden">
            <div className="p-4 border-b border-iron-800">
              <h3 className="font-medium text-iron-100 text-lg">{exercise.name}</h3>
            </div>

            <div className="p-4">
              {/* Mobile-friendly set logging */}
              <div className="space-y-4">
                {exercise.sets?.map((set, setIndex) => (
                  <div key={setIndex} className="bg-iron-800/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-iron-300 font-medium">Set {setIndex + 1}</span>
                      <span className="text-xs text-iron-500">
                        Target: {set.prescribedWeight}lbs × {set.prescribedReps}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-flame-400 mb-1">Actual Weight</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={set.actualWeight || ''}
                          onChange={(e) => updateSet(exerciseIndex, setIndex, { actualWeight: e.target.value })}
                          placeholder={set.prescribedWeight || 'lbs'}
                          disabled={!isOwner}
                          className="w-full input-field text-base py-3 px-4 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-flame-400 mb-1">Actual Reps</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={set.actualReps || ''}
                          onChange={(e) => updateSet(exerciseIndex, setIndex, { actualReps: e.target.value })}
                          placeholder={set.prescribedReps || 'reps'}
                          disabled={!isOwner}
                          className="w-full input-field text-base py-3 px-4 disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-iron-500 mb-1 flex items-center gap-1">
                          RPE
                          <button
                            onClick={() => setRpeModalOpen(true)}
                            className="text-flame-400"
                          >
                            <Info className="w-3 h-3" />
                          </button>
                        </label>
                        <select
                          value={set.rpe || ''}
                          onChange={(e) => updateSet(exerciseIndex, setIndex, { rpe: e.target.value })}
                          disabled={!isOwner}
                          className="input-field text-base py-3 px-4 w-full disabled:opacity-50"
                        >
                          <option value="">—</option>
                          {[5, 6, 7, 8, 9, 10].map((val) => (
                            <option key={val} value={val}>{val}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-iron-500 mb-1">Pain Level</label>
                        <select
                          value={set.painLevel || 0}
                          onChange={(e) => updateSet(exerciseIndex, setIndex, { painLevel: parseInt(e.target.value) })}
                          disabled={!isOwner}
                          className="input-field text-base py-3 px-4 w-full disabled:opacity-50"
                        >
                          {PAIN_LEVELS.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Save Button */}
      {isOwner && !isCompleted && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/90 backdrop-blur-sm border-t border-iron-800 lg:static lg:bg-transparent lg:border-0 lg:p-0 lg:mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Complete Workout
              </>
            )}
          </button>
        </div>
      )}

      {/* RPE Info Modal */}
      {rpeModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-iron-900 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-iron-100">RPE Scale</h3>
              <button
                onClick={() => setRpeModalOpen(false)}
                className="p-2 text-iron-400 hover:text-iron-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-iron-400 text-sm mb-4">
              Rate of Perceived Exertion - how hard did the set feel?
            </p>
            <div className="space-y-2">
              {[
                { value: 10, label: 'Max effort - could not do more' },
                { value: 9, label: 'Very hard - 1 rep left' },
                { value: 8, label: 'Hard - 2 reps left' },
                { value: 7, label: 'Challenging - 3 reps left' },
                { value: 6, label: 'Moderate - 4+ reps left' },
                { value: 5, label: 'Easy - warm-up weight' },
              ].map(({ value, label }) => (
                <div key={value} className="flex items-center gap-3 text-sm">
                  <span className="w-8 h-8 rounded-lg bg-flame-500/20 text-flame-400 flex items-center justify-center font-medium">
                    {value}
                  </span>
                  <span className="text-iron-300">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
