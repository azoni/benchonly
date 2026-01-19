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
  Medal
} from 'lucide-react'
import { groupService, workoutService, attendanceService } from '../services/firestore'
import { useAuth } from '../context/AuthContext'

export default function GroupDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [attendance, setAttendance] = useState({})
  const [loading, setLoading] = useState(true)
  const [showMenu, setShowMenu] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('members')

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

  const weekDays = eachDayOfInterval({
    start: startOfWeek(new Date(), { weekStartsOn: 1 }),
    end: endOfWeek(new Date(), { weekStartsOn: 1 })
  })

  const getMemberAttendance = (memberId) => {
    const records = attendance[memberId] || []
    return weekDays.map(day => {
      const record = records.find(r => isSameDay(new Date(r.date), day))
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
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    
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
              {members.length} member{members.length !== 1 ? 's' : ''} · Created {format(new Date(group.createdAt), 'MMM d, yyyy')}
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
        {['members', 'attendance', 'leaderboard'].map(tab => (
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
    </div>
  )
}
