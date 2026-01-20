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
  TrendingUp,
  Target,
  Flame,
  Medal,
  Plus,
  Dumbbell,
  X,
  ChevronDown,
  ChevronRight,
  Edit2
} from 'lucide-react'
import { groupService, workoutService, attendanceService, groupWorkoutService } from '../services/firestore'
import { useAuth } from '../context/AuthContext'

// Helper to safely parse dates from Firestore
const safeFormatDate = (date, formatStr = 'MMM d, yyyy') => {
  if (!date) return ''
  try {
    let dateObj
    if (date?.toDate) {
      dateObj = date.toDate()
    } else if (date?.seconds) {
      dateObj = new Date(date.seconds * 1000)
    } else if (typeof date === 'string' || typeof date === 'number') {
      dateObj = new Date(date)
    } else if (date instanceof Date) {
      dateObj = date
    } else {
      return ''
    }
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

export default function GroupDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [attendance, setAttendance] = useState({})
  const [groupWorkouts, setGroupWorkouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showMenu, setShowMenu] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('members')
  
  // Workout creation state
  const [showWorkoutModal, setShowWorkoutModal] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState([])
  const [workoutDate, setWorkoutDate] = useState(new Date().toISOString().split('T')[0])
  const [workoutName, setWorkoutName] = useState('')
  // Per-member workout prescriptions: { oduserId: { exercises: [...] } }
  const [memberPrescriptions, setMemberPrescriptions] = useState({})
  const [activeMemberTab, setActiveMemberTab] = useState(null)
  const [creatingWorkout, setCreatingWorkout] = useState(false)

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
          for (const memberId of groupData.members) {
            const records = await attendanceService.getByDateRange(memberId, weekStart, weekEnd)
            attendanceData[memberId] = records
          }
          
          setMembers(memberData)
          setAttendance(attendanceData)
          
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
    setShowWorkoutModal(true)
  }

  const addExerciseForMember = (memberId) => {
    setMemberPrescriptions(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        exercises: [
          ...(prev[memberId]?.exercises || []),
          { id: Date.now() + Math.random(), name: '', sets: [{ weight: '', reps: '' }] }
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
    setMemberPrescriptions(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        exercises: prev[memberId].exercises.map(e =>
          e.id === exerciseId ? { ...e, [field]: value } : e
        )
      }
    }))
  }

  const addSetForExercise = (memberId, exerciseId) => {
    setMemberPrescriptions(prev => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        exercises: prev[memberId].exercises.map(e =>
          e.id === exerciseId
            ? { ...e, sets: [...e.sets, { weight: '', reps: '' }] }
            : e
        )
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
      const memberWorkouts = selectedMembers.map(memberId => {
        const prescription = memberPrescriptions[memberId]
        const formattedExercises = (prescription?.exercises || [])
          .filter(e => e.name.trim())
          .map(e => ({
            name: e.name,
            sets: e.sets.map((s, i) => ({
              id: Date.now() + i,
              prescribedWeight: s.weight,
              prescribedReps: s.reps,
              actualWeight: '',
              actualReps: '',
              rpe: '',
              painLevel: 0
            }))
          }))

        return {
          assignedTo: memberId,
          name: workoutName,
          exercises: formattedExercises
        }
      })

      await groupWorkoutService.createBatch(
        id,
        group.admins,
        new Date(workoutDate),
        memberWorkouts
      )

      // Refresh workouts list
      const workouts = await groupWorkoutService.getByGroup(id)
      setGroupWorkouts(workouts)

      setShowWorkoutModal(false)
      alert(`Workout assigned to ${selectedMembers.length} member(s)!`)
    } catch (error) {
      console.error('Error creating group workout:', error)
      alert('Failed to create workout')
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

  const calculateStreak = (memberId) => {
    const records = attendance[memberId] || []
    let streak = 0
    const sorted = records
      .filter(r => r.status === 'present')
      .sort((a, b) => {
        try {
          const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date)
          const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date)
          return dateB - dateA
        } catch {
          return 0
        }
      })
    
    // Simple streak count for demo
    return sorted.length
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
        {['members', 'workouts', 'attendance', 'leaderboard'].map(tab => (
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
            <button
              onClick={openWorkoutModal}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Workout for Group
            </button>
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
              {groupWorkouts.map(workout => {
                const assignedMember = members.find(m => m.uid === workout.userId)
                return (
                  <Link 
                    key={workout.id} 
                    to={`/workouts/${workout.id}`}
                    className="card-steel p-4 block hover:border-iron-600 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-iron-100">{workout.name}</h3>
                      <span className="text-sm text-iron-500">
                        {safeFormatDate(workout.date, 'MMM d')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {assignedMember?.photoURL ? (
                        <img 
                          src={assignedMember.photoURL} 
                          alt=""
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-iron-700 flex items-center justify-center">
                          <span className="text-xs text-iron-400">
                            {assignedMember?.displayName?.[0] || '?'}
                          </span>
                        </div>
                      )}
                      <span className="text-sm text-iron-400">
                        {assignedMember?.displayName || 'Unknown'}
                      </span>
                      <span className="text-iron-600 mx-1">·</span>
                      <span className="text-sm text-iron-500">
                        {workout.exercises?.length || 0} exercises
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="space-y-3">
          {members.map(member => (
            <div key={member.uid} className="card-steel p-4 flex items-center gap-4">
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
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-sm text-iron-500">
                    <Flame className="w-3 h-3 text-flame-500" />
                    {calculateStreak(member.uid)} day streak
                  </span>
                </div>
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
            </div>
          ))}
          
          {isAdmin && (
            <button
              onClick={copyInviteCode}
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

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-3">
          {members
            .sort((a, b) => calculateStreak(b.uid) - calculateStreak(a.uid))
            .map((member, index) => (
              <div 
                key={member.uid} 
                className={`card-steel p-4 flex items-center gap-4 ${
                  index === 0 ? 'border-yellow-500/30 bg-yellow-500/5' :
                  index === 1 ? 'border-iron-400/30 bg-iron-400/5' :
                  index === 2 ? 'border-orange-600/30 bg-orange-600/5' : ''
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display text-xl ${
                  index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                  index === 1 ? 'bg-iron-400/20 text-iron-300' :
                  index === 2 ? 'bg-orange-600/20 text-orange-400' :
                  'bg-iron-800 text-iron-500'
                }`}>
                  {index < 3 ? (
                    <Medal className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                
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
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-iron-100 truncate">
                    {member.displayName}
                    {member.uid === user.uid && (
                      <span className="text-xs text-iron-500 ml-2">(you)</span>
                    )}
                  </h3>
                </div>
                
                <div className="text-right">
                  <p className="text-xl font-display text-flame-400">
                    {calculateStreak(member.uid)}
                  </p>
                  <p className="text-xs text-iron-500">day streak</p>
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
              <h2 className="text-xl font-display text-iron-100">Assign Group Workout</h2>
              <button
                onClick={() => setShowWorkoutModal(false)}
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
                  Assign to Members
                </label>
                <div className="flex flex-wrap gap-2">
                  {members.map(member => (
                    <button
                      key={member.uid}
                      onClick={() => toggleMemberSelection(member.uid)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                        selectedMembers.includes(member.uid)
                          ? 'bg-flame-500/20 border border-flame-500/50 text-flame-200'
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
                      {selectedMembers.includes(member.uid) && (
                        <Check className="w-4 h-4" />
                      )}
                    </button>
                  ))}
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
                              {COMMON_EXERCISES.map(ex => (
                                <option key={ex} value={ex}>{ex}</option>
                              ))}
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
                            <div className="grid grid-cols-12 gap-2 text-xs text-iron-500 px-1">
                              <div className="col-span-2">Set</div>
                              <div className="col-span-4">Weight (lbs)</div>
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
                                    type="number"
                                    inputMode="decimal"
                                    value={set.weight}
                                    onChange={(e) => updateSetForExercise(activeMemberTab, exercise.id, setIndex, 'weight', e.target.value)}
                                    placeholder="135"
                                    className="input-field w-full text-base py-2 px-3"
                                  />
                                </div>
                                <div className="col-span-4">
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    value={set.reps}
                                    onChange={(e) => updateSetForExercise(activeMemberTab, exercise.id, setIndex, 'reps', e.target.value)}
                                    placeholder="8"
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
                {creatingWorkout ? 'Creating...' : `Assign to ${selectedMembers.length} Member${selectedMembers.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
