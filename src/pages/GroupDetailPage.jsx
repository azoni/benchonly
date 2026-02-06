import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isToday, isSameDay } from 'date-fns'
import { 
  ArrowLeft,
  Users,
  Crown,
  Settings,
  UserPlus,
  Copy,
  Check,
  Trash2,
  LogOut,
  MoreVertical,
  Calendar,
  Target,
  Plus,
  Dumbbell,
  X,
  ChevronDown,
  ChevronRight,
  Edit2,
  Search,
  Sparkles
} from 'lucide-react'
import { groupService, workoutService, attendanceService, groupWorkoutService, userService, goalService } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { getDisplayDate } from '../utils/dateUtils'
import { normalizeRepRange } from '../utils/workoutUtils'
import GenerateGroupWorkoutModal from '../components/GenerateGroupWorkoutModal'

// Helper to safely parse dates from Firestore
const safeFormatDate = (date, formatStr = 'MMM d, yyyy') => {
  if (!date) return ''
  try {
    const dateObj = getDisplayDate(date)
    if (isNaN(dateObj.getTime())) return ''
    return format(dateObj, formatStr)
  } catch {
    return ''
  }
}

const COMMON_EXERCISES = [
  'Bench Press',
  'Incline Bench Press',
  'Close Grip Bench',
  'Dumbbell Press',
  'Overhead Press',
  'Squat',
  'Deadlift',
  'Barbell Row',
  'Pull-ups',
  'Tricep Extension',
  'Bicep Curl',
  'Lateral Raise',
]

const TIME_EXERCISES = [
  'Dead Hang',
  'Plank',
  'Wall Sit',
  'L-Sit',
  'Farmers Carry',
  'Static Hold',
]

const BODYWEIGHT_EXERCISES = [
  'Pull-ups',
  'Push-ups',
  'Dips',
  'Chin-ups',
  'Muscle-ups',
  'Bodyweight Squats',
]

export default function GroupDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [memberGoals, setMemberGoals] = useState({})
  const [attendance, setAttendance] = useState({})
  const [groupWorkouts, setGroupWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Merge default exercises with custom exercises from user profile
  const customExercises = userProfile?.customExercises || {}
  const allWeightExercises = [...COMMON_EXERCISES, ...(customExercises.weight || [])]
  const allBodyweightExercises = [...BODYWEIGHT_EXERCISES, ...(customExercises.bodyweight || [])]
  const allTimeExercises = [...TIME_EXERCISES, ...(customExercises.time || [])]
  const [showMenu, setShowMenu] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('members')
  
  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteTab, setInviteTab] = useState('code') // 'code' | 'search'
  const [userSearch, setUserSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [inviting, setInviting] = useState(null)
  
  // Workout creation state
  const [showWorkoutModal, setShowWorkoutModal] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState([])
  const [workoutDate, setWorkoutDate] = useState(new Date().toISOString().split('T')[0])
  const [workoutName, setWorkoutName] = useState('')
  // Per-member workout prescriptions: { oduserId: { exercises: [...] } }
  const [memberPrescriptions, setMemberPrescriptions] = useState({})
  const [activeMemberTab, setActiveMemberTab] = useState(null)
  const [creatingWorkout, setCreatingWorkout] = useState(false)
  const [expandedWorkout, setExpandedWorkout] = useState(null)
  // Editing mode - stores the workout IDs being edited: { memberId: workoutId }
  const [editingWorkoutIds, setEditingWorkoutIds] = useState(null)
  
  // AI Generate modal state
  const [showAIGenerateModal, setShowAIGenerateModal] = useState(false)

  const isAdmin = group?.admins?.includes(user?.uid)

  useEffect(() => {
    async function fetchData() {
      if (!id || !user) return
      try {
        const groupData = await groupService.getById(id)
        setGroup(groupData)
        
        // Fetch member details
        if (groupData?.members) {
          const memberData = await groupService.getMemberDetails(groupData.members)
          
          // Fetch attendance for each member this week
          const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
          const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
          
          const attendanceData = {}
          const goalsData = {}
          for (const memberId of groupData.members) {
            const records = await attendanceService.getByDateRange(memberId, weekStart, weekEnd)
            attendanceData[memberId] = records
            
            // Fetch active goals for each member
            const goals = await goalService.getByUser(memberId)
            goalsData[memberId] = goals.filter(g => g.status === 'active')
          }
          
          setMembers(memberData)
          setAttendance(attendanceData)
          setMemberGoals(goalsData)
          
          // Fetch group workouts
          const workouts = await groupWorkoutService.getByGroup(id)
          setGroupWorkouts(workouts)
        }
      } catch (error) {
        console.error('Error fetching group:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, user])

  const copyInviteCode = async () => {
    if (!group?.inviteCode) return
    await navigator.clipboard.writeText(group.inviteCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  const handleSearchUsers = async (term) => {
    setUserSearch(term)
    if (term.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const results = await userService.search(term)
      // Filter out users already in the group
      const filtered = results.filter(u => !group?.members?.includes(u.uid))
      setSearchResults(filtered)
    } catch (error) {
      console.error('Error searching users:', error)
    } finally {
      setSearching(false)
    }
  }

  const handleInviteUser = async (userId) => {
    setInviting(userId)
    try {
      await groupService.addMember(id, userId)
      // Refresh member list
      const memberData = await groupService.getMemberDetails([...group.members, userId])
      setMembers(memberData)
      setGroup(prev => ({ ...prev, members: [...prev.members, userId] }))
      // Remove from search results
      setSearchResults(prev => prev.filter(u => u.uid !== userId))
    } catch (error) {
      console.error('Error inviting user:', error)
      alert('Failed to invite user')
    } finally {
      setInviting(null)
    }
  }

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return
    
    try {
      await groupService.removeMember(id, user.uid)
      navigate('/groups')
    } catch (error) {
      console.error('Error leaving group:', error)
    }
  }

  const handleDeleteGroup = async () => {
    if (!confirm('Are you sure you want to delete this group? This cannot be undone.')) return
    
    try {
      await groupService.delete(id)
      navigate('/groups')
    } catch (error) {
      console.error('Error deleting group:', error)
    }
  }

  // Workout creation functions
  const openWorkoutModal = () => {
    const allMembers = group?.members || []
    setSelectedMembers(allMembers)
    setWorkoutDate(new Date().toISOString().split('T')[0])
    setWorkoutName('')
    // Initialize prescriptions for each member
    const initialPrescriptions = {}
    allMembers.forEach(memberId => {
      initialPrescriptions[memberId] = {
        exercises: [{ id: Date.now() + Math.random(), name: '', sets: [{ weight: '', reps: '' }] }]
      }
    })
    setMemberPrescriptions(initialPrescriptions)
    setActiveMemberTab(allMembers[0] || null)
    setEditingWorkoutIds(null) // Not editing
    setShowWorkoutModal(true)
  }

  const openEditWorkoutModal = (workoutGroup) => {
    // workoutGroup has: name, date, exercises, assignments: [{ id, memberId, status }]
    const assignedMemberIds = workoutGroup.assignments.map(a => a.memberId)
    setSelectedMembers(assignedMemberIds)
    
    // Format date
    const dateObj = getDisplayDate(workoutGroup.date)
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    setWorkoutDate(`${year}-${month}-${day}`)
    
    setWorkoutName(workoutGroup.name)
    
    // Build member prescriptions from existing exercises
    // We need to load each member's actual workout to get their specific exercises
    const initialPrescriptions = {}
    const workoutIds = {}
    
    workoutGroup.assignments.forEach(assignment => {
      // Find the actual workout data
      const memberWorkout = groupWorkouts.find(w => w.id === assignment.id)
      workoutIds[assignment.memberId] = assignment.id
      
      if (memberWorkout?.exercises?.length) {
        initialPrescriptions[assignment.memberId] = {
          exercises: memberWorkout.exercises.map(ex => {
            const type = ex.type || (ex.sets?.[0]?.prescribedTime ? 'time' : 'weight')
            return {
              id: Date.now() + Math.random(),
              name: ex.name,
              type: type,
              sets: ex.sets?.map(s => {
                if (type === 'time') {
                  return { time: s.prescribedTime || '' }
                } else if (type === 'bodyweight') {
                  return { reps: s.prescribedReps || '' }
                } else {
                  return { weight: s.prescribedWeight || '', reps: s.prescribedReps || '' }
                }
              }) || [{ weight: '', reps: '' }]
            }
          })
        }
      } else {
        initialPrescriptions[assignment.memberId] = {
          exercises: [{ id: Date.now() + Math.random(), name: '', type: 'weight', sets: [{ weight: '', reps: '' }] }]
        }
      }
    })
    
    setMemberPrescriptions(initialPrescriptions)
    setActiveMemberTab(assignedMemberIds[0] || null)
    setEditingWorkoutIds(workoutIds) // Store workout IDs for updating
    setShowWorkoutModal(true)
  }

  const addExerciseForMember = (memberId) => {
    setMemberPrescriptions(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        exercises: [
          ...(prev[memberId]?.exercises || []),
          { id: Date.now() + Math.random(), name: '', type: 'weight', sets: [{ weight: '', reps: '' }] }
        ]
      }
    }))
  }

  const removeExerciseForMember = (memberId, exerciseId) => {
    setMemberPrescriptions(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        exercises: prev[memberId].exercises.filter(e => e.id !== exerciseId)
      }
    }))
  }

  const updateExerciseForMember = (memberId, exerciseId, field, value) => {
    setMemberPrescriptions(prev => {
      const updated = { ...prev }
      const exercises = updated[memberId].exercises.map(e => {
        if (e.id !== exerciseId) return e
        
        const updatedExercise = { ...e, [field]: value }
        
        // If name changed, detect exercise type
        if (field === 'name') {
          const isTime = allTimeExercises.includes(value)
          const isBodyweight = allBodyweightExercises.includes(value) && !allWeightExercises.includes(value)
          
          if (isTime && e.type !== 'time') {
            updatedExercise.type = 'time'
            updatedExercise.sets = e.sets.map(s => ({ time: s.time || '' }))
          } else if (isBodyweight && e.type !== 'bodyweight') {
            updatedExercise.type = 'bodyweight'
            updatedExercise.sets = e.sets.map(s => ({ reps: s.reps || '' }))
          } else if (!isTime && !isBodyweight && e.type !== 'weight') {
            updatedExercise.type = 'weight'
            updatedExercise.sets = e.sets.map(s => ({ weight: s.weight || '', reps: s.reps || '' }))
          }
        }
        
        return updatedExercise
      })
      updated[memberId] = { ...updated[memberId], exercises }
      return updated
    })
  }

  const addSetForExercise = (memberId, exerciseId) => {
    setMemberPrescriptions(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        exercises: prev[memberId].exercises.map(e => {
          if (e.id !== exerciseId) return e
          
          const lastSet = e.sets[e.sets.length - 1]
          let newSet
          
          if (e.type === 'time') {
            newSet = { time: lastSet?.time || '' }
          } else if (e.type === 'bodyweight') {
            newSet = { reps: lastSet?.reps || '' }
          } else {
            newSet = { 
              weight: lastSet?.weight || '', 
              reps: lastSet?.reps || '' 
            }
          }
          
          return { ...e, sets: [...e.sets, newSet] }
        })
      }
    }))
  }

  const updateSetForExercise = (memberId, exerciseId, setIndex, field, value) => {
    setMemberPrescriptions(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        exercises: prev[memberId].exercises.map(e =>
          e.id === exerciseId
            ? {
                ...e,
                sets: e.sets.map((s, i) => i === setIndex ? { ...s, [field]: value } : s)
              }
            : e
        )
      }
    }))
  }

  const removeSetForExercise = (memberId, exerciseId, setIndex) => {
    setMemberPrescriptions(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        exercises: prev[memberId].exercises.map(e =>
          e.id === exerciseId
            ? { ...e, sets: e.sets.filter((_, i) => i !== setIndex) }
            : e
        )
      }
    }))
  }

  const copyPrescriptionToAll = (sourceMemberId) => {
    const sourceExercises = memberPrescriptions[sourceMemberId]?.exercises || []
    const copied = JSON.parse(JSON.stringify(sourceExercises))
    
    setMemberPrescriptions(prev => {
      const updated = { ...prev }
      selectedMembers.forEach(memberId => {
        if (memberId !== sourceMemberId) {
          // Deep copy with new IDs
          updated[memberId] = {
            exercises: copied.map(e => ({
              ...e,
              id: Date.now() + Math.random(),
              sets: e.sets.map(s => ({ ...s }))
            }))
          }
        }
      })
      return updated
    })
  }

  const toggleMemberSelection = (memberId) => {
    setSelectedMembers(prev => {
      const updated = prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
      
      // Initialize prescription if adding
      if (!prev.includes(memberId)) {
        setMemberPrescriptions(p => ({
          ...p,
          [memberId]: {
            exercises: [{ id: Date.now(), name: '', sets: [{ weight: '', reps: '' }] }]
          }
        }))
      }
      
      return updated
    })
  }

  const handleCreateGroupWorkout = async () => {
    if (!workoutName.trim() || selectedMembers.length === 0) {
      alert('Please enter a workout name and select at least one member')
      return
    }

    setCreatingWorkout(true)
    try {
      // Create date at noon local time to avoid timezone issues
      const [year, month, day] = workoutDate.split('-').map(Number)
      const localDate = new Date(year, month - 1, day, 12, 0, 0)

      // Helper to format exercises based on type
      const formatExercises = (prescription) => {
        return (prescription?.exercises || [])
          .filter(e => e.name.trim())
          .map(e => ({
            name: e.name,
            type: e.type || 'weight',
            sets: e.sets.map((s, i) => {
              const baseSet = {
                id: Date.now() + i,
                rpe: '',
                painLevel: 0
              }
              if (e.type === 'time') {
                return {
                  ...baseSet,
                  prescribedTime: s.time || '',
                  actualTime: ''
                }
              } else if (e.type === 'bodyweight') {
                return {
                  ...baseSet,
                  prescribedReps: s.reps || '',
                  actualReps: ''
                }
              } else {
                return {
                  ...baseSet,
                  prescribedWeight: s.weight || '',
                  prescribedReps: s.reps || '',
                  actualWeight: '',
                  actualReps: ''
                }
              }
            })
          }))
      }

      if (editingWorkoutIds) {
        // EDITING MODE - update existing workouts
        for (const memberId of selectedMembers) {
          const workoutId = editingWorkoutIds[memberId]
          if (!workoutId) continue // Skip if member wasn't in original assignment
          
          const prescription = memberPrescriptions[memberId]
          const formattedExercises = formatExercises(prescription)

          await groupWorkoutService.update(workoutId, {
            name: workoutName,
            date: localDate,
            exercises: formattedExercises
          })
        }
      } else {
        // CREATE MODE - create new workouts
        const memberWorkouts = selectedMembers.map(memberId => {
          const prescription = memberPrescriptions[memberId]
          const formattedExercises = formatExercises(prescription)

          return {
            assignedTo: memberId,
            name: workoutName,
            exercises: formattedExercises
          }
        })

        await groupWorkoutService.createBatch(
          id,
          group.admins,
          localDate,
          memberWorkouts
        )
      }

      // Refresh workouts list
      const workouts = await groupWorkoutService.getByGroup(id)
      setGroupWorkouts(workouts)

      setShowWorkoutModal(false)
      setEditingWorkoutIds(null)
      
      if (editingWorkoutIds) {
        alert('Workout updated!')
      } else {
        alert(`Workout assigned to ${selectedMembers.length} member${selectedMembers.length !== 1 ? 's' : ''}!`)
      }
    } catch (error) {
      console.error('Error saving group workout:', error)
      alert('Failed to save workout')
    } finally {
      setCreatingWorkout(false)
    }
  }

  const weekDays = eachDayOfInterval({
    start: startOfWeek(new Date(), { weekStartsOn: 1 }),
    end: endOfWeek(new Date(), { weekStartsOn: 1 })
  })

  const getMemberAttendance = (memberId) => {
    const records = attendance[memberId] || []
    return weekDays.map(day => {
      const record = records.find(r => {
        try {
          const recordDate = r.date?.toDate ? r.date.toDate() : new Date(r.date)
          return isSameDay(recordDate, day)
        } catch {
          return false
        }
      })
      return record?.status || null
    })
  }

  const getAttendanceColor = (status) => {
    switch (status) {
      case 'present': return 'bg-green-500'
      case 'missed': return 'bg-red-500'
      case 'vacation': return 'bg-blue-500'
      default: return 'bg-iron-700'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-display text-iron-200 mb-4">Group Not Found</h2>
        <Link to="/groups" className="btn-primary">
          Back to Groups
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={() => navigate('/groups')}
          className="flex items-center gap-2 text-iron-400 hover:text-iron-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Groups</span>
        </button>
        
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 text-iron-400 hover:text-iron-200 hover:bg-iron-800 rounded-lg transition-colors"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-48 bg-iron-800 border border-iron-700 rounded-lg shadow-xl z-20 overflow-hidden">
                {isAdmin && (
                  <Link
                    to={`/groups/${id}/settings`}
                    className="flex items-center gap-3 px-4 py-3 text-iron-300 hover:bg-iron-700 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Group Settings
                  </Link>
                )}
                <button
                  onClick={handleLeaveGroup}
                  className="w-full flex items-center gap-3 px-4 py-3 text-iron-300 hover:bg-iron-700 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Leave Group
                </button>
                {isAdmin && (
                  <button
                    onClick={handleDeleteGroup}
                    className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Group
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Group Info */}
      <div className="card-steel p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-flame-500/20 to-flame-600/10 flex items-center justify-center flex-shrink-0">
            <Users className="w-8 h-8 text-flame-400" />
          </div>
          
          <div className="flex-1">
            <h1 className="text-2xl font-display text-iron-100 mb-1">
              {group.name}
            </h1>
            <p className="text-iron-500 text-sm">
              {members.length} member{members.length !== 1 ? 's' : ''} · Created {safeFormatDate(group.createdAt)}
            </p>
          </div>
        </div>
        
        {/* Invite Code */}
        {isAdmin && group.inviteCode && (
          <div className="mt-6 p-4 bg-iron-800/50 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-iron-400 mb-1">Invite Code</p>
                <p className="text-xl font-mono font-bold text-iron-200 tracking-wider">
                  {group.inviteCode}
                </p>
              </div>
              <button
                onClick={copyInviteCode}
                className="btn-secondary flex items-center gap-2"
              >
                {codeCopied ? (
                  <>
                    <Check className="w-4 h-4 text-green-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-iron-800 overflow-x-auto">
        {['members', 'workouts', 'goals', 'attendance'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative ${
              activeTab === tab 
                ? 'text-flame-400' 
                : 'text-iron-500 hover:text-iron-300'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-flame-500" />
            )}
          </button>
        ))}
      </div>

      {/* Workouts Tab */}
      {activeTab === 'workouts' && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex gap-3">
              <button
                onClick={() => setShowAIGenerateModal(true)}
                className="btn-secondary flex-1 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                AI Generate
              </button>
              <button
                onClick={openWorkoutModal}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Manual
              </button>
            </div>
          )}
          
          {groupWorkouts.length === 0 ? (
            <div className="card-steel p-8 text-center">
              <Dumbbell className="w-12 h-12 text-iron-600 mx-auto mb-3" />
              <p className="text-iron-400">No group workouts yet</p>
              {isAdmin && (
                <p className="text-iron-500 text-sm mt-1">
                  Create a workout to assign it to group members
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Group workouts by name + date */}
              {(() => {
                // Create unique workout groups
                const workoutGroups = {}
                groupWorkouts.forEach(workout => {
                  const dateStr = safeFormatDate(workout.date, 'yyyy-MM-dd')
                  const key = `${workout.name}-${dateStr}`
                  if (!workoutGroups[key]) {
                    workoutGroups[key] = {
                      name: workout.name,
                      date: workout.date,
                      exercises: workout.exercises,
                      assignments: []
                    }
                  }
                  workoutGroups[key].assignments.push({
                    id: workout.id,
                    memberId: workout.assignedTo,
                    status: workout.status
                  })
                })

                return Object.entries(workoutGroups).map(([key, workoutGroup]) => {
                  const isExpanded = expandedWorkout === key
                  const completedCount = workoutGroup.assignments.filter(a => a.status === 'completed').length
                  const totalCount = workoutGroup.assignments.length
                  
                  return (
                    <div key={key} className="card-steel overflow-hidden">
                      {/* Workout Header - Click to expand */}
                      <button
                        onClick={() => setExpandedWorkout(isExpanded ? null : key)}
                        className="w-full p-4 flex items-center gap-4 text-left hover:bg-iron-800/30 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-xl bg-flame-500/10 flex items-center justify-center flex-shrink-0">
                          <Dumbbell className="w-5 h-5 text-flame-400" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-iron-100">{workoutGroup.name}</h3>
                          <div className="flex items-center gap-2 text-sm text-iron-500">
                            <span>{safeFormatDate(workoutGroup.date, 'EEE, MMM d')}</span>
                            <span>·</span>
                            <span>{workoutGroup.exercises?.length || 0} exercises</span>
                            <span>·</span>
                            <span className={completedCount === totalCount ? 'text-green-400' : ''}>
                              {completedCount}/{totalCount} done
                            </span>
                          </div>
                        </div>
                        
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-iron-500" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-iron-500" />
                        )}
                      </button>
                      
                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="border-t border-iron-800">
                          {/* Exercise Summary */}
                          <div className="p-4 bg-iron-800/20 border-b border-iron-800">
                            <p className="text-xs text-iron-500 uppercase tracking-wide mb-2">Exercises</p>
                            <div className="flex flex-wrap gap-2">
                              {workoutGroup.exercises?.map((ex, i) => (
                                <span key={i} className="px-2 py-1 bg-iron-800 rounded text-sm text-iron-300">
                                  {ex.name} ({ex.sets?.length || 0}×)
                                </span>
                              ))}
                            </div>
                          </div>
                          
                          {/* Member Assignments */}
                          <div className="p-4">
                            <p className="text-xs text-iron-500 uppercase tracking-wide mb-3">Assigned Members</p>
                            <div className="space-y-2">
                              {workoutGroup.assignments.map(assignment => {
                                const member = members.find(m => m.uid === assignment.memberId)
                                return (
                                  <Link
                                    key={assignment.id}
                                    to={`/workouts/group/${assignment.id}`}
                                    state={{ from: `/groups/${id}`, fromLabel: 'Back to Group' }}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-iron-800/30 hover:bg-iron-800/50 transition-colors"
                                  >
                                    {member?.photoURL ? (
                                      <img src={member.photoURL} alt="" className="w-8 h-8 rounded-full" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-full bg-iron-700 flex items-center justify-center">
                                        <span className="text-sm text-iron-400">{member?.displayName?.[0] || '?'}</span>
                                      </div>
                                    )}
                                    <span className="flex-1 text-iron-200">{member?.displayName || 'Unknown'}</span>
                                    {assignment.status === 'completed' ? (
                                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">Done</span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium">Pending</span>
                                    )}
                                    <ChevronRight className="w-4 h-4 text-iron-600" />
                                  </Link>
                                )
                              })}
                            </div>
                          </div>
                          
                          {/* Admin Edit Button */}
                          {isAdmin && (
                            <div className="p-4 border-t border-iron-800">
                              <button
                                onClick={() => openEditWorkoutModal(workoutGroup)}
                                className="btn-secondary w-full flex items-center justify-center gap-2"
                              >
                                <Edit2 className="w-4 h-4" />
                                Edit Workout
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          {members.map(member => (
            <Link 
              key={member.uid} 
              to={`/profile/${member.username || member.uid}`}
              state={{ from: `/groups/${id}`, fromLabel: 'Back to Group' }}
              className="card-steel p-4 flex items-center gap-4 hover:border-iron-600 transition-colors"
            >
              {member.photoURL ? (
                <img 
                  src={member.photoURL} 
                  alt={member.displayName}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-iron-700 flex items-center justify-center">
                  <span className="text-lg font-bold text-iron-400">
                    {member.displayName?.[0] || 'U'}
                  </span>
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-iron-100 truncate">
                    {member.displayName || 'Unknown'}
                  </h3>
                  {group.admins?.includes(member.uid) && (
                    <Crown className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                  )}
                  {member.uid === user.uid && (
                    <span className="text-xs text-iron-500">(you)</span>
                  )}
                </div>
                {member.username && (
                  <p className="text-xs text-iron-500">@{member.username}</p>
                )}
              </div>
              
              {/* Mini attendance dots */}
              <div className="hidden sm:flex gap-1">
                {getMemberAttendance(member.uid).map((status, i) => (
                  <div 
                    key={i}
                    className={`w-2 h-2 rounded-full ${getAttendanceColor(status)}`}
                    title={format(weekDays[i], 'EEE')}
                  />
                ))}
              </div>
            </Link>
          ))}
          
          {isAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="w-full card-steel p-4 flex items-center justify-center gap-2 text-iron-400 hover:text-iron-200 hover:border-iron-600 transition-colors"
            >
              <UserPlus className="w-5 h-5" />
              Invite Members
            </button>
          )}
        </div>
      )}

      {/* Attendance Tab */}
      {activeTab === 'attendance' && (
        <div className="card-steel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-iron-700">
                  <th className="text-left px-4 py-3 text-sm font-medium text-iron-400">
                    Member
                  </th>
                  {weekDays.map(day => (
                    <th 
                      key={day.toISOString()} 
                      className={`px-3 py-3 text-center text-sm font-medium ${
                        isToday(day) ? 'text-flame-400' : 'text-iron-400'
                      }`}
                    >
                      {format(day, 'EEE')}
                      <div className="text-xs text-iron-600 font-normal">
                        {format(day, 'd')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.uid} className="border-b border-iron-800 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {member.photoURL ? (
                          <img 
                            src={member.photoURL} 
                            alt=""
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-iron-700 flex items-center justify-center">
                            <span className="text-sm font-bold text-iron-400">
                              {member.displayName?.[0]}
                            </span>
                          </div>
                        )}
                        <span className="text-sm text-iron-200 truncate max-w-[100px]">
                          {member.displayName?.split(' ')[0]}
                        </span>
                      </div>
                    </td>
                    {getMemberAttendance(member.uid).map((status, i) => (
                      <td key={i} className="px-3 py-3 text-center">
                        <div 
                          className={`w-6 h-6 rounded-full mx-auto ${getAttendanceColor(status)}`}
                          title={status || 'No data'}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="px-4 py-3 bg-iron-800/50 flex gap-4 text-xs text-iron-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500" /> Present
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" /> Missed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500" /> Vacation
            </span>
          </div>
        </div>
      )}

      {/* Goals Tab */}
      {activeTab === 'goals' && (
        <div className="space-y-4">
          {members.map(member => (
            <div key={member.uid} className="card-steel rounded-xl overflow-hidden">
              <div className="p-4 border-b border-iron-800 flex items-center gap-3">
                {member.photoURL ? (
                  <img 
                    src={member.photoURL} 
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-iron-700 flex items-center justify-center">
                    <span className="font-bold text-iron-400">
                      {member.displayName?.[0]}
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="font-medium text-iron-100">
                    {member.displayName}
                    {member.uid === user.uid && (
                      <span className="text-xs text-iron-500 ml-2">(you)</span>
                    )}
                  </h3>
                </div>
              </div>
              <div className="p-4">
                {memberGoals[member.uid]?.length > 0 ? (
                  <div className="space-y-3">
                    {memberGoals[member.uid].map(goal => {
                      const current = goal.currentValue ?? goal.currentWeight ?? 0
                      const target = goal.targetValue ?? goal.targetWeight ?? 0
                      const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0
                      const unit = goal.metricType === 'time' ? 'sec' : goal.metricType === 'reps' ? 'reps' : 'lbs'
                      
                      return (
                        <div key={goal.id} className="bg-iron-800/50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-iron-200">{goal.lift}</span>
                            <span className="text-sm text-iron-400">
                              {current} / {target} {unit}
                            </span>
                          </div>
                          <div className="h-2 bg-iron-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-flame-500 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-iron-500 text-sm text-center py-2">No active goals</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Workout Creation Modal */}
      {showWorkoutModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-iron-900 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-iron-900 border-b border-iron-800 p-4 flex items-center justify-between flex-shrink-0">
              <h2 className="text-xl font-display text-iron-100">
                {editingWorkoutIds ? 'Edit Group Workout' : 'Assign Group Workout'}
              </h2>
              <button
                onClick={() => { setShowWorkoutModal(false); setEditingWorkoutIds(null); }}
                className="p-2 text-iron-400 hover:text-iron-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-iron-300 mb-2">
                    Workout Name *
                  </label>
                  <input
                    type="text"
                    value={workoutName}
                    onChange={(e) => setWorkoutName(e.target.value)}
                    placeholder="e.g., Push Day, Bench Focus"
                    className="input-field w-full text-base py-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-iron-300 mb-2">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={workoutDate}
                    onChange={(e) => setWorkoutDate(e.target.value)}
                    className="input-field w-full text-base py-3"
                  />
                </div>
              </div>

              {/* Member Selection */}
              <div>
                <label className="block text-sm font-medium text-iron-300 mb-3">
                  {editingWorkoutIds ? 'Assigned Members' : 'Assign to Members'}
                </label>
                {editingWorkoutIds && (
                  <p className="text-xs text-iron-500 mb-2">Members cannot be changed when editing. Create a new workout to assign to different members.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {members.map(member => {
                    const isAssigned = selectedMembers.includes(member.uid)
                    const isDisabled = editingWorkoutIds && !isAssigned
                    
                    return (
                      <button
                        key={member.uid}
                        onClick={() => !editingWorkoutIds && toggleMemberSelection(member.uid)}
                        disabled={editingWorkoutIds}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                          isAssigned
                            ? 'bg-flame-500/20 border border-flame-500/50 text-flame-200'
                            : isDisabled
                              ? 'bg-iron-800/30 border border-iron-800 text-iron-600 cursor-not-allowed'
                              : 'bg-iron-800/50 border border-iron-700 text-iron-400 hover:border-iron-600'
                        }`}
                      >
                        {member.photoURL ? (
                          <img src={member.photoURL} alt="" className="w-5 h-5 rounded-full" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-iron-700 flex items-center justify-center text-xs">
                            {member.displayName?.[0]}
                          </div>
                        )}
                        <span className="text-sm">{member.displayName?.split(' ')[0]}</span>
                        {isAssigned && (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Per-Member Prescriptions */}
              {selectedMembers.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-iron-300">
                      Prescriptions by Member
                    </label>
                    {activeMemberTab && selectedMembers.length > 1 && (
                      <button
                        onClick={() => copyPrescriptionToAll(activeMemberTab)}
                        className="text-xs text-flame-400 hover:text-flame-300 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        Copy to all members
                      </button>
                    )}
                  </div>

                  {/* Member Tabs */}
                  <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
                    {selectedMembers.map(memberId => {
                      const member = members.find(m => m.uid === memberId)
                      return (
                        <button
                          key={memberId}
                          onClick={() => setActiveMemberTab(memberId)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
                            activeMemberTab === memberId
                              ? 'bg-flame-500 text-white'
                              : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                          }`}
                        >
                          {member?.photoURL ? (
                            <img src={member.photoURL} alt="" className="w-5 h-5 rounded-full" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-iron-600 flex items-center justify-center text-xs">
                              {member?.displayName?.[0]}
                            </div>
                          )}
                          <span className="text-sm">{member?.displayName?.split(' ')[0]}</span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Active Member's Exercises */}
                  {activeMemberTab && memberPrescriptions[activeMemberTab] && (
                    <div className="space-y-4">
                      {memberPrescriptions[activeMemberTab].exercises.map((exercise, exIndex) => (
                        <div key={exercise.id} className="bg-iron-800/50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="w-7 h-7 rounded-lg bg-flame-500/20 text-flame-400 flex items-center justify-center text-sm font-medium">
                              {exIndex + 1}
                            </span>
                            <select
                              value={exercise.name}
                              onChange={(e) => updateExerciseForMember(activeMemberTab, exercise.id, 'name', e.target.value)}
                              className="input-field flex-1 text-base py-2"
                            >
                              <option value="">Select exercise</option>
                              <optgroup label="Weight Exercises">
                                {allWeightExercises.map(ex => (
                                  <option key={ex} value={ex}>{ex}</option>
                                ))}
                              </optgroup>
                              <optgroup label="Bodyweight">
                                {allBodyweightExercises.map(ex => (
                                  <option key={`bw-${ex}`} value={ex}>{ex}</option>
                                ))}
                              </optgroup>
                              <optgroup label="Time-Based">
                                {allTimeExercises.map(ex => (
                                  <option key={`t-${ex}`} value={ex}>{ex}</option>
                                ))}
                              </optgroup>
                            </select>
                            {memberPrescriptions[activeMemberTab].exercises.length > 1 && (
                              <button
                                onClick={() => removeExerciseForMember(activeMemberTab, exercise.id)}
                                className="p-2 text-iron-500 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Sets */}
                          <div className="space-y-2">
                            {exercise.type === 'time' ? (
                              /* Time-based exercise */
                              <>
                                <div className="grid grid-cols-12 gap-2 text-xs text-iron-500 px-1">
                                  <div className="col-span-2">Set</div>
                                  <div className="col-span-8">Time (seconds)</div>
                                  <div className="col-span-2"></div>
                                </div>
                                {exercise.sets.map((set, setIndex) => (
                                  <div key={setIndex} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-2">
                                      <span className="text-iron-400 text-sm font-medium pl-1">{setIndex + 1}</span>
                                    </div>
                                    <div className="col-span-8">
                                      <input
                                        type="number"
                                        inputMode="numeric"
                                        value={set.time || ''}
                                        onChange={(e) => updateSetForExercise(activeMemberTab, exercise.id, setIndex, 'time', e.target.value)}
                                        placeholder="60"
                                        className="input-field w-full text-base py-2 px-3"
                                      />
                                    </div>
                                    <div className="col-span-2 flex justify-end">
                                      {exercise.sets.length > 1 && (
                                        <button
                                          onClick={() => removeSetForExercise(activeMemberTab, exercise.id, setIndex)}
                                          className="p-1 text-iron-600 hover:text-red-400 transition-colors"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </>
                            ) : exercise.type === 'bodyweight' ? (
                              /* Bodyweight exercise - reps only */
                              <>
                                <div className="grid grid-cols-12 gap-2 text-xs text-iron-500 px-1">
                                  <div className="col-span-2">Set</div>
                                  <div className="col-span-8">Reps</div>
                                  <div className="col-span-2"></div>
                                </div>
                                {exercise.sets.map((set, setIndex) => (
                                  <div key={setIndex} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-2">
                                      <span className="text-iron-400 text-sm font-medium pl-1">{setIndex + 1}</span>
                                    </div>
                                    <div className="col-span-8">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={set.reps || ''}
                                        onChange={(e) => updateSetForExercise(activeMemberTab, exercise.id, setIndex, 'reps', e.target.value)}
                                        onBlur={(e) => updateSetForExercise(activeMemberTab, exercise.id, setIndex, 'reps', normalizeRepRange(e.target.value))}
                                        placeholder="e.g. 10 or 8-12"
                                        className="input-field w-full text-base py-2 px-3"
                                      />
                                    </div>
                                    <div className="col-span-2 flex justify-end">
                                      {exercise.sets.length > 1 && (
                                        <button
                                          onClick={() => removeSetForExercise(activeMemberTab, exercise.id, setIndex)}
                                          className="p-1 text-iron-600 hover:text-red-400 transition-colors"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </>
                            ) : (
                              /* Weight exercise - weight + reps */
                              <>
                                <div className="grid grid-cols-12 gap-2 text-xs text-iron-500 px-1">
                                  <div className="col-span-2">Set</div>
                                  <div className="col-span-4">Weight</div>
                                  <div className="col-span-4">Reps</div>
                                  <div className="col-span-2"></div>
                                </div>
                                {exercise.sets.map((set, setIndex) => (
                                  <div key={setIndex} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-2">
                                      <span className="text-iron-400 text-sm font-medium pl-1">{setIndex + 1}</span>
                                    </div>
                                    <div className="col-span-4">
                                      <input
                                        type="text"
                                        value={set.weight || ''}
                                        onChange={(e) => updateSetForExercise(activeMemberTab, exercise.id, setIndex, 'weight', e.target.value)}
                                        placeholder="lbs"
                                        className="input-field w-full text-base py-2 px-3"
                                      />
                                    </div>
                                    <div className="col-span-4">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={set.reps || ''}
                                        onChange={(e) => updateSetForExercise(activeMemberTab, exercise.id, setIndex, 'reps', e.target.value)}
                                        onBlur={(e) => updateSetForExercise(activeMemberTab, exercise.id, setIndex, 'reps', normalizeRepRange(e.target.value))}
                                        placeholder="e.g. 8 or 6-8"
                                        className="input-field w-full text-base py-2 px-3"
                                      />
                                    </div>
                                    <div className="col-span-2 flex justify-end">
                                      {exercise.sets.length > 1 && (
                                        <button
                                          onClick={() => removeSetForExercise(activeMemberTab, exercise.id, setIndex)}
                                          className="p-1 text-iron-600 hover:text-red-400 transition-colors"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                            <button
                              onClick={() => addSetForExercise(activeMemberTab, exercise.id)}
                              className="w-full py-2 text-xs text-iron-500 hover:text-iron-300 flex items-center justify-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              Add Set
                            </button>
                          </div>
                        </div>
                      ))}

                      <button
                        onClick={() => addExerciseForMember(activeMemberTab)}
                        className="w-full py-3 border border-dashed border-iron-700 rounded-lg text-iron-400 hover:text-iron-200 hover:border-iron-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add Exercise
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="bg-iron-900 border-t border-iron-800 p-4 flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowWorkoutModal(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroupWorkout}
                disabled={creatingWorkout || !workoutName.trim() || selectedMembers.length === 0}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {creatingWorkout 
                  ? (editingWorkoutIds ? 'Saving...' : 'Creating...') 
                  : (editingWorkoutIds 
                      ? 'Save Changes' 
                      : `Assign to ${selectedMembers.length} Member${selectedMembers.length !== 1 ? 's' : ''}`
                    )
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Members Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-iron-900 rounded-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-iron-800 flex items-center justify-between">
              <h2 className="text-xl font-display text-iron-100">Invite Members</h2>
              <button
                onClick={() => {
                  setShowInviteModal(false)
                  setUserSearch('')
                  setSearchResults([])
                }}
                className="p-2 text-iron-400 hover:text-iron-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-iron-800">
              <button
                onClick={() => setInviteTab('code')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  inviteTab === 'code'
                    ? 'text-flame-400 border-b-2 border-flame-400'
                    : 'text-iron-400 hover:text-iron-200'
                }`}
              >
                Share Code
              </button>
              <button
                onClick={() => setInviteTab('search')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  inviteTab === 'search'
                    ? 'text-flame-400 border-b-2 border-flame-400'
                    : 'text-iron-400 hover:text-iron-200'
                }`}
              >
                Search Users
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {inviteTab === 'code' ? (
                <div className="space-y-4">
                  <p className="text-iron-400 text-sm">
                    Share this code with people you want to invite to the group.
                  </p>
                  
                  <div className="bg-iron-800/50 rounded-xl p-6 text-center">
                    <p className="text-3xl font-mono font-bold text-iron-100 tracking-widest mb-4">
                      {group?.inviteCode || 'No code'}
                    </p>
                    <button
                      onClick={copyInviteCode}
                      className="btn-secondary flex items-center gap-2 mx-auto"
                    >
                      {codeCopied ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Code
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-iron-500 text-xs text-center">
                    Members can join using this code in Groups → Join Group
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-iron-500" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => handleSearchUsers(e.target.value)}
                      placeholder="Search by name or email..."
                      className="input-field w-full pl-10 py-3"
                      autoFocus
                    />
                  </div>

                  {searching ? (
                    <div className="py-8 text-center">
                      <div className="w-6 h-6 border-2 border-flame-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="space-y-2">
                      {searchResults.map(u => (
                        <div
                          key={u.uid}
                          className="flex items-center justify-between p-3 bg-iron-800/50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-10 h-10 rounded-full" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-iron-700 flex items-center justify-center">
                                <span className="text-iron-400 font-medium">
                                  {u.displayName?.[0] || '?'}
                                </span>
                              </div>
                            )}
                            <div>
                              <p className="text-iron-100 font-medium">{u.displayName}</p>
                              <p className="text-iron-500 text-sm">{u.email}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleInviteUser(u.uid)}
                            disabled={inviting === u.uid}
                            className="btn-primary text-sm py-2 px-4 disabled:opacity-50"
                          >
                            {inviting === u.uid ? 'Adding...' : 'Add'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : userSearch.length >= 2 ? (
                    <div className="py-8 text-center">
                      <Users className="w-10 h-10 text-iron-700 mx-auto mb-2" />
                      <p className="text-iron-500">No users found</p>
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <Search className="w-10 h-10 text-iron-700 mx-auto mb-2" />
                      <p className="text-iron-500">Type to search for users</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Generate Group Workout Modal */}
      <GenerateGroupWorkoutModal
        isOpen={showAIGenerateModal}
        onClose={() => setShowAIGenerateModal(false)}
        group={group}
        athletes={members.filter(m => !group.admins?.includes(m.uid))}
        coachId={user.uid}
        onSuccess={() => {
          // Refresh workouts list
          groupWorkoutService.getByGroup(id).then(setGroupWorkouts)
        }}
      />
    </div>
  )
}