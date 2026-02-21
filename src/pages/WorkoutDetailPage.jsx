import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Calendar,
  Clock,
  MoreVertical,
  Check,
  Play,
  Flame,
  Activity,
  MapPin,
  X,
  MessageSquare,
  Pencil,
  Dumbbell,
  Target,
  Plus,
  Brain,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
  Loader2,
  HelpCircle,
  Share2,
  Send,
  Search,
  FileText,
  Zap,
} from 'lucide-react'
import { workoutService, sharedWorkoutService } from '../services/firestore'
import { friendService } from '../services/friendService'
import { getAuthHeaders } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { getDisplayDate } from '../utils/dateUtils'
import { ACTIVITY_METS } from '../services/calorieService'
import usePageTitle from '../utils/usePageTitle'
import { apiUrl } from '../utils/platform'
import ExerciseInfoModal from '../components/ExerciseInfoModal'
import WorkoutSummaryCard from '../components/WorkoutSummaryCard'
import { groupExercisesForDisplay } from '../utils/workoutUtils'
import { useUIStore } from '../store'

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

const getTypeTag = (type) => {
  switch (type) {
    case 'time': return { label: 'Time', color: 'bg-blue-500/20 text-blue-400' }
    case 'bodyweight': return { label: 'BW', color: 'bg-emerald-500/20 text-emerald-400' }
    default: return null
  }
}

export default function WorkoutDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  usePageTitle('Workout')
  const { user, isGuest, isAppAdmin } = useAuth()
  const sidebarOpen = useUIStore((s) => s.sidebarOpen)
  const [workout, setWorkout] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showMenu, setShowMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  const [exercises, setExercises] = useState([])
  const [saving, setSaving] = useState(false)
  const [workoutNotes, setWorkoutNotes] = useState('')
  const [workoutUserNotes, setWorkoutUserNotes] = useState('')
  const [rpeModalOpen, setRpeModalOpen] = useState(false)
  const [aiNotesExpanded, setAiNotesExpanded] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [swappingIdx, setSwappingIdx] = useState(null)
  const [swapReasonIdx, setSwapReasonIdx] = useState(null)
  const [swapReason, setSwapReason] = useState('')
  const [infoExercise, setInfoExercise] = useState(null)
  const [infoExerciseIdx, setInfoExerciseIdx] = useState(null)
  const [expandedRpe, setExpandedRpe] = useState({})
  const [openNotes, setOpenNotes] = useState({})
  const [showShareModal, setShowShareModal] = useState(false)
  const [friends, setFriends] = useState([])
  const [friendProfiles, setFriendProfiles] = useState({})
  const [shareSearch, setShareSearch] = useState('')
  const [selectedFriend, setSelectedFriend] = useState(null)
  const [shareMessage, setShareMessage] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editExercises, setEditExercises] = useState([])
  const [editNotes, setEditNotes] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    async function fetchWorkout() {
      if (!id || !user) return
      try {
        let data
        if (isGuest) {
          const { getSampleWorkouts } = await import('../context/AuthContext')
          data = getSampleWorkouts().find(w => w.id === id)
        } else {
          data = await workoutService.getById(id)
        }
        setWorkout(data)
        setWorkoutNotes(data?.notes || '')
        setWorkoutUserNotes(data?.userNotes || '')
        if (data?.exercises) {
          setExercises(data.exercises.map(ex => ({
            ...ex,
            notes: ex.notes || '',
            userNotes: ex.userNotes || '',
            sets: ex.sets?.map(set => ({ ...set })) || []
          })))
        }
      } catch (error) {
        console.error('Error fetching workout:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchWorkout()
  }, [id, user, isGuest])

  // Auto-open share modal from location state (e.g. from WorkoutsPage share button)
  useEffect(() => {
    if (location.state?.openShare && workout && !isGuest) {
      // Clear the state so it doesn't re-trigger on back nav
      window.history.replaceState({}, '')
      setTimeout(() => openShareModal(), 100)
    }
  }, [workout])

  const handleBack = () => {
    if (location.state?.from) {
      navigate(location.state.from)
    } else {
      navigate(-1)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      if (isGuest) {
        navigate('/workouts')
        return
      }
      await workoutService.delete(id)
      navigate('/workouts')
    } catch (error) {
      console.error('Error deleting workout:', error)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const openShareModal = async () => {
    setShowMenu(false)
    setShowShareModal(true)
    setSelectedFriend(null)
    setShareMessage('')
    setShared(false)
    try {
      const friendIds = await friendService.getFriends(user.uid)
      setFriends(friendIds)
      const profiles = {}
      const { getDoc: gd, doc: dc } = await import('firebase/firestore')
      const { db: database } = await import('../services/firebase')
      await Promise.all(friendIds.map(async (fid) => {
        const snap = await gd(dc(database, 'users', fid))
        if (snap.exists()) profiles[fid] = snap.data()
      }))
      setFriendProfiles(profiles)
    } catch (err) {
      console.error('Error loading friends:', err)
    }
  }

  const handleShare = async () => {
    if (!selectedFriend || !workout || sharing) return
    setSharing(true)
    try {
      const recipientName = friendProfiles[selectedFriend]?.displayName || ''
      await sharedWorkoutService.share(
        user.uid,
        user.displayName || 'Someone',
        selectedFriend,
        workout,
        shareMessage,
        recipientName
      )
      setShared(true)
      setTimeout(() => setShowShareModal(false), 1500)
    } catch (err) {
      console.error('Share error:', err)
    } finally {
      setSharing(false)
    }
  }

  // Admin edit helpers
  const startEditing = () => {
    setEditExercises(workout.exercises.map(ex => ({
      ...ex,
      sets: ex.sets?.map(s => ({ ...s })) || []
    })))
    setEditNotes(workout.notes || '')
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditExercises([])
    setEditNotes('')
  }

  const saveEdits = async () => {
    setSavingEdit(true)
    try {
      await workoutService.update(id, { exercises: editExercises, notes: editNotes })
      setWorkout(prev => ({ ...prev, exercises: editExercises, notes: editNotes }))
      setIsEditing(false)
    } catch (err) {
      console.error('Error saving edits:', err)
      alert('Failed to save edits')
    } finally {
      setSavingEdit(false)
    }
  }

  const editUpdateExercise = (exIdx, field, value) => {
    setEditExercises(prev => prev.map((ex, i) => i === exIdx ? { ...ex, [field]: value } : ex))
  }

  const editUpdateSet = (exIdx, setIdx, field, value) => {
    setEditExercises(prev => prev.map((ex, i) => i === exIdx ? {
      ...ex,
      sets: ex.sets.map((s, j) => j === setIdx ? { ...s, [field]: value } : s)
    } : ex))
  }

  const editAddSet = (exIdx) => {
    setEditExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex
      const lastSet = ex.sets[ex.sets.length - 1] || {}
      const type = getExerciseType(ex)
      let newSet = { id: Date.now(), rpe: '', painLevel: 0, completed: false }
      if (type === 'time') newSet = { ...newSet, prescribedTime: lastSet.prescribedTime || '', actualTime: '' }
      else if (type === 'bodyweight') newSet = { ...newSet, prescribedReps: lastSet.prescribedReps || '', actualReps: '' }
      else newSet = { ...newSet, prescribedWeight: lastSet.prescribedWeight || '', prescribedReps: lastSet.prescribedReps || '', actualWeight: '', actualReps: '' }
      return { ...ex, sets: [...ex.sets, newSet] }
    }))
  }

  const editRemoveSet = (exIdx, setIdx) => {
    setEditExercises(prev => prev.map((ex, i) => {
      if (i !== exIdx || ex.sets.length <= 1) return ex
      return { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) }
    }))
  }

  const editRemoveExercise = (exIdx) => {
    setEditExercises(prev => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== exIdx)
    })
  }

  const swapExercise = async (exIdx, reason) => {
    const ex = workout.exercises[exIdx]
    if (!ex || isGuest) return
    setSwappingIdx(exIdx)
    try {
      const otherExercises = workout.exercises
        .filter((_, i) => i !== exIdx)
        .map(e => e.name)

      const swapHeaders = await getAuthHeaders()
      const response = await fetch(apiUrl('swap-exercise'), {
        method: 'POST',
        headers: swapHeaders,
        body: JSON.stringify({
          exerciseName: ex.name,
          exerciseType: ex.type || 'weight',
          sets: ex.sets,
          workoutContext: { otherExercises },
          ...(reason ? { reason } : {}),
        }),
      })

      if (!response.ok) throw new Error('Swap failed')
      const data = await response.json()

      if (data.exercise) {
        const newExercises = workout.exercises.map((e, i) => i === exIdx ? {
          ...data.exercise,
          type: data.exercise.type || e.type || 'weight',
        } : e)
        
        await workoutService.update(id, { exercises: newExercises })
        setWorkout(prev => ({ ...prev, exercises: newExercises }))
        setExercises(newExercises.map(ex => ({
          ...ex,
          notes: ex.notes || '',
          sets: ex.sets?.map(set => ({ ...set })) || []
        })))
      }
    } catch (err) {
      console.error('Swap error:', err)
    } finally {
      setSwappingIdx(null)
    }
  }

  const swapToSubstitution = async (exIdx, substitutionName) => {
    const ex = isLogging ? exercises[exIdx] : workout?.exercises?.[exIdx]
    if (!ex || isGuest) return
    setSwappingIdx(exIdx)
    setInfoExercise(null)
    setInfoExerciseIdx(null)
    try {
      const otherExercises = (isLogging ? exercises : workout.exercises)
        .filter((_, i) => i !== exIdx)
        .map(e => e.name)

      const swapHeaders = await getAuthHeaders()
      const response = await fetch(apiUrl('swap-exercise'), {
        method: 'POST',
        headers: swapHeaders,
        body: JSON.stringify({
          exerciseName: ex.name,
          exerciseType: ex.type || 'weight',
          sets: ex.sets,
          workoutContext: { otherExercises },
          preferredReplacement: substitutionName,
        }),
      })

      if (!response.ok) throw new Error('Swap failed')
      const data = await response.json()

      if (data.exercise) {
        const newExercises = (isLogging ? exercises : workout.exercises).map((e, i) => i === exIdx ? {
          ...data.exercise,
          type: data.exercise.type || e.type || 'weight',
        } : e)

        await workoutService.update(id, { exercises: newExercises })
        setWorkout(prev => ({ ...prev, exercises: newExercises }))
        if (isLogging) {
          setExercises(newExercises.map(e => ({
            ...e,
            notes: e.notes || '',
            sets: e.sets?.map(set => ({ ...set })) || []
          })))
        }
      }
    } catch (err) {
      console.error('Substitution swap error:', err)
    } finally {
      setSwappingIdx(null)
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

  const updateExerciseNotes = (exerciseIndex, notes) => {
    setExercises(prev => {
      const newExercises = [...prev]
      newExercises[exerciseIndex] = { ...newExercises[exerciseIndex], notes }
      return newExercises
    })
  }

  const updateExerciseUserNotes = (exerciseIndex, userNotes) => {
    setExercises(prev => {
      const newExercises = [...prev]
      newExercises[exerciseIndex] = { ...newExercises[exerciseIndex], userNotes }
      return newExercises
    })
  }

  const updateExerciseField = (exerciseIndex, field, value) => {
    setExercises(prev => {
      const newExercises = [...prev]
      newExercises[exerciseIndex] = { ...newExercises[exerciseIndex], [field]: value }
      return newExercises
    })
  }

  const addSet = (exerciseIndex) => {
    setExercises(prev => {
      const newExercises = [...prev]
      const exercise = newExercises[exerciseIndex]
      const supersetGroup = exercise?.supersetGroup

      // Collect indices to update (this exercise + superset partner)
      const indices = [exerciseIndex]
      if (supersetGroup != null) {
        newExercises.forEach((ex, i) => {
          if (i !== exerciseIndex && ex.supersetGroup === supersetGroup) indices.push(i)
        })
      }

      indices.forEach(idx => {
        const ex = newExercises[idx]
        const lastSet = ex.sets[ex.sets.length - 1]
        const type = getExerciseType(ex)

        let newSet = { rpe: '', painLevel: 0, completed: false }
        if (type === 'time') {
          newSet = { ...newSet, prescribedTime: lastSet?.prescribedTime || '', actualTime: '' }
        } else if (type === 'bodyweight') {
          newSet = { ...newSet, prescribedReps: lastSet?.prescribedReps || '', actualReps: '' }
        } else {
          newSet = {
            ...newSet,
            prescribedWeight: lastSet?.prescribedWeight || '',
            prescribedReps: lastSet?.prescribedReps || '',
            actualWeight: '', actualReps: '',
          }
        }
        newExercises[idx] = { ...ex, sets: [...ex.sets, newSet] }
      })

      return newExercises
    })
  }

  const removeSet = (exerciseIndex, setIndex) => {
    setExercises(prev => {
      const newExercises = [...prev]
      const exercise = newExercises[exerciseIndex]
      if (exercise.sets.length <= 1) return prev
      const supersetGroup = exercise?.supersetGroup

      // Remove from this exercise
      newExercises[exerciseIndex] = {
        ...exercise,
        sets: exercise.sets.filter((_, i) => i !== setIndex),
      }
      // Sync partner
      if (supersetGroup != null) {
        newExercises.forEach((ex, i) => {
          if (i !== exerciseIndex && ex.supersetGroup === supersetGroup) {
            newExercises[i] = { ...ex, sets: ex.sets.filter((_, si) => si !== setIndex) }
          }
        })
      }
      return newExercises
    })
  }

  const removeExercise = (exerciseIndex) => {
    setExercises(prev => {
      if (prev.length <= 1) return prev
      const exercise = prev[exerciseIndex]
      // If superset, remove both exercises in the pair
      if (exercise?.supersetGroup != null) {
        return prev.filter(ex => ex.supersetGroup !== exercise.supersetGroup)
      }
      return prev.filter((_, i) => i !== exerciseIndex)
    })
  }

  // Build save payload preserving AI-generated fields
  const buildSavePayload = (exerciseData) => {
    const payload = { exercises: exerciseData, notes: workoutNotes, userNotes: workoutUserNotes }
    if (workout?.coachingNotes) payload.coachingNotes = workout.coachingNotes
    if (workout?.personalNotes) payload.personalNotes = workout.personalNotes
    if (workout?.description) payload.description = workout.description
    return payload
  }

  const handleSaveProgress = async () => {
    setSaving(true)
    try {
      const payload = buildSavePayload(exercises)
      if (!isGuest) {
        await workoutService.update(id, payload)
      }
      setWorkout(prev => ({ ...prev, ...payload }))
      setIsLogging(false)
    } catch (error) {
      console.error('Error saving:', error)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleComplete = async () => {
    setSaving(true)
    try {
      // Auto-fill blank fields with prescribed values
      const filledExercises = exercises.map(ex => {
        const type = getExerciseType(ex)
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
              actualReps: set.actualReps || set.prescribedReps || ''
            }
          })
        }
      })
      
      if (!isGuest) {
        const payload = buildSavePayload(filledExercises)
        await workoutService.complete(id, payload)
      }
      setWorkout(prev => ({ ...prev, exercises: filledExercises, notes: workoutNotes, userNotes: workoutUserNotes, status: 'completed',
        ...(workout?.coachingNotes && { coachingNotes: workout.coachingNotes }),
        ...(workout?.personalNotes && { personalNotes: workout.personalNotes }),
        ...(workout?.description && { description: workout.description }),
      }))
      setExercises(filledExercises)
      setIsLogging(false)
    } catch (error) {
      console.error('Error completing:', error)
      alert('Failed to complete')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkIncomplete = async () => {
    if (!confirm('Mark this workout as incomplete? It will go back to scheduled status.')) return
    try {
      await workoutService.update(id, { status: 'scheduled', completedAt: null })
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
        <div className="w-8 h-8 border-2 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!workout) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <Dumbbell className="w-16 h-16 text-iron-700 mx-auto mb-4" />
        <h2 className="text-xl font-display text-iron-200 mb-2">Workout Not Found</h2>
        <button onClick={handleBack} className="btn-primary mt-4">Go Back</button>
      </div>
    )
  }

  const isScheduled = workout.status === 'scheduled'
  const hasPartialData = isScheduled && (workout.userNotes || workout.exercises?.some(ex => 
    ex.userNotes || ex.rpe || ex.painLevel > 0 || ex.sets?.some(s => s.actualWeight || s.actualReps || s.actualTime || s.rpe)
  ))
  const isCardio = workout.workoutType === 'cardio'
  const backLabel = location.state?.fromLabel || 'Back'

  // Calculate totals for summary
  const totalSets = workout.exercises?.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0) || 0
  const totalExercises = workout.exercises?.length || 0

  // ============ VIEW MODE ============
  if (!isLogging) {
    return (
      <div className="max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-iron-950/95 backdrop-blur-sm border-b border-iron-800 -mx-4 px-4 py-3 mb-6">
          <div className="flex items-center justify-between">
            <button onClick={handleBack} className="flex items-center gap-2 text-iron-400 hover:text-iron-200 transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">{backLabel}</span>
            </button>
            
            <div className="flex items-center gap-2">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <button onClick={cancelEditing} className="px-3 py-1.5 text-sm text-iron-400 hover:text-iron-200 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={saveEdits}
                    disabled={savingEdit}
                    className="px-3 py-1.5 text-sm bg-flame-500 text-white rounded-lg hover:bg-flame-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              ) : (
                <>
              {isScheduled ? (
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">
                  To Do
                </span>
              ) : (
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">
                  Completed
                </span>
              )}

              {isAppAdmin && !isEditing && (
                <button
                  onClick={startEditing}
                  className="p-2 text-iron-400 hover:text-flame-400 transition-colors"
                  title="Edit workout"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}

              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 text-iron-400 hover:text-iron-200 transition-colors"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 w-44 bg-iron-800 border border-iron-700 rounded-xl shadow-xl z-20 overflow-hidden">
                      <Link
                        to={`/workouts/${id}/edit`}
                        className="flex items-center gap-3 px-4 py-3 text-iron-300 hover:bg-iron-700 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </Link>
                      {!isGuest && (
                        <button
                          onClick={openShareModal}
                          className="w-full flex items-center gap-3 px-4 py-3 text-iron-300 hover:bg-iron-700 transition-colors"
                        >
                          <Share2 className="w-4 h-4" />
                          Share
                        </button>
                      )}
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className={`w-full flex items-center gap-3 px-4 py-3 transition-colors disabled:opacity-50 ${
                          confirmDelete 
                            ? 'text-white bg-red-500 hover:bg-red-600' 
                            : 'text-red-400 hover:bg-red-500/10'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                        {deleting ? 'Deleting...' : confirmDelete ? 'Tap to confirm' : 'Delete'}
                      </button>
                      {confirmDelete && (
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-iron-400 hover:bg-iron-700 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Workout Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-display text-iron-50 mb-3">
            {workout.name || 'Untitled Workout'}
          </h1>
          
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-iron-400">
              <Calendar className="w-4 h-4 text-flame-400" />
              <span>{workout.date ? format(getDisplayDate(workout.date), 'EEEE, MMM d') : 'No date'}</span>
            </div>
            {!isCardio && (
              <div className="flex items-center gap-2 text-iron-400">
                <Dumbbell className="w-4 h-4 text-blue-400" />
                <span>{totalExercises} exercises · {totalSets} sets</span>
              </div>
            )}
          </div>
        </div>

        {/* AI Coaching Notes */}
        {(workout.coachingNotes || workout.personalNotes) && (
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

        {/* Generation Prompt */}
        {workout.generationPrompt && (
          <div className="card-steel mb-3 overflow-hidden">
            <button
              onClick={() => setPromptExpanded(!promptExpanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-iron-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-iron-500" />
                <span className="text-sm font-medium text-iron-200">Generation Prompt</span>
              </div>
              {promptExpanded ? <ChevronUp className="w-4 h-4 text-iron-500" /> : <ChevronDown className="w-4 h-4 text-iron-500" />}
            </button>
            <AnimatePresence>
              {promptExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4">
                    <pre className="text-xs text-iron-400 leading-relaxed whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">{workout.generationPrompt}</pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Workout Notes */}
        {isEditing ? (
          <div className="card-steel p-4 mb-3">
            <label className="block text-[10px] uppercase tracking-wider text-iron-500 mb-1.5">Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={2}
              className="w-full input-field text-sm resize-none"
              placeholder="Workout notes..."
            />
          </div>
        ) : workout.notes && (
          <div className="card-steel p-4 mb-3">
            <p className="text-iron-300">{workout.notes}</p>
          </div>
        )}

        {/* User Notes */}
        {workout.userNotes && (
          <div className="card-steel p-4 mb-6">
            <p className="text-[10px] uppercase tracking-wider text-iron-500 mb-1.5">Your Notes</p>
            <p className="text-sm text-iron-300 leading-relaxed">{workout.userNotes}</p>
          </div>
        )}

        {/* Cardio Details */}
        {isCardio && (
          <div className="card-steel p-5 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-iron-800/50 rounded-xl p-4 text-center">
                <Activity className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                <p className="text-xl font-semibold text-iron-100">
                  {ACTIVITY_METS[workout.activityType]?.label || workout.activityType || 'Activity'}
                </p>
                <p className="text-xs text-iron-500 mt-1">Activity</p>
              </div>
              
              {workout.estimatedCalories > 0 && (
                <div className="bg-flame-500/10 rounded-xl p-4 text-center">
                  <Flame className="w-8 h-8 text-flame-400 mx-auto mb-2" />
                  <p className="text-xl font-semibold text-flame-400">{workout.estimatedCalories}</p>
                  <p className="text-xs text-iron-500 mt-1">Calories</p>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-4">
              {workout.duration && (
                <div className="flex items-center gap-3 p-3 bg-iron-800/30 rounded-lg">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="text-lg font-semibold text-iron-100">{workout.duration} min</p>
                    <p className="text-xs text-iron-500">Duration</p>
                  </div>
                </div>
              )}
              {workout.distance && (
                <div className="flex items-center gap-3 p-3 bg-iron-800/30 rounded-lg">
                  <MapPin className="w-5 h-5 text-purple-400" />
                  <div>
                    <p className="text-lg font-semibold text-iron-100">{workout.distance} mi</p>
                    <p className="text-xs text-iron-500">Distance</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Overview (Scheduled Only) */}
        {!isEditing && isScheduled && !isCardio && workout.exercises?.length > 0 && (
          <div className="card-steel p-4 mb-6 bg-yellow-500/5 border-yellow-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-yellow-400" />
              <h3 className="font-semibold text-iron-100">Today's Targets</h3>
            </div>
            <div className="space-y-2">
              {workout.exercises.map((exercise, i) => {
                const firstSet = exercise.sets?.[0]
                const allSameSets = exercise.sets?.every(s => 
                  s.prescribedWeight === firstSet?.prescribedWeight && 
                  s.prescribedReps === firstSet?.prescribedReps
                )
                
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-iron-800/50 last:border-0">
                    <span className="font-medium text-iron-200">{exercise.name}</span>
                    <span className="text-yellow-400 font-semibold">
                      {exercise.sets?.length}×{' '}
                      {exercise.type === 'time' || firstSet?.prescribedTime
                        ? `${firstSet?.prescribedTime || '—'}s`
                        : exercise.type === 'bodyweight'
                          ? `${firstSet?.prescribedWeight ? `BW+${firstSet.prescribedWeight} ×` : ''} ${firstSet?.prescribedReps || '—'} reps`
                          : allSameSets
                            ? `${firstSet?.prescribedWeight || '—'}lbs × ${firstSet?.prescribedReps || '—'}`
                            : 'varied'
                      }
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Exercises - Admin Edit Mode */}
        {isEditing && !isCardio && editExercises.length > 0 && (
          <div className="space-y-4">
            {editExercises.map((exercise, exIdx) => {
              const type = getExerciseType(exercise)
              const typeTag = getTypeTag(type)
              return (
                <div key={exIdx} className="card-steel overflow-hidden">
                  <div className="p-4 bg-iron-800/30">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={exercise.name}
                        onChange={(e) => editUpdateExercise(exIdx, 'name', e.target.value)}
                        className="input-field flex-1 text-lg font-bold"
                      />
                      {typeTag && <span className={`px-2 py-0.5 text-xs rounded ${typeTag.color}`}>{typeTag.label}</span>}
                      {editExercises.length > 1 && (
                        <button onClick={() => editRemoveExercise(exIdx)} className="p-1.5 text-iron-600 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-iron-800/50">
                    {exercise.sets?.map((set, setIdx) => (
                      <div key={setIdx} className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-iron-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-lg font-bold text-iron-400">{setIdx + 1}</span>
                        </div>
                        {type === 'time' ? (
                          <div className="flex-1">
                            <input
                              type="text"
                              value={set.prescribedTime || ''}
                              onChange={(e) => editUpdateSet(exIdx, setIdx, 'prescribedTime', e.target.value)}
                              placeholder="seconds"
                              className="input-field w-full text-center"
                            />
                            <p className="text-[10px] text-iron-600 text-center mt-1">seconds</p>
                          </div>
                        ) : type === 'bodyweight' ? (
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <div>
                              <input
                                type="text"
                                value={set.prescribedReps || ''}
                                onChange={(e) => editUpdateSet(exIdx, setIdx, 'prescribedReps', e.target.value)}
                                placeholder="reps"
                                className="input-field w-full text-center"
                              />
                              <p className="text-[10px] text-iron-600 text-center mt-1">reps</p>
                            </div>
                            <div>
                              <input
                                type="text"
                                value={set.prescribedWeight || ''}
                                onChange={(e) => editUpdateSet(exIdx, setIdx, 'prescribedWeight', e.target.value)}
                                placeholder="+ lbs"
                                className="input-field w-full text-center"
                              />
                              <p className="text-[10px] text-iron-600 text-center mt-1">added lbs</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <div>
                              <input
                                type="text"
                                value={set.prescribedWeight || ''}
                                onChange={(e) => editUpdateSet(exIdx, setIdx, 'prescribedWeight', e.target.value)}
                                placeholder="lbs"
                                className="input-field w-full text-center"
                              />
                              <p className="text-[10px] text-iron-600 text-center mt-1">lbs</p>
                            </div>
                            <div>
                              <input
                                type="text"
                                value={set.prescribedReps || ''}
                                onChange={(e) => editUpdateSet(exIdx, setIdx, 'prescribedReps', e.target.value)}
                                placeholder="reps"
                                className="input-field w-full text-center"
                              />
                              <p className="text-[10px] text-iron-600 text-center mt-1">reps</p>
                            </div>
                          </div>
                        )}
                        {exercise.sets.length > 1 && (
                          <button onClick={() => editRemoveSet(exIdx, setIdx)} className="p-1.5 text-iron-600 hover:text-red-400 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2">
                    <button
                      onClick={() => editAddSet(exIdx)}
                      className="w-full py-2 border border-dashed border-iron-700 rounded-lg text-sm text-flame-400 hover:text-flame-300 hover:border-iron-600 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Set
                    </button>
                  </div>
                  {exercise.notes && (
                    <div className="px-4 pb-3">
                      <input
                        type="text"
                        value={exercise.notes}
                        onChange={(e) => editUpdateExercise(exIdx, 'notes', e.target.value)}
                        className="input-field w-full text-sm"
                        placeholder="Exercise notes"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Workout Summary Card */}
        {!isEditing && !isCardio && workout.exercises?.length > 0 && (
          <WorkoutSummaryCard exercises={workout.exercises} isCompleted={!isScheduled} />
        )}

        {/* Exercises - Detailed View */}
        {!isEditing && !isCardio && workout.exercises?.length > 0 && (
          <div className="space-y-4">
            {groupExercisesForDisplay(workout.exercises).map((group, groupIndex) => {
              // ── Superset View Card ──
              if (group.type === 'superset') {
                const { exerciseA, exerciseB } = group
                const renderSSViewSetInfo = (ex, set) => {
                  const isTime = ex.type === 'time' || ex.sets?.some(s => s.prescribedTime || s.actualTime)
                  const isBW = ex.type === 'bodyweight'
                  const hasActual = isTime ? !!set.actualTime : isBW ? !!set.actualReps : !!(set.actualWeight || set.actualReps)
                  if (isTime) {
                    return isScheduled
                      ? <span className="text-base font-bold text-iron-100">{set.prescribedTime || '—'}s</span>
                      : hasActual
                        ? <span className="text-base font-bold text-flame-400">{set.actualTime || '—'}s <span className="text-xs text-iron-500 font-normal">target {set.prescribedTime || '—'}s</span></span>
                        : <span className="text-sm text-iron-600">Not logged</span>
                  }
                  if (isBW) {
                    const prescribed = `${set.prescribedWeight ? `BW+${set.prescribedWeight}` : 'BW'} × ${set.prescribedReps || '—'}`
                    return isScheduled
                      ? <span className="text-base font-bold text-iron-100">{prescribed}</span>
                      : hasActual
                        ? <span className="text-base font-bold text-flame-400">{set.actualWeight ? `BW+${set.actualWeight}` : 'BW'} × {set.actualReps || '—'} <span className="text-xs text-iron-500 font-normal">target {prescribed}</span></span>
                        : <span className="text-sm text-iron-600">Not logged</span>
                  }
                  return isScheduled
                    ? <span className="text-base font-bold text-iron-100">{set.prescribedWeight || '—'} lbs × {set.prescribedReps || '—'}</span>
                    : hasActual
                      ? <span className="text-base font-bold text-flame-400">{set.actualWeight || '—'} lbs × {set.actualReps || '—'} <span className="text-xs text-iron-500 font-normal">target {set.prescribedWeight || '—'} × {set.prescribedReps || '—'}</span></span>
                      : <span className="text-sm text-iron-600">Not logged</span>
                }

                return (
                  <div key={`ss-${group.supersetGroup}`} className="card-steel overflow-hidden border border-purple-500/20">
                    <div className="p-4 bg-iron-800/30">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-xs font-semibold">
                          <Zap className="w-3 h-3" /> Superset
                        </div>
                        <h3 className="text-lg font-bold text-iron-50 flex-1">
                          {exerciseA.name} <span className="text-iron-600">/</span> {exerciseB.name}
                        </h3>
                      </div>
                      <p className="text-sm text-iron-500 mt-1">{exerciseA.sets?.length || 0} sets</p>
                    </div>
                    <div className="divide-y divide-iron-800/50">
                      {exerciseA.sets?.map((setA, setIndex) => {
                        const setB = exerciseB.sets?.[setIndex]
                        return (
                          <div key={setIndex} className="p-4">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-xl bg-iron-800 flex items-center justify-center flex-shrink-0">
                                <span className="text-xl font-bold text-iron-400">{setIndex + 1}</span>
                              </div>
                              <div className="flex-1 space-y-2">
                                <div>
                                  <p className="text-xs text-purple-400 font-medium mb-0.5">A — {exerciseA.name}</p>
                                  {renderSSViewSetInfo(exerciseA, setA)}
                                </div>
                                {setB && (
                                  <div className="pt-1.5 border-t border-iron-700/30">
                                    <p className="text-xs text-purple-400 font-medium mb-0.5">B — {exerciseB.name}</p>
                                    {renderSSViewSetInfo(exerciseB, setB)}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* Exercise Notes */}
                    {(exerciseA.notes || exerciseB.notes) && (
                      <div className="px-4 pb-2">
                        {exerciseA.notes && (
                          <div className="flex items-start gap-2 bg-iron-800/30 rounded-lg p-3 mb-2">
                            <MessageSquare className="w-4 h-4 text-iron-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-iron-400"><span className="text-purple-400 font-medium">A:</span> {exerciseA.notes}</p>
                          </div>
                        )}
                        {exerciseB.notes && (
                          <div className="flex items-start gap-2 bg-iron-800/30 rounded-lg p-3">
                            <MessageSquare className="w-4 h-4 text-iron-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-iron-400"><span className="text-purple-400 font-medium">B:</span> {exerciseB.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              }

              // ── Single Exercise View Card ──
              const exercise = group.exercise
              const exerciseIndex = group.index
              const isTimeExercise = exercise.type === 'time' || exercise.sets?.some(s => s.prescribedTime || s.actualTime)
              const isBWExercise = exercise.type === 'bodyweight'

              return (
              <div key={exerciseIndex} className="card-steel overflow-hidden">
                {/* Exercise Header */}
                <div className="p-4 bg-iron-800/30">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setInfoExercise(exercise); setInfoExerciseIdx(exerciseIndex) }}
                      className="text-xl font-bold text-iron-50 hover:text-flame-400 transition-colors text-left flex-1 flex items-center gap-1.5"
                    >
                      {exercise.name}
                      <HelpCircle className="w-3.5 h-3.5 text-iron-600 flex-shrink-0" />
                    </button>
                    {isTimeExercise && (
                      <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">Time</span>
                    )}
                    {isScheduled && !isGuest && (
                      <button
                        onClick={() => setSwapReasonIdx(exerciseIndex)}
                        disabled={swappingIdx !== null}
                        title="Swap for similar exercise"
                        className="p-1.5 text-iron-500 hover:text-flame-400 hover:bg-flame-500/10 rounded-lg transition-colors disabled:opacity-30"
                      >
                        {swappingIdx === exerciseIndex ? (
                          <Loader2 className="w-4 h-4 animate-spin text-flame-400" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-iron-500 mt-1">{exercise.sets?.length || 0} sets</p>
                </div>
                
                {/* Sets */}
                <div className="divide-y divide-iron-800/50">
                  {exercise.sets?.map((set, setIndex) => {
                    const hasActual = isTimeExercise
                      ? set.actualTime
                      : isBWExercise
                        ? !!set.actualReps
                        : (set.actualWeight || set.actualReps)
                    const e1rm = !isTimeExercise && !isBWExercise && hasActual && set.actualWeight && set.actualReps && parseInt(set.actualReps) > 1
                      ? calculateE1RM(parseFloat(set.actualWeight), parseInt(set.actualReps))
                      : null
                    
                    return (
                      <div key={setIndex} className="p-4">
                        <div className="flex items-center gap-4">
                          {/* Set Number */}
                          <div className="w-12 h-12 rounded-xl bg-iron-800 flex items-center justify-center flex-shrink-0">
                            <span className="text-xl font-bold text-iron-400">{setIndex + 1}</span>
                          </div>
                          
                          {/* Set Info */}
                          <div className="flex-1">
                            {isTimeExercise ? (
                              /* TIME EXERCISE */
                              isScheduled ? (
                                <div>
                                  <div className="text-2xl font-bold text-iron-100">
                                    {set.prescribedTime || '—'} seconds
                                  </div>
                                  {set.setNote && (
                                    <p className="text-sm text-iron-400 mt-0.5">{set.setNote}</p>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <div className="text-sm text-iron-500 mb-1">
                                    Target: {set.prescribedTime || '—'}s{set.setNote ? ` — ${set.setNote}` : ''}
                                  </div>
                                  {hasActual ? (
                                    <span className="text-2xl font-bold text-flame-400">
                                      {set.actualTime || '—'} seconds
                                    </span>
                                  ) : (
                                    <span className="text-lg text-iron-600">Not logged</span>
                                  )}
                                </>
                              )
                            ) : isBWExercise ? (
                              /* BODYWEIGHT EXERCISE */
                              isScheduled ? (
                                <div className="text-2xl font-bold text-iron-100">
                                  {set.prescribedWeight ? `BW + ${set.prescribedWeight} lbs` : 'BW'} <span className="text-iron-500">×</span> {set.prescribedReps || '—'} reps
                                  {set.targetRpe && <span className="text-sm text-iron-500 font-normal ml-2">@ RPE {set.targetRpe}</span>}
                                </div>
                              ) : (
                                <>
                                  <div className="text-sm text-iron-500 mb-1">
                                    Target: {set.prescribedWeight ? `BW+${set.prescribedWeight}` : 'BW'} × {set.prescribedReps || '—'}
                                  </div>
                                  {hasActual ? (
                                    <span className="text-2xl font-bold text-flame-400">
                                      {set.actualWeight ? `BW + ${set.actualWeight} lbs` : 'BW'} × {set.actualReps || '—'}
                                    </span>
                                  ) : (
                                    <span className="text-lg text-iron-600">Not logged</span>
                                  )}
                                </>
                              )
                            ) : isScheduled ? (
                              /* SCHEDULED: Show target prominently */
                              <div className="text-2xl font-bold text-iron-100">
                                {set.prescribedWeight || '—'} lbs <span className="text-iron-500">×</span> {set.prescribedReps || '—'} reps
                                {set.targetRpe && <span className="text-sm text-iron-500 font-normal ml-2">@ RPE {set.targetRpe}</span>}
                              </div>
                            ) : (
                              /* COMPLETED: Show target small, actual big */
                              <>
                                <div className="text-sm text-iron-500 mb-1">
                                  Target: {set.prescribedWeight || '—'} × {set.prescribedReps || '—'}
                                </div>
                                {hasActual ? (
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-2xl font-bold text-flame-400">
                                      {set.actualWeight || '—'} lbs × {set.actualReps || '—'}
                                    </span>
                                    {e1rm && (
                                      <span className="text-sm text-iron-500 bg-iron-800 px-2 py-1 rounded-lg">
                                        e1RM: {e1rm} lbs
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-lg text-iron-600">Not logged</span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                {/* Exercise-level RPE & Pain */}
                {!isScheduled && (exercise.rpe || exercise.painLevel > 0 || exercise.sets?.some(s => s.rpe || s.painLevel > 0)) && (
                  <div className="px-4 pb-2 flex items-center gap-3">
                    {(exercise.rpe || exercise.sets?.some(s => s.rpe)) && (
                      <span className={`text-sm font-semibold ${getRPEColor(exercise.rpe || Math.max(...(exercise.sets || []).map(s => parseFloat(s.rpe) || 0)))}`}>
                        RPE {exercise.rpe || Math.max(...(exercise.sets || []).map(s => parseFloat(s.rpe) || 0))}
                      </span>
                    )}
                    {(exercise.painLevel > 0 || exercise.sets?.some(s => s.painLevel > 0)) && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPainColor(exercise.painLevel || Math.max(...(exercise.sets || []).map(s => s.painLevel || 0)))}`}>
                        Pain {exercise.painLevel || Math.max(...(exercise.sets || []).map(s => s.painLevel || 0))}
                      </span>
                    )}
                  </div>
                )}
                
                {/* Exercise Notes */}
                {exercise.notes && (
                  <div className="px-4 pb-2">
                    <div className="flex items-start gap-2 bg-iron-800/30 rounded-lg p-3">
                      <MessageSquare className="w-4 h-4 text-iron-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-iron-400">{exercise.notes}</p>
                    </div>
                  </div>
                )}
                {exercise.userNotes && (
                  <div className="px-4 pb-4">
                    <div className="flex items-start gap-2 bg-flame-500/5 border border-flame-500/10 rounded-lg p-3">
                      <MessageSquare className="w-4 h-4 text-flame-400/60 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-iron-500 mb-0.5">Your Notes</p>
                        <p className="text-sm text-iron-400">{exercise.userNotes}</p>
                      </div>
                    </div>
                  </div>
                )}
                {!exercise.notes && !exercise.userNotes && null}
              </div>
            )})}
          </div>
        )}

        {/* Empty State */}
        {!isCardio && (!workout.exercises || workout.exercises.length === 0) && (
          <div className="card-steel p-8 text-center">
            <Dumbbell className="w-12 h-12 text-iron-700 mx-auto mb-3" />
            <p className="text-iron-500">No exercises in this workout</p>
          </div>
        )}

        {/* Action Button */}
        {!isCardio && !isEditing && (
          <div className={`fixed bottom-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800 left-0 ${sidebarOpen ? 'lg:left-64' : 'lg:left-20'} transition-[left] duration-300`}>
            <button
              onClick={() => setIsLogging(true)}
              className={`w-full py-4 text-lg flex items-center justify-center gap-2 rounded-xl font-semibold ${
                isScheduled 
                  ? 'bg-flame-500 hover:bg-flame-600 text-white' 
                  : 'bg-iron-800 hover:bg-iron-700 text-iron-200'
              }`}
            >
              {isScheduled ? (
                <>
                  <Play className="w-6 h-6" />
                  {hasPartialData ? 'Continue Workout' : 'Log Workout'}
                </>
              ) : (
                <>
                  <Pencil className="w-5 h-5" />
                  Edit Logged Data
                </>
              )}
            </button>
            {!isScheduled && !isGuest && (
              <button
                onClick={handleMarkIncomplete}
                className="w-full mt-2 py-2 text-xs text-iron-500 hover:text-iron-300 transition-colors"
              >
                Mark as incomplete
              </button>
            )}
          </div>
        )}

        <ExerciseInfoModal
          exercise={infoExercise}
          isOpen={!!infoExercise}
          onClose={() => { setInfoExercise(null); setInfoExerciseIdx(null) }}
          onSubstitute={!isGuest && infoExerciseIdx !== null ? (subName) => swapToSubstitution(infoExerciseIdx, subName) : undefined}
        />

        {/* Swap Reason Modal */}
        <AnimatePresence>
          {swapReasonIdx !== null && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => { setSwapReasonIdx(null); setSwapReason(''); }}
                className="fixed inset-0 bg-black/60 z-50"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-x-4 top-[30%] mx-auto max-w-sm bg-iron-900 border border-iron-700 rounded-2xl z-50 p-4 space-y-3"
              >
                <h3 className="text-sm font-medium text-iron-200">Swap Exercise</h3>
                <p className="text-xs text-iron-500">Optionally note why you're swapping (e.g. "shoulder pain", "no cable machine")</p>
                <input
                  type="text"
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="input-field w-full text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      swapExercise(swapReasonIdx, swapReason);
                      setSwapReasonIdx(null);
                      setSwapReason('');
                    }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSwapReasonIdx(null); setSwapReason(''); }}
                    className="flex-1 py-2.5 text-sm text-iron-400 hover:text-iron-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { swapExercise(swapReasonIdx, swapReason); setSwapReasonIdx(null); setSwapReason(''); }}
                    className="flex-1 py-2.5 text-sm bg-flame-500/15 text-flame-400 border border-flame-500/30 rounded-xl hover:bg-flame-500/25 transition-colors"
                  >
                    Swap
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Share Modal */}
        <AnimatePresence>
          {showShareModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowShareModal(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed inset-x-4 top-[15%] mx-auto max-w-md bg-iron-900 border border-iron-700 rounded-2xl z-50 overflow-hidden shadow-2xl"
              >
                <div className="flex items-center justify-between p-4 border-b border-iron-800">
                  <h3 className="font-display text-lg text-iron-100">Share Workout</h3>
                  <button onClick={() => setShowShareModal(false)} className="p-1.5 text-iron-400 hover:text-iron-200 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {shared ? (
                    <div className="text-center py-6">
                      <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Check className="w-7 h-7 text-green-400" />
                      </div>
                      <p className="text-iron-200 font-medium">Workout Shared!</p>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 bg-iron-800/50 rounded-lg">
                        <p className="text-sm text-iron-300 font-medium">{workout?.name || 'Workout'}</p>
                        <p className="text-xs text-iron-500 mt-0.5">{workout?.exercises?.length || 0} exercises</p>
                      </div>

                      {friends.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-sm text-iron-500">No friends yet. Add friends to share workouts.</p>
                          <Link to="/friends" className="text-sm text-flame-400 hover:underline mt-1 inline-block">Find Friends</Link>
                        </div>
                      ) : (
                        <>
                          {friends.length > 5 && (
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500" />
                              <input
                                type="text"
                                placeholder="Search friends..."
                                value={shareSearch}
                                onChange={(e) => setShareSearch(e.target.value)}
                                className="input-field pl-9 py-2 text-sm w-full"
                              />
                            </div>
                          )}

                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {friends
                              .filter(fid => {
                                if (!shareSearch) return true
                                const p = friendProfiles[fid]
                                return p?.displayName?.toLowerCase().includes(shareSearch.toLowerCase())
                              })
                              .map(fid => {
                                const p = friendProfiles[fid]
                                return (
                                  <button
                                    key={fid}
                                    onClick={() => setSelectedFriend(fid)}
                                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                                      selectedFriend === fid
                                        ? 'bg-flame-500/15 border border-flame-500/30'
                                        : 'hover:bg-iron-800'
                                    }`}
                                  >
                                    {p?.photoURL ? (
                                      <img src={p.photoURL} alt="" className="w-8 h-8 rounded-full" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full bg-iron-700 flex items-center justify-center text-xs font-medium text-iron-400">
                                        {(p?.displayName || '?')[0]}
                                      </div>
                                    )}
                                    <span className="text-sm text-iron-200 flex-1 text-left truncate">{p?.displayName || 'User'}</span>
                                    {selectedFriend === fid && <Check className="w-4 h-4 text-flame-400" />}
                                  </button>
                                )
                              })}
                          </div>

                          <textarea
                            placeholder="Add a message (optional)"
                            value={shareMessage}
                            onChange={(e) => setShareMessage(e.target.value)}
                            rows={2}
                            className="input-field w-full resize-none text-sm"
                          />

                          <button
                            onClick={handleShare}
                            disabled={!selectedFriend || sharing}
                            className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {sharing ? 'Sharing...' : 'Share Workout'}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
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
          <h1 className="font-display text-lg text-iron-100">
            {isScheduled ? 'Log Workout' : 'Edit Log'}
          </h1>
          <button onClick={() => setRpeModalOpen(true)} className="p-2 text-iron-400 hover:text-iron-200">
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Coach Notes (read-only) */}
      {workout?.notes && (
        <div className="card-steel p-4 mb-3">
          <label className="block text-[10px] uppercase tracking-wider text-iron-500 mb-1.5">Coach Notes</label>
          <p className="text-sm text-iron-300 leading-relaxed">{workout.notes}</p>
        </div>
      )}

      {/* Your Notes */}
      <div className="card-steel p-4 mb-4">
        <label className="block text-sm text-iron-400 mb-2">Your Notes</label>
        <textarea
          value={workoutUserNotes}
          onChange={(e) => setWorkoutUserNotes(e.target.value)}
          placeholder="How did the workout go? Anything feel off?"
          rows={2}
          className="w-full input-field text-sm resize-none"
        />
      </div>

      {/* Exercises */}
      <div className="space-y-4">
        {groupExercisesForDisplay(exercises).map((group, groupIndex) => {
          // ── Superset Log Card ──
          if (group.type === 'superset') {
            const { exerciseA, exerciseB, indexA: idxA, indexB: idxB } = group
            const renderSSLogInputs = (exIdx, ex, set, si) => {
              const t = getExerciseType(ex)
              if (t === 'time') return (
                <div>
                  <input type="number" inputMode="numeric" value={set.actualTime || ''}
                    onChange={e => updateSet(exIdx, si, 'actualTime', e.target.value)}
                    placeholder={set.prescribedTime || '—'}
                    className="w-full input-field text-lg py-2 px-3 text-center font-semibold" />
                  <p className="text-[10px] text-iron-600 text-center mt-0.5">seconds</p>
                </div>
              )
              if (t === 'bodyweight') return (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <input type="number" inputMode="numeric" value={set.actualReps || ''}
                      onChange={e => updateSet(exIdx, si, 'actualReps', e.target.value)}
                      placeholder={set.prescribedReps || '—'}
                      className="w-full input-field text-lg py-2 px-3 text-center font-semibold" />
                    <p className="text-[10px] text-iron-600 text-center mt-0.5">reps</p>
                  </div>
                  <div>
                    <input type="text" value={set.actualWeight || ''}
                      onChange={e => updateSet(exIdx, si, 'actualWeight', e.target.value)}
                      placeholder={set.prescribedWeight || 'BW'}
                      className="w-full input-field text-base py-2 px-2 text-center font-semibold" />
                    <p className="text-[10px] text-iron-600 text-center mt-0.5">+ lbs</p>
                  </div>
                </div>
              )
              return (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <input type="text" value={set.actualWeight || ''}
                      onChange={e => updateSet(exIdx, si, 'actualWeight', e.target.value)}
                      placeholder={set.prescribedWeight || 'lbs'}
                      className="w-full input-field text-lg py-2 px-3 text-center font-semibold" />
                    <p className="text-[10px] text-iron-600 text-center mt-0.5">lbs</p>
                  </div>
                  <div>
                    <input type="number" inputMode="numeric" value={set.actualReps || ''}
                      onChange={e => updateSet(exIdx, si, 'actualReps', e.target.value)}
                      placeholder={set.prescribedReps || '—'}
                      className="w-full input-field text-lg py-2 px-3 text-center font-semibold" />
                    <p className="text-[10px] text-iron-600 text-center mt-0.5">reps</p>
                  </div>
                </div>
              )
            }

            const fillFromTarget = (exIdx, ex, set, si) => {
              const t = getExerciseType(ex)
              if (t === 'time') {
                updateSet(exIdx, si, 'actualTime', set.prescribedTime || '')
              } else if (t === 'bodyweight') {
                updateSet(exIdx, si, 'actualReps', set.prescribedReps || '')
                if (set.prescribedWeight) updateSet(exIdx, si, 'actualWeight', set.prescribedWeight)
              } else {
                updateSet(exIdx, si, 'actualWeight', set.prescribedWeight || '')
                updateSet(exIdx, si, 'actualReps', set.prescribedReps || '')
              }
            }

            const getTargetLabel = (ex, set) => {
              const t = getExerciseType(ex)
              if (t === 'time') return `${set.prescribedTime || '—'}s`
              if (t === 'bodyweight') return `${set.prescribedWeight ? `BW+${set.prescribedWeight} ×` : ''} ${set.prescribedReps || '—'}`
              return `${set.prescribedWeight || '—'} × ${set.prescribedReps || '—'}`
            }

            return (
              <div key={`ss-${group.supersetGroup}`} className="card-steel overflow-hidden border border-purple-500/20">
                {/* Header */}
                <div className="p-4 bg-iron-800/30">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-xs font-semibold">
                      <Zap className="w-3 h-3" /> Superset
                    </div>
                    <h3 className="text-lg font-bold text-iron-50 flex-1">
                      {exerciseA.name} <span className="text-iron-600">/</span> {exerciseB.name}
                    </h3>
                    {exercises.length > 2 && (
                      <button onClick={() => removeExercise(idxA)}
                        className="p-1.5 text-iron-600 hover:text-red-400 transition-colors" title="Remove superset">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-iron-500 mt-1">{exerciseA.sets?.length || 0} sets</p>
                  {(exerciseA.notes || exerciseB.notes) && (
                    <div className="mt-2 space-y-1">
                      {exerciseA.notes && (
                        <div className="flex items-start gap-2 bg-iron-900/50 rounded-lg p-2">
                          <MessageSquare className="w-3.5 h-3.5 text-iron-500 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-iron-400"><span className="text-purple-400">A:</span> {exerciseA.notes}</p>
                        </div>
                      )}
                      {exerciseB.notes && (
                        <div className="flex items-start gap-2 bg-iron-900/50 rounded-lg p-2">
                          <MessageSquare className="w-3.5 h-3.5 text-iron-500 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-iron-400"><span className="text-purple-400">B:</span> {exerciseB.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Sets */}
                <div className="divide-y divide-iron-800/50">
                  {exerciseA.sets?.map((setA, setIndex) => {
                    const setB = exerciseB.sets?.[setIndex]
                    const isFilledA = (() => { const t = getExerciseType(exerciseA); return t === 'time' ? !!setA.actualTime : t === 'bodyweight' ? !!setA.actualReps : !!(setA.actualWeight && setA.actualReps) })()
                    const isFilledB = setB ? (() => { const t = getExerciseType(exerciseB); return t === 'time' ? !!setB.actualTime : t === 'bodyweight' ? !!setB.actualReps : !!(setB.actualWeight && setB.actualReps) })() : false
                    const bothFilled = isFilledA && isFilledB
                    return (
                      <div key={setIndex} className="p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            bothFilled ? 'bg-green-500/15 ring-1 ring-green-500/30' : 'bg-iron-800'
                          }`}>
                            <span className={`text-lg font-bold ${bothFilled ? 'text-green-400' : 'text-iron-400'}`}>
                              {setIndex + 1}
                            </span>
                          </div>
                          <button
                            onClick={() => { fillFromTarget(idxA, exerciseA, setA, setIndex); if (setB) fillFromTarget(idxB, exerciseB, setB, setIndex) }}
                            className="flex-1 text-left hover:text-flame-400 active:scale-[0.98] transition-all"
                            title="Tap to fill both with targets"
                          >
                            <span className="text-[10px] uppercase tracking-wider text-iron-600 block">Targets</span>
                            <span className="text-xs font-medium text-iron-400">
                              A: {getTargetLabel(exerciseA, setA)} · B: {setB ? getTargetLabel(exerciseB, setB) : '—'}
                            </span>
                          </button>
                          {exerciseA.sets.length > 1 && (
                            <button onClick={() => removeSet(idxA, setIndex)}
                              className="p-1.5 text-iron-600 hover:text-red-400 transition-colors">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {/* Exercise A inputs */}
                        <div>
                          <p className="text-xs text-purple-400 font-medium mb-1.5">A — {exerciseA.name}</p>
                          {renderSSLogInputs(idxA, exerciseA, setA, setIndex)}
                        </div>
                        {/* Exercise B inputs */}
                        {setB && (
                          <div className="pt-2 border-t border-iron-700/30">
                            <p className="text-xs text-purple-400 font-medium mb-1.5">B — {exerciseB.name}</p>
                            {renderSSLogInputs(idxB, exerciseB, setB, setIndex)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Add Set */}
                <div className="px-4 pt-2 pb-1">
                  <button onClick={() => addSet(idxA)}
                    className="w-full py-2.5 border border-dashed border-iron-700 rounded-lg text-sm text-flame-400 hover:text-flame-300 hover:border-iron-600 flex items-center justify-center gap-1.5 transition-colors">
                    <Plus className="w-4 h-4" /> Add Set
                  </button>
                </div>

                {/* RPE & Pain for superset */}
                <div className="px-4 pb-2">
                  <button
                    onClick={() => setExpandedRpe(prev => ({ ...prev, [`ss-${group.supersetGroup}`]: !prev[`ss-${group.supersetGroup}`] }))}
                    className="flex items-center gap-2 py-2 text-sm text-iron-500 hover:text-iron-300 transition-colors w-full"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>RPE / Pain</span>
                    {expandedRpe[`ss-${group.supersetGroup}`]
                      ? <ChevronUp className="w-3.5 h-3.5 ml-auto" />
                      : <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                    }
                  </button>
                  {expandedRpe[`ss-${group.supersetGroup}`] && (
                    <div className="space-y-2 pb-2">
                      {[{ label: 'A', ex: exerciseA, idx: idxA }, { label: 'B', ex: exerciseB, idx: idxB }].map(({ label, ex, idx }) => (
                        <div key={label} className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-purple-400 font-medium w-3">{label}</span>
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] text-iron-500 uppercase tracking-wider w-6">RPE</label>
                            {[6, 7, 8, 9, 10].map(v => (
                              <button key={v} onClick={() => updateExerciseField(idx, 'rpe', ex.rpe == v ? '' : String(v))}
                                className={`w-7 h-7 text-xs rounded-lg border transition-colors ${
                                  ex.rpe == v ? 'border-flame-500 bg-flame-500/15 text-flame-400 font-semibold' : 'border-iron-700/60 text-iron-500 hover:border-iron-600'
                                }`}>{v}</button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] text-iron-500 uppercase tracking-wider w-7">Pain</label>
                            {[1, 2, 3, 4, 5].map(v => (
                              <button key={v} onClick={() => updateExerciseField(idx, 'painLevel', (ex.painLevel || 0) === v ? 0 : v)}
                                className={`w-7 h-7 text-xs rounded-lg border transition-colors ${
                                  (ex.painLevel || 0) === v
                                    ? v <= 2 ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400 font-semibold' : 'border-red-500/50 bg-red-500/10 text-red-400 font-semibold'
                                    : 'border-iron-700/60 text-iron-500 hover:border-iron-600'
                                }`}>{v}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="px-4 pb-4">
                  {(exerciseA.userNotes || exerciseB.userNotes || openNotes[`ss-${group.supersetGroup}`]) ? (
                    <textarea
                      value={exerciseA.userNotes || ''}
                      onChange={(e) => { updateExerciseUserNotes(idxA, e.target.value); updateExerciseUserNotes(idxB, e.target.value) }}
                      placeholder="How did the superset feel?"
                      rows={2}
                      className="w-full input-field text-sm resize-none"
                    />
                  ) : (
                    <button onClick={() => setOpenNotes(prev => ({ ...prev, [`ss-${group.supersetGroup}`]: true }))}
                      className="w-full text-left text-sm text-iron-600 hover:text-iron-400 py-2 transition-colors flex items-center gap-2">
                      <Pencil className="w-3.5 h-3.5" /> Add notes...
                    </button>
                  )}
                </div>
              </div>
            )
          }

          // ── Single Exercise Log Card ──
          const exercise = group.exercise
          const exerciseIndex = group.index
          const type = getExerciseType(exercise)
          const typeTag = getTypeTag(type)

          return (
          <div key={exerciseIndex} className="card-steel overflow-hidden">
            {/* Exercise Header */}
            <div className="p-4 bg-iron-800/30">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setInfoExercise(exercise); setInfoExerciseIdx(exerciseIndex) }}
                  className="text-xl font-bold text-iron-50 hover:text-flame-400 transition-colors text-left flex-1 flex items-center gap-1.5"
                >
                  {exercise.name}
                  <HelpCircle className="w-3.5 h-3.5 text-iron-600 flex-shrink-0" />
                </button>
                {typeTag && (
                  <span className={`px-2 py-0.5 text-xs rounded ${typeTag.color}`}>{typeTag.label}</span>
                )}
                {exercises.length > 1 && (
                  <button
                    onClick={() => removeExercise(exerciseIndex)}
                    className="p-1.5 text-iron-600 hover:text-red-400 transition-colors"
                    title="Remove exercise"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-iron-500 mt-1">{exercise.sets?.length || 0} sets</p>
              {exercise.notes && (
                <div className="flex items-start gap-2 mt-2 bg-iron-900/50 rounded-lg p-2.5">
                  <MessageSquare className="w-3.5 h-3.5 text-iron-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-iron-400 leading-relaxed">{exercise.notes}</p>
                </div>
              )}
            </div>

            {/* Sets */}
            <div className="divide-y divide-iron-800/50">
              {exercise.sets?.map((set, setIndex) => {
                const isFilled = type === 'time'
                  ? !!set.actualTime
                  : type === 'bodyweight'
                    ? !!set.actualReps
                    : !!(set.actualWeight && set.actualReps)
                return (
                <div key={setIndex} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isFilled ? 'bg-green-500/15 ring-1 ring-green-500/30' : 'bg-iron-800'
                    }`}>
                      <span className={`text-lg font-bold ${isFilled ? 'text-green-400' : 'text-iron-400'}`}>
                        {setIndex + 1}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        if (type === 'time') {
                          updateSet(exerciseIndex, setIndex, 'actualTime', set.prescribedTime || '')
                        } else if (type === 'bodyweight') {
                          updateSet(exerciseIndex, setIndex, 'actualReps', set.prescribedReps || '')
                          if (set.prescribedWeight) updateSet(exerciseIndex, setIndex, 'actualWeight', set.prescribedWeight)
                        } else {
                          updateSet(exerciseIndex, setIndex, 'actualWeight', set.prescribedWeight || '')
                          updateSet(exerciseIndex, setIndex, 'actualReps', set.prescribedReps || '')
                        }
                      }}
                      className="flex-1 text-left hover:text-flame-400 active:scale-[0.98] transition-all"
                      title="Tap to fill with target values"
                    >
                      <span className="text-[10px] uppercase tracking-wider text-iron-600 block">Target</span>
                      <span className="text-sm font-medium text-iron-400">
                        {type === 'time'
                          ? `${set.prescribedTime || '—'}s`
                          : type === 'bodyweight'
                            ? `${set.prescribedWeight ? `BW+${set.prescribedWeight} ×` : ''} ${set.prescribedReps || '—'} reps`
                            : `${set.prescribedWeight || '—'} lbs × ${set.prescribedReps || '—'}`
                        }
                        {set.targetRpe ? ` @ RPE ${set.targetRpe}` : ''}
                      </span>
                    </button>
                    {exercise.sets.length > 1 && (
                      <button
                        onClick={() => removeSet(exerciseIndex, setIndex)}
                        className="p-1.5 text-iron-600 hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {type === 'time' ? (
                    <div className="ml-[52px]">
                      {set.setNote && (
                        <p className="text-sm text-iron-400 mb-2">{set.setNote}</p>
                      )}
                      <input
                        type="number"
                        inputMode="numeric"
                        value={set.actualTime || ''}
                        onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualTime', e.target.value)}
                        placeholder={set.prescribedTime || '—'}
                        className="w-full input-field text-xl py-3 px-4 text-center font-semibold"
                      />
                      <p className="text-[10px] text-iron-600 text-center mt-1">seconds</p>
                    </div>
                  ) : type === 'bodyweight' ? (
                    <div className="ml-[52px]">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={set.actualReps || ''}
                            onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualReps', e.target.value)}
                            placeholder={set.prescribedReps || '—'}
                            className="w-full input-field text-xl py-3 px-4 text-center font-semibold"
                          />
                          <p className="text-[10px] text-iron-600 text-center mt-1">reps</p>
                        </div>
                        <div>
                          <input
                            type="text"
                            value={set.actualWeight || ''}
                            onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualWeight', e.target.value)}
                            placeholder={set.prescribedWeight || 'BW'}
                            className="w-full input-field text-lg py-3 px-2 text-center font-semibold"
                          />
                          <p className="text-[10px] text-iron-600 text-center mt-1">+ added lbs</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 ml-[52px]">
                      <div>
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
                        <p className="text-[10px] text-iron-600 text-center mt-1">lbs</p>
                      </div>
                      <div>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={set.actualReps || ''}
                          onChange={(e) => updateSet(exerciseIndex, setIndex, 'actualReps', e.target.value)}
                          placeholder={set.prescribedReps || '—'}
                          className="w-full input-field text-lg py-2.5 px-2 text-center font-semibold"
                        />
                        <p className="text-[10px] text-iron-600 text-center mt-1">reps</p>
                      </div>
                    </div>
                  )}
                </div>
              )})}
            </div>

            {/* Add Set */}
            <div className="px-4 pt-2 pb-1">
              <button
                onClick={() => addSet(exerciseIndex)}
                className="w-full py-2.5 border border-dashed border-iron-700 rounded-lg
                  text-sm text-flame-400 hover:text-flame-300 hover:border-iron-600
                  flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Set
              </button>
            </div>

            {/* RPE & Pain — collapsible */}
            <div className="px-4 pb-2">
              <button
                onClick={() => setExpandedRpe(prev => ({ ...prev, [exerciseIndex]: !prev[exerciseIndex] }))}
                className="flex items-center gap-2 py-2 text-sm text-iron-500 hover:text-iron-300 transition-colors w-full"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>
                  {exercise.rpe ? `RPE ${exercise.rpe}` : 'RPE'}
                  {(exercise.painLevel || 0) > 0 ? ` · Pain ${exercise.painLevel}` : ''}
                </span>
                {expandedRpe[exerciseIndex]
                  ? <ChevronUp className="w-3.5 h-3.5 ml-auto" />
                  : <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                }
              </button>
              {expandedRpe[exerciseIndex] && (
                <div className="flex flex-wrap items-center gap-2 pb-2">
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-iron-500 uppercase tracking-wider w-6">RPE</label>
                    {[6, 7, 8, 9, 10].map(v => (
                      <button
                        key={v}
                        onClick={() => updateExerciseField(exerciseIndex, 'rpe', exercise.rpe == v ? '' : String(v))}
                        className={`w-8 h-8 text-xs rounded-lg border transition-colors ${
                          exercise.rpe == v
                            ? 'border-flame-500 bg-flame-500/15 text-flame-400 font-semibold'
                            : 'border-iron-700/60 text-iron-500 hover:border-iron-600'
                        }`}
                      >{v}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-iron-500 uppercase tracking-wider w-7">Pain</label>
                    {[1, 2, 3, 4, 5].map(v => (
                      <button
                        key={v}
                        onClick={() => updateExerciseField(exerciseIndex, 'painLevel', (exercise.painLevel || 0) === v ? 0 : v)}
                        className={`w-8 h-8 text-xs rounded-lg border transition-colors ${
                          (exercise.painLevel || 0) === v
                            ? v <= 2 ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400 font-semibold'
                              : 'border-red-500/50 bg-red-500/10 text-red-400 font-semibold'
                            : 'border-iron-700/60 text-iron-500 hover:border-iron-600'
                        }`}
                      >{v}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Your Notes — collapsed by default */}
            <div className="px-4 pb-4">
              {(exercise.userNotes || openNotes[exerciseIndex]) ? (
                <textarea
                  value={exercise.userNotes || ''}
                  onChange={(e) => updateExerciseUserNotes(exerciseIndex, e.target.value)}
                  placeholder="How did this feel? Any discomfort?"
                  rows={2}
                  autoFocus={openNotes[exerciseIndex] && !exercise.userNotes}
                  className="w-full input-field text-sm resize-none"
                />
              ) : (
                <button
                  onClick={() => setOpenNotes(prev => ({ ...prev, [exerciseIndex]: true }))}
                  className="w-full text-left text-sm text-iron-600 hover:text-iron-400 py-2 transition-colors flex items-center gap-2"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Add notes...
                </button>
              )}
            </div>
          </div>
        )})}
      </div>

      {/* Action Buttons */}
      <div className={`fixed bottom-0 right-0 p-4 bg-iron-950/95 backdrop-blur-sm border-t border-iron-800 left-0 ${sidebarOpen ? 'lg:left-64' : 'lg:left-20'} transition-[left] duration-300`}>
        <div className="flex gap-2">
          <button
            onClick={handleSaveProgress}
            disabled={saving}
            className="btn-secondary py-3 px-4 text-sm flex items-center justify-center gap-1.5 flex-shrink-0"
          >
            Save Draft
          </button>
          <button
            onClick={handleComplete}
            disabled={saving}
            className="btn-primary flex-1 py-3 text-sm flex items-center justify-center gap-2"
          >
            {saving ? 'Saving...' : (
              <>
                <Check className="w-4 h-4" />
                {isScheduled ? 'Complete Workout' : 'Update'}
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-iron-500 text-center mt-1.5">Empty fields filled with targets</p>
      </div>

      {/* RPE Modal */}
      {rpeModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-iron-900 rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-iron-100">RPE Scale</h3>
              <button onClick={() => setRpeModalOpen(false)} className="p-2 text-iron-400 hover:text-iron-200">
                <X className="w-5 h-5" />
              </button>
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

      <ExerciseInfoModal
        exercise={infoExercise}
        isOpen={!!infoExercise}
        onClose={() => { setInfoExercise(null); setInfoExerciseIdx(null) }}
        onSubstitute={!isGuest && infoExerciseIdx !== null ? (subName) => swapToSubstitution(infoExerciseIdx, subName) : undefined}
      />

    </div>
  )
}