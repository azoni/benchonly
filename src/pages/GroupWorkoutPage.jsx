import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Users,
  Check,
  Loader2,
  Info,
  X,
  Play,
  Calendar,
  MessageSquare,
  Pencil,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  Brain,
  Sparkles,
  AlertCircle,
  ThumbsUp,
  Eye,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { groupWorkoutService, groupService } from '../services/firestore'
import { getDisplayDate } from '../utils/dateUtils'
import usePageTitle from '../utils/usePageTitle'

// Calculate estimated 1RM using Epley formula
const calculateE1RM = (weight, reps) => {
  if (!weight || !reps || reps < 1) return null
  if (reps === 1) return weight
  if (reps > 30) return null
  return Math.round(weight * (1 + reps / 30))
}

// Determine exercise type from data
const getExerciseType = (exercise) => {
  if (exercise.type) return exercise.type
  const sets = exercise.sets || []
  if (sets.some(s => s.prescribedTime || s.actualTime)) return 'time'
  const hasWeight = sets.some(s => s.prescribedWeight || s.actualWeight)
  if (!hasWeight && sets.some(s => s.prescribedReps || s.actualReps)) return 'bodyweight'
  return 'weight'
}

// Get type label and color
const getTypeTag = (type) => {
  switch (type) {
    case 'time': return { label: 'Time', color: 'bg-blue-500/20 text-blue-400' }
    case 'bodyweight': return { label: 'BW', color: 'bg-emerald-500/20 text-emerald-400' }
    default: return null
  }
}

export default function GroupWorkoutPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  usePageTitle('Group Workout')
  const { user } = useAuth()
  const [workout, setWorkout] = useState(null)
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  const [exercises, setExercises] = useState([])
  const [workoutNotes, setWorkoutNotes] = useState('')
  const [personalNotes, setPersonalNotes] = useState('')
  const [rpeModalOpen, setRpeModalOpen] = useState(false)
  const [aiNotesExpanded, setAiNotesExpanded] = useState(false)

  console.log('[DEBUG] GroupWorkoutPage mounted, id:', id, 'URL:', window.location.pathname);

  useEffect(() => {
    loadWorkout()
  }, [id])

  const loadWorkout = async () => {
    try {
      const data = await groupWorkoutService.get(id)
      if (data) {
        setWorkout(data)
        setWorkoutNotes(data.notes || '')
        setPersonalNotes(data.personalNotes || '')
        if (data.exercises) {
          setExercises(data.exercises.map(ex => ({
            ...ex,
            type: getExerciseType(ex),
            notes: ex.notes || '',
            sets: ex.sets?.map(set => ({ ...set })) || []
          })))
        }
        const groupData = await groupService.get(data.groupId)
        setGroup(groupData)
      }
    } catch (error) {
      console.error('Error loading workout:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (location.state?.from) {
      navigate(location.state.from, { state: location.state?.backState })
    } else if (workout?.groupId) {
      navigate(`/groups/${workout.groupId}`, { state: { activeTab: 'workouts' } })
    } else {
      navigate(-1)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this workout? This cannot be undone.')) return
    try {
      await groupWorkoutService.delete(id)
      if (workout?.groupId) {
        navigate(`/groups/${workout.groupId}`, { state: { activeTab: 'workouts' } })
      } else {
        navigate(-1)
      }
    } catch (error) {
      console.error('Error deleting workout:', error)
      alert('Failed to delete workout')
    }
  }

  const updateSet = (exerciseIndex, setIndex, field, value) => {
    setExercises(prev => {
      const newExercises = [...prev]
      newExercises[exerciseIndex] = {
        ...newExercises[exerciseIndex],
        sets: newExercises[exerciseIndex].sets.map((set, i) =>
          i === setIndex ? { ...set, [field]: value } : set
        )
      }
      return newExercises
    })
  }

  const updateExerciseNotes = (exerciseIndex, userNotes) => {
    setExercises(prev => {
      const newExercises = [...prev]
      newExercises[exerciseIndex] = { ...newExercises[exerciseIndex], userNotes }
      return newExercises
    })
  }

  const addSet = (exerciseIndex) => {
    setExercises(prev => {
      const newExercises = [...prev]
      const exercise = newExercises[exerciseIndex]
      const lastSet = exercise.sets[exercise.sets.length - 1]
      const type = exercise.type || 'weight'

      let newSet = {
        id: Date.now() + Math.random(),
        rpe: '',
        painLevel: 0,
        completed: false,
      }

      if (type === 'time') {
        newSet = { ...newSet, prescribedTime: lastSet?.prescribedTime || '', actualTime: '' }
      } else if (type === 'bodyweight') {
        newSet = { ...newSet, prescribedReps: lastSet?.prescribedReps || '', actualReps: '' }
      } else {
        newSet = {
          ...newSet,
          prescribedWeight: lastSet?.prescribedWeight || '',
          prescribedReps: lastSet?.prescribedReps || '',
          actualWeight: '',
          actualReps: '',
        }
      }

      newExercises[exerciseIndex] = { ...exercise, sets: [...exercise.sets, newSet] }
      return newExercises
    })
  }

  const removeSet = (exerciseIndex, setIndex) => {
    setExercises(prev => {
      const newExercises = [...prev]
      const exercise = newExercises[exerciseIndex]
      if (exercise.sets.length <= 1) return prev
      newExercises[exerciseIndex] = {
        ...exercise,
        sets: exercise.sets.filter((_, i) => i !== setIndex),
      }
      return newExercises
    })
  }

  // Build save payload preserving ALL notes fields
  const buildSavePayload = (exerciseData) => {
    const payload = {
      exercises: exerciseData,
      notes: workoutNotes,
      personalNotes,
    }
    if (workout.coachingNotes) payload.coachingNotes = workout.coachingNotes
    if (workout.description) payload.description = workout.description
    return payload
  }

  const handleSaveProgress = async () => {
    setSaving(true)
    try {
      const payload = buildSavePayload(exercises)
      await groupWorkoutService.update(id, payload)
      setWorkout(prev => ({ ...prev, ...payload }))
      setIsLogging(false)
    } catch (error) {
      console.error('Error saving workout:', error)
      alert('Failed to save workout')
    } finally {
      setSaving(false)
    }
  }

  const handleComplete = async () => {
    setSaving(true)
    try {
      const filledExercises = exercises.map(ex => {
        const type = ex.type || getExerciseType(ex)
        return {
          ...ex,
          sets: ex.sets.map(set => {
            if (type === 'time') {
              return { ...set, actualTime: set.actualTime || set.prescribedTime || '' }
            }
            if (type === 'bodyweight') {
              return { ...set, actualReps: set.actualReps || set.prescribedReps || '' }
            }
            return {
              ...set,
              actualWeight: set.actualWeight || set.prescribedWeight || '',
              actualReps: set.actualReps || set.prescribedReps || '',
            }
          })
        }
      })
      const payload = buildSavePayload(filledExercises)
      
      // If athlete is re-completing a coach-logged workout, mark as 'edited'
      const wasCoachCompleted = workout.completedBy && workout.completedBy !== workout.assignedTo
      if (wasCoachCompleted && user.uid === workout.assignedTo) {
        payload.reviewStatus = 'edited'
        payload.reviewedAt = new Date()
      }
      
      await groupWorkoutService.complete(id, payload, user.uid, workout.assignedTo)
      setWorkout(prev => ({ 
        ...prev, 
        ...payload, 
        status: 'completed',
        completedBy: user.uid !== workout.assignedTo ? user.uid : undefined,
        reviewStatus: user.uid !== workout.assignedTo ? 'pending' : 'self',
      }))
      setExercises(filledExercises)
      setIsLogging(false)
    } catch (error) {
      console.error('Error completing workout:', error)
      alert('Failed to complete workout')
    } finally {
      setSaving(false)
    }
  }

  const handleApproveReview = async () => {
    setSaving(true)
    try {
      await groupWorkoutService.approveReview(id)
      setWorkout(prev => ({ ...prev, reviewStatus: 'approved' }))
    } catch (error) {
      console.error('Error approving review:', error)
      alert('Failed to approve')
    } finally {
      setSaving(false)
    }
  }

  const handleEditReview = () => {
    // Enter logging mode so athlete can make changes, then re-complete
    setIsLogging(true)
  }

  const safeFormatDate = (date) => {
    if (!date) return ''
    try {
      const dateObj = getDisplayDate(date)
      if (isNaN(dateObj.getTime())) return ''
      return format(dateObj, 'EEEE, MMM d')
    } catch {
      return ''
    }
  }

  const handleMarkIncomplete = async () => {
    if (!confirm('Mark this workout as incomplete? It will go back to scheduled status.')) return
    try {
      await groupWorkoutService.update(id, { status: 'scheduled', completedAt: null })
      setWorkout(prev => ({ ...prev, status: 'scheduled', completedAt: null }))
    } catch (error) {
      console.error('Error marking incomplete:', error)
      alert('Failed to update workout status')
    }
  }

  const getRPEColor = (rpe) => {
    if (rpe >= 9) return 'text-red-400'
    if (rpe >= 7) return 'text-yellow-400'
    return 'text-green-400'
  }

  const getPainColor = (pain) => {
    if (pain >= 7) return 'bg-red-500/20 text-red-400'
    if (pain >= 4) return 'bg-yellow-500/20 text-yellow-400'
    return 'bg-green-500/20 text-green-400'
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
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 bg-iron-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-iron-600" />
        </div>
        <h2 className="text-xl font-display text-iron-200 mb-2">Workout Not Found</h2>
        <p className="text-iron-500 mb-6">This workout may have been deleted or you don't have access.</p>
        <button onClick={handleBack} className="btn-primary">Go Back</button>
      </div>
    )
  }

  const isCompleted = workout.status === 'completed'
  const isOwner = workout.assignedTo === user?.uid
  const isAdmin = group?.admins?.includes(user?.uid)
  const canLog = isOwner || isAdmin
  const hasAiNotes = workout.coachingNotes || workout.personalNotes || workout.description
  const needsReview = isOwner && workout.reviewStatus === 'pending' && workout.completedBy
  const wasApproved = workout.reviewStatus === 'approved'
  const wasEditedByAthlete = workout.reviewStatus === 'edited'

  // ============ VIEW MODE ============
  if (!isLogging) {
    return (
      <div className="max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-iron-950/95 backdrop-blur-sm border-b border-iron-800 -mx-4 px-4 py-3 mb-6">
          <div className="flex items-center justify-between">
            <button onClick={handleBack} className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button 
                  onClick={handleDelete}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Delete workout"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-sm font-medium">Group</span>
              {isCompleted ? (
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">Completed</span>
              ) : (
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">Assigned</span>
              )}
              {needsReview && (
                <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium animate-pulse">Review</span>
              )}
            </div>
          </div>
        </div>

        {/* Workout Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-display text-iron-50 mb-2">{workout.name}</h1>
          {workout.description && (
            <p className="text-iron-400 mb-2">{workout.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-iron-400">
              <Calendar className="w-4 h-4 text-flame-400" />
              <span>{safeFormatDate(workout.date)}</span>
            </div>
            <div className="flex items-center gap-2 text-iron-400">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>{group?.name || 'Group Workout'}</span>
            </div>
            {workout.generatedByAI && (
              <div className="flex items-center gap-1.5 text-iron-500">
                <Sparkles className="w-3.5 h-3.5 text-flame-400" />
                <span>AI Generated</span>
              </div>
            )}
          </div>
        </div>

        {/* Info Messages */}
        {!isOwner && !isAdmin && (
          <div className="card-steel p-4 mb-6 border-iron-700">
            <p className="text-sm text-iron-400">This workout was assigned to another member. You can view but not edit.</p>
          </div>
        )}
        {!isOwner && isAdmin && (
          <div className="card-steel p-4 mb-6 border-cyan-500/30 bg-cyan-500/5">
            <p className="text-sm text-cyan-400">You're viewing as admin. You can log this workout on behalf of the member.</p>
          </div>
        )}

        {/* Review Banner - shown to athlete when coach completed for them */}
        {needsReview && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Eye className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-amber-300">Review Required</h3>
                  <p className="text-sm text-iron-400 mt-1">
                    Your coach logged this workout for you. Review the results and either approve or make changes.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleApproveReview}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
                >
                  <ThumbsUp className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={handleEditReview}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-iron-800 hover:bg-iron-700 text-iron-300 rounded-lg text-sm font-medium transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  Edit & Fix
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Approved/Edited Badge */}
        {isOwner && (wasApproved || wasEditedByAthlete) && (
          <div className={`card-steel p-3 mb-6 flex items-center gap-2 ${
            wasApproved ? 'border-green-500/20 bg-green-500/5' : 'border-blue-500/20 bg-blue-500/5'
          }`}>
            <Check className={`w-4 h-4 ${wasApproved ? 'text-green-400' : 'text-blue-400'}`} />
            <p className={`text-sm ${wasApproved ? 'text-green-400' : 'text-blue-400'}`}>
              {wasApproved ? 'You approved this workout logged by your coach.' : 'You edited and updated this workout.'}
            </p>
          </div>
        )}

        {/* AI Coaching Notes — collapsible */}
        {hasAiNotes && (
          <div className="card-steel mb-6 overflow-hidden">
            <button
              onClick={() => setAiNotesExpanded(!aiNotesExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-iron-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-flame-400" />
                <span className="text-sm font-medium text-iron-200">AI Coaching Notes</span>
              </div>
              {aiNotesExpanded ? <ChevronUp className="w-4 h-4 text-iron-500" /> : <ChevronDown className="w-4 h-4 text-iron-500" />}
            </button>
            <AnimatePresence>
              {aiNotesExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 max-h-64 overflow-y-auto space-y-3">
                    {workout.coachingNotes && (
                      <div>
                        <p className="text-xs text-iron-500 uppercase tracking-wider mb-1">Coaching Notes</p>
                        <p className="text-sm text-iron-300 leading-relaxed">{workout.coachingNotes}</p>
                      </div>
                    )}
                    {workout.personalNotes && (
                      <div>
                        <p className="text-xs text-iron-500 uppercase tracking-wider mb-1">Your Notes</p>
                        <p className="text-sm text-iron-300 leading-relaxed">{workout.personalNotes}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* User workout notes */}
        {workout.notes && (
          <div className="card-steel p-4 mb-6">
            <p className="text-iron-300 text-sm">{workout.notes}</p>
          </div>
        )}

        {/* Exercises */}
        <div className="space-y-4">
          {workout.exercises?.map((exercise, exerciseIndex) => {
            const type = getExerciseType(exercise)
            const typeTag = getTypeTag(type)
            
            return (
            <div key={exerciseIndex} className="card-steel overflow-hidden">
              <div className="p-4 border-b border-iron-800">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold text-iron-50">{exercise.name}</h3>
                  {typeTag && (
                    <span className={`px-2 py-0.5 text-xs rounded ${typeTag.color}`}>{typeTag.label}</span>
                  )}
                </div>
                <p className="text-sm text-iron-500 mt-1">{exercise.sets?.length || 0} sets</p>
              </div>
              <div className="divide-y divide-iron-800/50">
                {exercise.sets?.map((set, setIndex) => {
                  const hasActual = type === 'time' 
                    ? set.actualTime 
                    : type === 'bodyweight'
                      ? set.actualReps
                      : (set.actualWeight || set.actualReps)
                  const e1rm = type === 'weight' && hasActual && set.actualWeight && set.actualReps && parseInt(set.actualReps) > 1
                    ? calculateE1RM(parseFloat(set.actualWeight), parseInt(set.actualReps))
                    : null
                  return (
                    <div key={setIndex} className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-iron-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-lg font-bold text-iron-400">{setIndex + 1}</span>
                        </div>
                        <div className="flex-1">
                          {type === 'time' ? (
                            !isCompleted ? (
                              <div className="text-2xl font-bold text-iron-100">{set.prescribedTime || '—'} seconds</div>
                            ) : (
                              <>
                                <div className="text-sm text-iron-500 mb-1">Target: {set.prescribedTime || '—'}s</div>
                                {hasActual ? (
                                  <span className="text-2xl font-bold text-flame-400">{set.actualTime || '—'} seconds</span>
                                ) : (
                                  <span className="text-lg text-iron-600">Not logged</span>
                                )}
                              </>
                            )
                          ) : type === 'bodyweight' ? (
                            !isCompleted ? (
                              <div className="text-2xl font-bold text-iron-100">{set.prescribedReps || '—'} reps</div>
                            ) : (
                              <>
                                <div className="text-sm text-iron-500 mb-1">Target: {set.prescribedReps || '—'} reps</div>
                                {hasActual ? (
                                  <span className="text-2xl font-bold text-flame-400">{set.actualReps || '—'} reps</span>
                                ) : (
                                  <span className="text-lg text-iron-600">Not logged</span>
                                )}
                              </>
                            )
                          ) : !isCompleted ? (
                            <span className="text-2xl font-bold text-iron-100">
                              {set.prescribedWeight || '—'} lbs × {set.prescribedReps || '—'}
                            </span>
                          ) : (
                            <>
                              <div className="text-sm text-iron-500 mb-1">
                                Target: {set.prescribedWeight || '—'} lbs × {set.prescribedReps || '—'} reps
                              </div>
                              {hasActual ? (
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="text-2xl font-bold text-flame-400">
                                    {set.actualWeight || '—'} lbs × {set.actualReps || '—'}
                                  </span>
                                  {e1rm && (
                                    <span className="text-sm text-iron-500 bg-iron-800 px-2 py-1 rounded-lg">e1RM: {e1rm} lbs</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-lg text-iron-600">Not logged</span>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {set.targetRpe && !set.rpe && (
                            <span className="text-xs text-iron-500">Target RPE {set.targetRpe}</span>
                          )}
                          {set.rpe && <span className={`text-sm font-semibold ${getRPEColor(set.rpe)}`}>RPE {set.rpe}</span>}
                          {set.painLevel > 0 && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPainColor(set.painLevel)}`}>Pain {set.painLevel}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {exercise.notes && (
                <div className="px-4 pb-4">
                  <div className="flex items-start gap-2 bg-iron-800/30 rounded-lg p-3">
                    <MessageSquare className="w-4 h-4 text-iron-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-iron-400">{exercise.notes}</p>
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>

        {(!workout.exercises || workout.exercises.length === 0) && (
          <div className="card-steel p-8 text-center">
            <Users className="w-12 h-12 text-iron-700 mx-auto mb-3" />
            <p className="text-iron-500">No exercises in this workout</p>
          </div>
        )}

        {/* Action Button */}
        {canLog && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800">
            <button
              onClick={() => setIsLogging(true)}
              className={`w-full py-4 text-lg flex items-center justify-center gap-2 ${isCompleted ? 'btn-secondary' : 'btn-primary'}`}
            >
              {isCompleted ? <Pencil className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              {isCompleted ? 'Edit Logged Data' : 'Log This Workout'}
            </button>
            {isCompleted && (
              <button
                onClick={handleMarkIncomplete}
                className="w-full mt-2 py-2 text-xs text-iron-500 hover:text-iron-300 transition-colors"
              >
                Mark as incomplete
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ============ LOG MODE ============
  return (
    <div className="max-w-2xl mx-auto pb-36">
      <div className="sticky top-0 z-10 bg-iron-950/95 backdrop-blur-sm border-b border-iron-800 -mx-4 px-4 py-3 mb-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setIsLogging(false)} className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <h1 className="font-display text-lg text-iron-100">{isCompleted ? 'Edit Log' : 'Log Workout'}</h1>
          <button onClick={() => setRpeModalOpen(true)} className="p-2 text-iron-400 hover:text-iron-200 transition-colors">
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* AI Notes — collapsed by default in log mode, scrollable */}
      {hasAiNotes && (
        <div className="card-steel mb-4 overflow-hidden">
          <button
            onClick={() => setAiNotesExpanded(!aiNotesExpanded)}
            className="w-full flex items-center justify-between p-3 hover:bg-iron-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-flame-400" />
              <span className="text-sm font-medium text-iron-300">AI Coaching Notes</span>
            </div>
            {aiNotesExpanded ? <ChevronUp className="w-4 h-4 text-iron-500" /> : <ChevronDown className="w-4 h-4 text-iron-500" />}
          </button>
          <AnimatePresence>
            {aiNotesExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 max-h-48 overflow-y-auto space-y-2">
                  {workout.coachingNotes && (
                    <div>
                      <p className="text-xs text-iron-500 uppercase tracking-wider mb-1">Coaching</p>
                      <p className="text-xs text-iron-400 leading-relaxed">{workout.coachingNotes}</p>
                    </div>
                  )}
                  {workout.personalNotes && (
                    <div>
                      <p className="text-xs text-iron-500 uppercase tracking-wider mb-1">For You</p>
                      <p className="text-xs text-iron-400 leading-relaxed">{workout.personalNotes}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Workout Notes */}
      <div className="card-steel p-4 mb-4">
        <label className="block text-sm text-iron-400 mb-2">Workout Notes</label>
        <textarea
          value={workoutNotes}
          onChange={(e) => setWorkoutNotes(e.target.value)}
          placeholder="How did the workout go?"
          rows={2}
          className="w-full input-field text-sm resize-none"
        />
      </div>

      {/* Exercises */}
      <div className="space-y-4">
        {exercises.map((exercise, exerciseIndex) => {
          const type = exercise.type || getExerciseType(exercise)
          const typeTag = getTypeTag(type)
          
          return (
          <div key={exerciseIndex} className="card-steel p-3">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-iron-100 text-lg flex-1">{exercise.name}</h3>
              {typeTag && (
                <span className={`px-2 py-0.5 text-xs rounded ${typeTag.color}`}>{typeTag.label}</span>
              )}
            </div>

            {/* Coach Notes (read-only) */}
            {exercise.notes && (
              <div className="mb-3 bg-iron-800/30 rounded-lg p-2.5">
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-iron-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-iron-400 leading-relaxed">{exercise.notes}</p>
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              {exercise.sets?.map((set, setIndex) => {
                const isFilled = type === 'time' ? !!set.actualTime : type === 'bodyweight' ? !!set.actualReps : !!(set.actualWeight && set.actualReps)
                return (
                <div key={setIndex} className={`rounded-xl p-3 ${isFilled ? 'bg-green-900/10 border border-green-500/15' : 'bg-iron-800/30'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-base font-medium ${isFilled ? 'text-green-400' : 'text-iron-200'}`}>
                      Set {setIndex + 1} {isFilled && <span className="text-green-400 text-xs">✓</span>}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-iron-500 bg-iron-800 px-2 py-1 rounded">
                        {type === 'time' 
                          ? `${set.prescribedTime || '—'}s`
                          : type === 'bodyweight'
                            ? `${set.prescribedReps || '—'} reps`
                            : `${set.prescribedWeight || '—'} × ${set.prescribedReps || '—'}`
                        }
                        {set.targetRpe ? ` @ RPE ${set.targetRpe}` : ''}
                      </span>
                      {exercise.sets.length > 1 && (
                        <button
                          onClick={() => removeSet(exerciseIndex, setIndex)}
                          className="p-1 text-iron-600 hover:text-red-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Input fields */}
                  {type === 'time' ? (
                    <div className="mb-2">
                      <label className="block text-xs text-flame-400 mb-1 font-medium">Time (seconds)</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={set.actualTime || ''}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualTime', e.target.value)}
                        placeholder={set.prescribedTime || '—'}
                        className="w-full input-field text-lg py-2.5 px-2 text-center font-semibold"
                      />
                    </div>
                  ) : type === 'bodyweight' ? (
                    <div className="mb-2">
                      <label className="block text-xs text-flame-400 mb-1 font-medium">Reps</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={set.actualReps || ''}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualReps', e.target.value)}
                        placeholder={set.prescribedReps || '—'}
                        className="w-full input-field text-lg py-2.5 px-2 text-center font-semibold"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-xs text-flame-400 mb-1 font-medium">Weight</label>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              const cur = parseFloat(set.actualWeight || set.prescribedWeight || 0)
                              if (cur >= 5) updateSet(exerciseIndex, setIndex, 'actualWeight', String(Math.round(cur - 5)))
                            }}
                            className="w-9 h-11 rounded-lg bg-iron-700/80 text-iron-400 hover:text-iron-200 hover:bg-iron-700 active:scale-95 transition-all text-lg font-bold flex-shrink-0 flex items-center justify-center"
                          >−</button>
                          <input
                            type="text"
                            value={set.actualWeight || ''}
                            onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualWeight', e.target.value)}
                            placeholder={set.prescribedWeight || 'lbs'}
                            className="w-full input-field text-lg py-2.5 px-2 text-center font-semibold"
                          />
                          <button
                            onClick={() => {
                              const cur = parseFloat(set.actualWeight || set.prescribedWeight || 0)
                              updateSet(exerciseIndex, setIndex, 'actualWeight', String(Math.round(cur + 5)))
                            }}
                            className="w-9 h-11 rounded-lg bg-iron-700/80 text-iron-400 hover:text-iron-200 hover:bg-iron-700 active:scale-95 transition-all text-lg font-bold flex-shrink-0 flex items-center justify-center"
                          >+</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-flame-400 mb-1 font-medium">Reps</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={set.actualReps || ''}
                          onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualReps', e.target.value)}
                          placeholder={set.prescribedReps || '—'}
                          className="w-full input-field text-lg py-2.5 px-2 text-center font-semibold"
                        />
                      </div>
                    </div>
                  )}

                  {/* RPE & Pain pills */}
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-iron-500 uppercase tracking-wider w-6">RPE</label>
                      {[7, 8, 9, 10].map(v => (
                        <button
                          key={v}
                          onClick={() => updateSet(exerciseIndex, setIndex, 'rpe', set.rpe == v ? '' : String(v))}
                          className={`w-7 h-7 text-xs rounded-md border transition-colors ${
                            set.rpe == v
                              ? 'border-flame-500 bg-flame-500/15 text-flame-400 font-semibold'
                              : 'border-iron-700/60 text-iron-500 hover:border-iron-600'
                          }`}
                        >{v}</button>
                      ))}
                    </div>
                    <div className="w-px h-5 bg-iron-700/50 flex-shrink-0" />
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-iron-500 uppercase tracking-wider w-7">Pain</label>
                      {[1, 2, 3, 4, 5].map(v => (
                        <button
                          key={v}
                          onClick={() => updateSet(exerciseIndex, setIndex, 'painLevel', (set.painLevel || 0) === v ? 0 : v)}
                          className={`w-7 h-7 text-xs rounded-md border transition-colors ${
                            (set.painLevel || 0) === v
                              ? v <= 2 ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400 font-semibold'
                                : 'border-red-500/50 bg-red-500/10 text-red-400 font-semibold'
                              : 'border-iron-700/60 text-iron-500 hover:border-iron-600'
                          }`}
                        >{v}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )})}
            </div>

            {/* Add Set Button */}
            <button
              onClick={() => addSet(exerciseIndex)}
              className="mt-3 w-full py-2.5 border border-dashed border-iron-700 rounded-lg
                text-sm text-flame-400 hover:text-flame-300 hover:border-iron-600
                flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Set
            </button>

            {/* Exercise Notes */}
            <textarea
              value={exercise.userNotes || ''}
              onChange={(e) => updateExerciseNotes(exerciseIndex, e.target.value)}
              placeholder="Your notes..."
              rows={1}
              className="mt-3 w-full input-field text-sm resize-none"
            />
          </div>
        )})}
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800">
        <div className="flex gap-3 mb-3">
          <button onClick={() => setIsLogging(false)} className="btn-secondary flex-1 py-3">Cancel</button>
          <button onClick={handleSaveProgress} disabled={saving} className="btn-secondary flex-1 py-3">Save Progress</button>
        </div>
        <button onClick={handleComplete} disabled={saving} className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2">
          {saving ? 'Saving...' : <><Check className="w-5 h-5" />{
            needsReview ? 'Save Changes' : isCompleted ? 'Update' : 'Complete'
          }</>}
        </button>
        <p className="text-xs text-iron-500 text-center mt-2">
          {needsReview ? 'Your changes will replace coach data' : 'Empty fields filled with targets'}
        </p>
      </div>

      {/* RPE Info Modal */}
      {rpeModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-iron-900 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-iron-100">RPE Scale</h3>
              <button onClick={() => setRpeModalOpen(false)} className="p-2 text-iron-400 hover:text-iron-200"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-iron-400 text-sm mb-4">Rate of Perceived Exertion</p>
            <div className="space-y-2">
              {[
                { value: 10, label: 'Max effort - could not do more' },
                { value: 9, label: 'Very hard - 1 rep left' },
                { value: 8, label: 'Hard - 2 reps left' },
                { value: 7, label: 'Challenging - 3 reps left' },
                { value: 6, label: 'Moderate - 4+ reps left' },
              ].map(({ value, label }) => (
                <div key={value} className="flex items-center gap-3 text-sm">
                  <span className="w-8 h-8 rounded-lg bg-flame-500/20 text-flame-400 flex items-center justify-center font-medium">{value}</span>
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