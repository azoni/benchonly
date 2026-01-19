import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { 
  Users, 
  Plus, 
  Search, 
  Crown, 
  ChevronRight,
  UserPlus,
  Copy,
  Check,
  X
} from 'lucide-react'
import { groupService } from '../services/firestore'
import { useAuth } from '../context/AuthContext'

export default function GroupsPage() {
  const { user } = useAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    async function fetchGroups() {
      if (!user) return
      try {
        const data = await groupService.getByUser(user.uid)
        setGroups(data)
      } catch (error) {
        console.error('Error fetching groups:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchGroups()
  }, [user])

  const handleCreateGroup = async (e) => {
    e.preventDefault()
    if (!newGroupName.trim()) return
    
    setCreating(true)
    try {
      const newGroup = await groupService.create({
        name: newGroupName.trim(),
        creatorId: user.uid,
        members: [user.uid],
        admins: [user.uid]
      })
      setGroups(prev => [...prev, newGroup])
      setNewGroupName('')
      setShowCreateModal(false)
    } catch (error) {
      console.error('Error creating group:', error)
    } finally {
      setCreating(false)
    }
  }

  const handleJoinGroup = async (e) => {
    e.preventDefault()
    if (!joinCode.trim()) return
    
    setJoining(true)
    try {
      const group = await groupService.joinByCode(joinCode.trim(), user.uid)
      if (group) {
        setGroups(prev => [...prev, group])
        setJoinCode('')
        setShowJoinModal(false)
      }
    } catch (error) {
      console.error('Error joining group:', error)
    } finally {
      setJoining(false)
    }
  }

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display text-iron-100">Groups</h1>
          <p className="text-iron-500 text-sm mt-1">
            Train together, stay accountable
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowJoinModal(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Join</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-iron-500" />
        <input
          type="text"
          placeholder="Search groups..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field w-full pl-12"
        />
      </div>

      {/* Groups List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredGroups.length > 0 ? (
        <div className="space-y-3">
          {filteredGroups.map(group => (
            <Link
              key={group.id}
              to={`/groups/${group.id}`}
              className="card-steel p-4 flex items-center gap-4 hover:border-iron-600 transition-colors group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-flame-500/20 to-flame-600/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-flame-400" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-iron-100 truncate">
                    {group.name}
                  </h3>
                  {group.admins?.includes(user.uid) && (
                    <Crown className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-iron-500">
                  {group.members?.length || 1} member{(group.members?.length || 1) !== 1 ? 's' : ''}
                </p>
              </div>
              
              <ChevronRight className="w-5 h-5 text-iron-600 group-hover:text-iron-400 transition-colors" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="card-steel p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-iron-800 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-iron-500" />
          </div>
          <h3 className="text-lg font-display text-iron-300 mb-2">
            {searchQuery ? 'No groups found' : 'No groups yet'}
          </h3>
          <p className="text-iron-500 text-sm mb-6 max-w-sm mx-auto">
            {searchQuery 
              ? 'Try a different search term'
              : 'Create a group to train with friends and track progress together'
            }
          </p>
          {!searchQuery && (
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowJoinModal(true)}
                className="btn-secondary"
              >
                Join Group
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary"
              >
                Create Group
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-iron-900 border border-iron-700 rounded-2xl p-6 w-full max-w-md animate-scale-in">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-iron-500 hover:text-iron-300"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl font-display text-iron-100 mb-2">
              Create Group
            </h2>
            <p className="text-iron-500 text-sm mb-6">
              Start a new workout group and invite your friends
            </p>
            
            <form onSubmit={handleCreateGroup}>
              <label className="block text-sm font-medium text-iron-400 mb-2">
                Group Name
              </label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., Morning Lifters"
                className="input-field w-full mb-6"
                autoFocus
              />
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newGroupName.trim() || creating}
                  className="btn-primary flex-1"
                >
                  {creating ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Group Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowJoinModal(false)}
          />
          <div className="relative bg-iron-900 border border-iron-700 rounded-2xl p-6 w-full max-w-md animate-scale-in">
            <button
              onClick={() => setShowJoinModal(false)}
              className="absolute top-4 right-4 text-iron-500 hover:text-iron-300"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl font-display text-iron-100 mb-2">
              Join Group
            </h2>
            <p className="text-iron-500 text-sm mb-6">
              Enter the invite code shared by your group admin
            </p>
            
            <form onSubmit={handleJoinGroup}>
              <label className="block text-sm font-medium text-iron-400 mb-2">
                Invite Code
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter code"
                className="input-field w-full mb-6 text-center text-xl tracking-widest font-mono"
                maxLength={8}
                autoFocus
              />
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!joinCode.trim() || joining}
                  className="btn-primary flex-1"
                >
                  {joining ? 'Joining...' : 'Join Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
