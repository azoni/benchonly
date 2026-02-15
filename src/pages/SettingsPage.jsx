import { useState, useRef, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { 
  User, 
  Bell, 
  Scale,
  LogOut,
  ChevronRight,
  Check,
  Shield,
  Trash2,
  ExternalLink,
  Camera,
  Loader2,
  Ruler,
  Calendar,
  Activity,
  ChevronDown,
  Eye,
  EyeOff,
  BarChart3,
  AtSign,
  AlertCircle,
  Dumbbell,
  Plus,
  X,
  Timer,
  Zap,
  Download,
  Globe,
  Users,
  Lock,
  Gift,
  Search,
  RefreshCw,
  Link2,
  Unlink,
  Bot,
  ClipboardList,
  Smile,
  FlaskConical,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { signOut, updateProfile as updateAuthProfile } from 'firebase/auth'
import { auth } from '../services/firebase'
import { ACTIVITY_LEVELS } from '../services/calorieService'
import { userService, tokenUsageService, creditService, trainerService } from '../services/firestore'
import { friendService } from '../services/friendService'
import { ouraService } from '../services/ouraService'
import OnboardingChecklist from '../components/OnboardingChecklist'

export default function SettingsPage() {
  const { user, userProfile, updateProfile, isGuest } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || user?.photoURL)
  const fileInputRef = useRef(null)
  const [showProfileSection, setShowProfileSection] = useState(false)
  const [showExercisesSection, setShowExercisesSection] = useState(false)
  const [showUsageSection, setShowUsageSection] = useState(false)
  const [usageStats, setUsageStats] = useState(null)
  const [usageLoading, setUsageLoading] = useState(false)
  
  // Gift credits state
  const [showGiftSection, setShowGiftSection] = useState(false)
  const [giftFriends, setGiftFriends] = useState([])
  const [giftFriendsLoading, setGiftFriendsLoading] = useState(false)
  const [giftSearch, setGiftSearch] = useState('')
  const [giftSelectedUser, setGiftSelectedUser] = useState(null)
  const [giftAmount, setGiftAmount] = useState('')
  const [giftLoading, setGiftLoading] = useState(false)
  
  // Oura integration state
  const [showOuraSection, setShowOuraSection] = useState(false)
  const [ouraStatus, setOuraStatus] = useState(null)
  const [ouraLoading, setOuraLoading] = useState(false)
  const [ouraSyncing, setOuraSyncing] = useState(false)

  // AI Coach personality state
  const [showPersonalitySection, setShowPersonalitySection] = useState(false)

  // Trainer application state
  const [showTrainerSection, setShowTrainerSection] = useState(false)
  const [trainerApp, setTrainerApp] = useState(null)
  const [trainerAppLoading, setTrainerAppLoading] = useState(false)
  const [trainerApplying, setTrainerApplying] = useState(false)
  const [trainerAppNotes, setTrainerAppNotes] = useState('')
  
  // Custom exercises state
  const [customExercises, setCustomExercises] = useState({
    weight: userProfile?.customExercises?.weight || [],
    bodyweight: userProfile?.customExercises?.bodyweight || [],
    time: userProfile?.customExercises?.time || []
  })
  const [newExercise, setNewExercise] = useState('')
  const [newExerciseType, setNewExerciseType] = useState('weight')
  const [savingExercises, setSavingExercises] = useState(false)
  
  // Username state
  const [username, setUsername] = useState(userProfile?.username || '')
  const [usernameError, setUsernameError] = useState('')
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)
  
  const [settings, setSettings] = useState({
    notifications: userProfile?.settings?.notifications ?? true,
    units: userProfile?.settings?.units || 'lbs',
    theme: userProfile?.settings?.theme || 'dark',
    weekStartDay: userProfile?.settings?.weekStartDay || 'monday',
    isPrivate: userProfile?.isPrivate || false,
    defaultVisibility: userProfile?.defaultVisibility || (userProfile?.isPrivate ? 'private' : 'public'),
  })

  const [profile, setProfile] = useState({
    weight: userProfile?.weight || '',
    heightFeet: userProfile?.heightFeet || '',
    heightInches: userProfile?.heightInches || '',
    age: userProfile?.age || '',
    gender: userProfile?.gender || '',
    activityLevel: userProfile?.activityLevel || 'light'
  })

  useEffect(() => {
    if (userProfile) {
      setProfile({
        weight: userProfile.weight || '',
        heightFeet: userProfile.heightFeet || '',
        heightInches: userProfile.heightInches || '',
        age: userProfile.age || '',
        gender: userProfile.gender || '',
        activityLevel: userProfile.activityLevel || 'light'
      })
      setUsername(userProfile.username || '')
      setCustomExercises({
        weight: userProfile.customExercises?.weight || [],
        bodyweight: userProfile.customExercises?.bodyweight || [],
        time: userProfile.customExercises?.time || []
      })
    }
  }, [userProfile])

  // Debounced username availability check
  useEffect(() => {
    if (!username || username === userProfile?.username) {
      setUsernameError('')
      setUsernameAvailable(null)
      return
    }
    
    // Validate format
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setUsernameError('3-20 characters, letters, numbers, underscores only')
      setUsernameAvailable(false)
      return
    }
    
    const timer = setTimeout(async () => {
      setCheckingUsername(true)
      setUsernameError('')
      try {
        const available = await userService.isUsernameAvailable(username, user?.uid)
        setUsernameAvailable(available)
        if (!available) {
          setUsernameError('Username is taken or reserved')
        }
      } catch (error) {
        console.error('Error checking username:', error)
      } finally {
        setCheckingUsername(false)
      }
    }, 500)
    
    return () => clearTimeout(timer)
  }, [username, userProfile?.username, user?.uid])

  const handleSaveUsername = async () => {
    if (!username || !usernameAvailable) return
    
    setSavingUsername(true)
    try {
      await userService.setUsername(user.uid, username)
      await updateProfile({ username: username.toLowerCase() })
      setUsernameAvailable(null)
    } catch (error) {
      setUsernameError(error.message)
    } finally {
      setSavingUsername(false)
    }
  }

  const compressImage = (file, maxWidth = 200, quality = 0.8) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ratio = Math.min(maxWidth / img.width, maxWidth / img.height)
          canvas.width = img.width * ratio
          canvas.height = img.height * ratio
          
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          
          resolve(canvas.toDataURL('image/jpeg', quality))
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB')
      return
    }

    setUploadingPhoto(true)
    try {
      const base64Image = await compressImage(file, 200, 0.8)
      await updateProfile({ photoURL: base64Image })
      setPhotoURL(base64Image)
    } catch (error) {
      console.error('Error uploading photo:', error)
      alert('Failed to upload photo. Please try again.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleToggle = async (key) => {
    const newValue = !settings[key]
    setSettings(prev => ({ ...prev, [key]: newValue }))
    
    try {
      await updateProfile({
        settings: { ...userProfile?.settings, [key]: newValue }
      })
    } catch (error) {
      console.error('Error updating setting:', error)
      setSettings(prev => ({ ...prev, [key]: !newValue }))
    }
  }

  const handleUnitChange = async (unit) => {
    setSettings(prev => ({ ...prev, units: unit }))
    
    try {
      await updateProfile({
        settings: { ...userProfile?.settings, units: unit }
      })
    } catch (error) {
      console.error('Error updating unit:', error)
      setSettings(prev => ({ ...prev, units: userProfile?.settings?.units || 'lbs' }))
    }
  }

  const handleWeekStartChange = async (day) => {
    setSettings(prev => ({ ...prev, weekStartDay: day }))
    
    try {
      await updateProfile({
        settings: { ...userProfile?.settings, weekStartDay: day }
      })
    } catch (error) {
      console.error('Error updating week start:', error)
    }
  }

  const handleAddExercise = async () => {
    if (!newExercise.trim()) return
    
    const exerciseName = newExercise.trim()
    
    // Check if already exists
    if (customExercises[newExerciseType].includes(exerciseName)) {
      alert('This exercise already exists')
      return
    }
    
    setSavingExercises(true)
    try {
      const updated = {
        ...customExercises,
        [newExerciseType]: [...customExercises[newExerciseType], exerciseName]
      }
      setCustomExercises(updated)
      await updateProfile({ customExercises: updated })
      setNewExercise('')
    } catch (error) {
      console.error('Error adding exercise:', error)
      alert('Failed to add exercise')
    } finally {
      setSavingExercises(false)
    }
  }

  const handleRemoveExercise = async (type, exerciseName) => {
    setSavingExercises(true)
    try {
      const updated = {
        ...customExercises,
        [type]: customExercises[type].filter(e => e !== exerciseName)
      }
      setCustomExercises(updated)
      await updateProfile({ customExercises: updated })
    } catch (error) {
      console.error('Error removing exercise:', error)
      alert('Failed to remove exercise')
    } finally {
      setSavingExercises(false)
    }
  }

  const handleProfileSave = async () => {
    setSaving(true)
    try {
      // Calculate total height in inches for calorie calculations
      const heightTotal = profile.heightFeet && profile.heightInches 
        ? (parseInt(profile.heightFeet) * 12) + parseInt(profile.heightInches)
        : null

      await updateProfile({
        weight: profile.weight ? parseFloat(profile.weight) : null,
        heightFeet: profile.heightFeet ? parseInt(profile.heightFeet) : null,
        heightInches: profile.heightInches ? parseInt(profile.heightInches) : null,
        height: heightTotal, // Total inches for calorie service
        age: profile.age ? parseInt(profile.age) : null,
        gender: profile.gender || null,
        activityLevel: profile.activityLevel || 'light'
      })
    } catch (error) {
      console.error('Error saving profile:', error)
      alert('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      alert('Account deletion coming soon. Contact support for now.')
    }
  }

  // AI Coach personality options
  const PERSONALITIES = [
    { key: 'coach', label: 'Coach', description: 'Direct and knowledgeable. Clear, actionable advice.', Icon: Dumbbell },
    { key: 'drill-sergeant', label: 'Drill Sergeant', description: 'Tough love. Blunt feedback, holds you accountable.', Icon: Shield },
    { key: 'bro', label: 'Gym Bro', description: 'Casual gym buddy energy. Encouraging, keeps it real.', Icon: Zap },
    { key: 'scientist', label: 'Sports Scientist', description: 'Evidence-based. Explains the science behind the programming.', Icon: FlaskConical },
    { key: 'comedian', label: 'Trash Talk', description: 'Real advice with dry wit and a sarcastic edge.', Icon: Smile },
  ]

  const handlePersonalityChange = async (key) => {
    try {
      await updateProfile({ chatPersonality: key })
    } catch (err) {
      console.error('Error saving personality:', err)
    }
  }

  // Trainer application
  const loadTrainerApplication = async () => {
    if (trainerApp !== null || trainerAppLoading || !user) return
    setTrainerAppLoading(true)
    try {
      const app = await trainerService.getApplication(user.uid)
      setTrainerApp(app || false) // false = no application
    } catch {
      setTrainerApp(false)
    } finally {
      setTrainerAppLoading(false)
    }
  }

  const handleTrainerApply = async () => {
    if (!user) return
    setTrainerApplying(true)
    try {
      await trainerService.apply(user.uid, {
        displayName: userProfile?.displayName || '',
        email: user.email,
        notes: trainerAppNotes,
      })
      setTrainerApp({ status: 'pending' })
      setTrainerAppNotes('')
    } catch (err) {
      console.error('Error applying:', err)
      alert('Failed to submit application. Please try again.')
    } finally {
      setTrainerApplying(false)
    }
  }

  const loadUsageStats = async () => {
    if (usageStats || usageLoading || !user) return
    setUsageLoading(true)
    try {
      const records = await tokenUsageService.getByUser(user.uid, 200)
      const byFeature = {}
      let totalTokens = 0
      let totalRequests = 0
      
      const FEATURE_LABELS = {
        'generate-workout': 'Workout Generation',
        'generate-group-workout': 'Group Workout',
        'ask-assistant': 'AI Chat',
        'form-check': 'Form Check',
      }
      
      records.forEach(r => {
        const feature = r.feature || 'other'
        const label = FEATURE_LABELS[feature] || feature
        if (!byFeature[label]) byFeature[label] = { tokens: 0, requests: 0 }
        byFeature[label].tokens += r.totalTokens || 0
        byFeature[label].requests += 1
        totalTokens += r.totalTokens || 0
        totalRequests += 1
      })
      
      setUsageStats({ totalTokens, totalRequests, byFeature })
    } catch (e) {
      console.error('Error loading usage:', e)
      // Set empty stats so UI shows "no usage" instead of nothing
      setUsageStats({ totalTokens: 0, totalRequests: 0, byFeature: {}, error: true })
    } finally {
      setUsageLoading(false)
    }
  }

  const profileComplete = profile.weight && profile.heightFeet && profile.age && profile.gender

  const loadGiftFriends = async () => {
    if (giftFriends.length > 0 || giftFriendsLoading || !user) return
    setGiftFriendsLoading(true)
    try {
      const friendIds = await friendService.getFriends(user.uid)
      const friends = []
      for (const fid of friendIds) {
        const u = await userService.get(fid)
        if (u) friends.push({ uid: fid, ...u })
      }
      setGiftFriends(friends)
    } catch (e) {
      console.error('Error loading friends:', e)
    } finally {
      setGiftFriendsLoading(false)
    }
  }

  const handleGiftCredits = async () => {
    const amount = parseInt(giftAmount)
    if (!amount || amount <= 0 || !giftSelectedUser) return
    setGiftLoading(true)
    try {
      const result = await creditService.gift(user.uid, giftSelectedUser.uid, amount)
      if (!result.success) {
        alert(result.error === 'insufficient_credits' 
          ? `Not enough credits. You have ${result.balance}.` 
          : result.error)
        return
      }
      updateProfile({ credits: result.balance })
      alert(`Gifted ${amount} credits to ${giftSelectedUser.displayName || 'friend'}!`)
      setGiftAmount('')
      setGiftSelectedUser(null)
    } catch (e) {
      console.error('Gift error:', e)
      alert('Failed to gift credits. Please try again.')
    } finally {
      setGiftLoading(false)
    }
  }

  // Oura integration handlers
  const loadOuraStatus = async () => {
    if (!user) return
    setOuraLoading(true)
    try {
      const status = await ouraService.getStatus(user.uid)
      setOuraStatus(status)
    } catch (e) {
      console.error('Error loading Oura status:', e)
    } finally {
      setOuraLoading(false)
    }
  }

  const handleOuraConnect = async () => {
    setOuraLoading(true)
    try {
      const authUrl = await ouraService.connect()
      window.location.href = authUrl
    } catch (e) {
      console.error('Oura connect error:', e)
      alert(e.message)
      setOuraLoading(false)
    }
  }

  const handleOuraSync = async () => {
    setOuraSyncing(true)
    try {
      const result = await ouraService.sync()
      setOuraStatus(prev => ({ ...prev, connected: true, data: result.data, lastSynced: new Date().toISOString() }))
    } catch (e) {
      console.error('Oura sync error:', e)
      if (e.message.includes('expired') || e.message.includes('reconnect')) {
        setOuraStatus(prev => ({ ...prev, status: 'expired', connected: false }))
      }
      alert(e.message)
    } finally {
      setOuraSyncing(false)
    }
  }

  const handleOuraDisconnect = async () => {
    if (!confirm('Disconnect Oura Ring? Your synced data will be removed.')) return
    try {
      await ouraService.disconnect(user.uid)
      setOuraStatus({ connected: false })
    } catch (e) {
      console.error('Oura disconnect error:', e)
    }
  }

  // Check for Oura callback params on mount
  useEffect(() => {
    const ouraParam = searchParams.get('oura')
    if (ouraParam) {
      setShowOuraSection(true)
      if (ouraParam === 'connected') {
        loadOuraStatus()
        // Auto-sync after connecting
        setTimeout(() => handleOuraSync(), 500)
      }
      // Clean up URL params
      searchParams.delete('oura')
      searchParams.delete('reason')
      setSearchParams(searchParams, { replace: true })
    }
  }, [])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display text-iron-100">Settings</h1>
        <p className="text-iron-500 text-sm mt-1">
          Manage your preferences
        </p>
      </div>

      {/* Profile Photo Section */}
      <div className="card-steel p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            {photoURL ? (
              <img 
                src={photoURL} 
                alt={user?.displayName}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-iron-700 flex items-center justify-center">
                <User className="w-8 h-8 text-iron-500" />
              </div>
            )}
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="absolute inset-0 w-16 h-16 rounded-full bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
            >
              {uploadingPhoto ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white" />
              )}
            </button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </div>
          
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-iron-100 truncate">
              {user?.displayName || 'User'}
            </h2>
            <p className="text-sm text-iron-500 truncate">
              {user?.email}
            </p>
            {userProfile?.username && (
              <p className="text-sm text-flame-400">
                @{userProfile.username}
              </p>
            )}
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="text-xs text-flame-400 hover:text-flame-300"
              >
                {uploadingPhoto ? 'Uploading...' : 'Change photo'}
              </button>
              <Link to="/profile" className="text-xs text-iron-500 hover:text-iron-300">
                View profile →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Getting Started Checklist */}
      <OnboardingChecklist embedded />

      {/* Username Section */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-medium text-iron-400 px-1">Username</h3>
        
        <div className="card-steel p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-flame-500/20 flex items-center justify-center">
              <AtSign className="w-5 h-5 text-flame-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-iron-200">Profile URL</p>
              <p className="text-sm text-iron-500">
                benchpressonly.com/profile/{username || 'your-username'}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-iron-500">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="username"
                maxLength={20}
                className="input-field w-full pl-8"
              />
              {checkingUsername && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500 animate-spin" />
              )}
              {!checkingUsername && usernameAvailable === true && username !== userProfile?.username && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
              )}
              {!checkingUsername && usernameAvailable === false && (
                <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
              )}
            </div>
            <button
              onClick={handleSaveUsername}
              disabled={!usernameAvailable || savingUsername || username === userProfile?.username}
              className="btn-primary px-4 disabled:opacity-50"
            >
              {savingUsername ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
          </div>
          
          {usernameError && (
            <p className="text-xs text-red-400 mt-2">{usernameError}</p>
          )}
          {!usernameError && username && username !== userProfile?.username && (
            <p className="text-xs text-iron-500 mt-2">
              3-20 characters, letters, numbers, and underscores only
            </p>
          )}
        </div>
      </div>

      {/* Body Profile Section */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-medium text-iron-400 px-1">Body Profile</h3>
        
        <div className="card-steel overflow-hidden">
          <button
            onClick={() => setShowProfileSection(!showProfileSection)}
            className="w-full p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-iron-200">Calorie Tracking Profile</p>
              <p className="text-sm text-iron-500">
                {profileComplete ? 'Profile complete' : 'Set up for calorie estimates'}
              </p>
            </div>
            <ChevronDown className={`w-5 h-5 text-iron-500 transition-transform ${showProfileSection ? 'rotate-180' : ''}`} />
          </button>

          {showProfileSection && (
            <div className="px-4 pb-4 space-y-4 border-t border-iron-800 pt-4">
              {/* Weight */}
              <div>
                <label className="text-sm text-iron-400 mb-1 block">Weight (lbs)</label>
                <input
                  type="number"
                  value={profile.weight}
                  onChange={(e) => setProfile(p => ({ ...p, weight: e.target.value }))}
                  placeholder="170"
                  className="input-field w-full"
                />
              </div>

              {/* Height */}
              <div>
                <label className="text-sm text-iron-400 mb-1 block">Height</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={profile.heightFeet}
                      onChange={(e) => setProfile(p => ({ ...p, heightFeet: e.target.value }))}
                      placeholder="5"
                      className="input-field w-full"
                    />
                    <span className="text-xs text-iron-500 mt-1 block">feet</span>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      value={profile.heightInches}
                      onChange={(e) => setProfile(p => ({ ...p, heightInches: e.target.value }))}
                      placeholder="10"
                      className="input-field w-full"
                    />
                    <span className="text-xs text-iron-500 mt-1 block">inches</span>
                  </div>
                </div>
              </div>

              {/* Age */}
              <div>
                <label className="text-sm text-iron-400 mb-1 block">Age</label>
                <input
                  type="number"
                  value={profile.age}
                  onChange={(e) => setProfile(p => ({ ...p, age: e.target.value }))}
                  placeholder="30"
                  className="input-field w-full"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="text-sm text-iron-400 mb-1 block">Gender</label>
                <div className="flex gap-2">
                  {['male', 'female', 'other'].map(g => (
                    <button
                      key={g}
                      onClick={() => setProfile(p => ({ ...p, gender: g }))}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors capitalize ${
                        profile.gender === g
                          ? 'bg-flame-500 text-white'
                          : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Activity Level */}
              <div>
                <label className="text-sm text-iron-400 mb-1 block">Daily Activity (excluding workouts)</label>
                <p className="text-xs text-iron-600 mb-2">How active is your day-to-day life outside of exercise?</p>
                <div className="space-y-2">
                  {Object.entries(ACTIVITY_LEVELS).map(([key, level]) => (
                    <button
                      key={key}
                      onClick={() => setProfile(p => ({ ...p, activityLevel: key }))}
                      className={`w-full p-3 rounded-lg text-left transition-colors ${
                        profile.activityLevel === key
                          ? 'bg-flame-500/20 border border-flame-500'
                          : 'bg-iron-800 border border-iron-700 hover:border-iron-600'
                      }`}
                    >
                      <p className={`font-medium text-sm ${profile.activityLevel === key ? 'text-flame-400' : 'text-iron-200'}`}>
                        {level.label}
                      </p>
                      <p className="text-xs text-iron-500">{level.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <button
                onClick={handleProfileSave}
                disabled={saving}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Profile
                  </>
                )}
              </button>

              <p className="text-xs text-iron-500 text-center">
                This info is used to estimate calories burned. All fields are optional.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Custom Exercises Section */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-medium text-iron-400 px-1">Custom Exercises</h3>
        
        <div className="card-steel overflow-hidden">
          <button
            onClick={() => setShowExercisesSection(!showExercisesSection)}
            className="w-full p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-flame-500/20 flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-flame-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-iron-200">Manage Exercises</p>
              <p className="text-sm text-iron-500">
                {(customExercises.weight.length + customExercises.bodyweight.length + customExercises.time.length) || 'No'} custom exercises added
              </p>
            </div>
            <ChevronDown className={`w-5 h-5 text-iron-500 transition-transform ${showExercisesSection ? 'rotate-180' : ''}`} />
          </button>

          {showExercisesSection && (
            <div className="px-4 pb-4 space-y-4 border-t border-iron-800 pt-4">
              {/* Add New Exercise */}
              <div className="space-y-3">
                <label className="text-sm text-iron-400 block">Add New Exercise</label>
                <div className="flex gap-2">
                  <select
                    value={newExerciseType}
                    onChange={(e) => setNewExerciseType(e.target.value)}
                    className="input-field w-32"
                  >
                    <option value="weight">Weight</option>
                    <option value="bodyweight">Bodyweight</option>
                    <option value="time">Time</option>
                  </select>
                  <input
                    type="text"
                    value={newExercise}
                    onChange={(e) => setNewExercise(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddExercise()}
                    placeholder="Exercise name"
                    className="input-field flex-1"
                  />
                  <button
                    onClick={handleAddExercise}
                    disabled={!newExercise.trim() || savingExercises}
                    className="btn-primary px-4 disabled:opacity-50"
                  >
                    {savingExercises ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Weight Exercises */}
              {customExercises.weight.length > 0 && (
                <div>
                  <label className="text-xs text-iron-500 mb-2 block flex items-center gap-2">
                    <Dumbbell className="w-3 h-3" /> Weight Exercises
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {customExercises.weight.map(ex => (
                      <div key={ex} className="flex items-center gap-1 bg-iron-800 rounded-lg px-3 py-1.5">
                        <span className="text-sm text-iron-200">{ex}</span>
                        <button
                          onClick={() => handleRemoveExercise('weight', ex)}
                          className="p-1 text-iron-500 hover:text-red-400 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bodyweight Exercises */}
              {customExercises.bodyweight.length > 0 && (
                <div>
                  <label className="text-xs text-iron-500 mb-2 block flex items-center gap-2">
                    <User className="w-3 h-3" /> Bodyweight Exercises
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {customExercises.bodyweight.map(ex => (
                      <div key={ex} className="flex items-center gap-1 bg-iron-800 rounded-lg px-3 py-1.5">
                        <span className="text-sm text-iron-200">{ex}</span>
                        <button
                          onClick={() => handleRemoveExercise('bodyweight', ex)}
                          className="p-1 text-iron-500 hover:text-red-400 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Time Exercises */}
              {customExercises.time.length > 0 && (
                <div>
                  <label className="text-xs text-iron-500 mb-2 block flex items-center gap-2">
                    <Timer className="w-3 h-3" /> Time-Based Exercises
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {customExercises.time.map(ex => (
                      <div key={ex} className="flex items-center gap-1 bg-iron-800 rounded-lg px-3 py-1.5">
                        <span className="text-sm text-iron-200">{ex}</span>
                        <button
                          onClick={() => handleRemoveExercise('time', ex)}
                          className="p-1 text-iron-500 hover:text-red-400 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {customExercises.weight.length === 0 && customExercises.bodyweight.length === 0 && customExercises.time.length === 0 && (
                <p className="text-sm text-iron-500 text-center py-4">
                  No custom exercises added yet. Add your favorites above!
                </p>
              )}

              <p className="text-xs text-iron-500 text-center">
                Custom exercises will appear in autocomplete when creating workouts
              </p>
            </div>
          )}
        </div>
      </div>

      {/* AI Credits */}
      {!isGuest && (
        <div className="card-steel p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-flame-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-flame-400" />
              </div>
              <div>
                <p className="font-medium text-iron-200">AI Credits</p>
                <p className="text-xs text-iron-500">Used for AI chat & workout generation</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-display text-iron-100">{userProfile?.credits ?? 0}</p>
              <p className="text-xs text-iron-500">remaining</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-iron-500 bg-iron-800/30 rounded-lg px-3 py-2">
            <span>Chat = 1 cr</span>
            <span className="text-iron-700">·</span>
            <span>Workout = 5 cr</span>
            <span className="text-iron-700">·</span>
            <span>Group = 5 cr/athlete</span>
            <span className="text-iron-700">·</span>
            <span>Program = 10 cr</span>
          </div>
        </div>
      )}

      {/* Preferences */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-iron-400 px-1">Preferences</h3>
        
        {/* Notifications */}
        <button
          onClick={() => handleToggle('notifications')}
          className="card-steel p-4 w-full flex items-center gap-4 hover:border-iron-600 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-medium text-iron-200">Notifications</p>
            <p className="text-sm text-iron-500">Workout reminders & updates</p>
          </div>
          <div className={`w-12 h-7 rounded-full transition-colors ${
            settings.notifications ? 'bg-flame-500' : 'bg-iron-700'
          }`}>
            <div className={`w-5 h-5 bg-white rounded-full mt-1 transition-transform ${
              settings.notifications ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </div>
        </button>

        {/* Units */}
        <div className="card-steel p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Scale className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-iron-200">Weight Units</p>
              <p className="text-sm text-iron-500">Display weights in</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {['lbs', 'kg'].map(unit => (
              <button
                key={unit}
                onClick={() => handleUnitChange(unit)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
                  settings.units === unit
                    ? 'bg-flame-500 text-white'
                    : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                }`}
              >
                {unit.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Week Start Day */}
        <div className="card-steel p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-iron-200">Week Starts On</p>
              <p className="text-sm text-iron-500">For calorie tracking reset</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {['sunday', 'monday'].map(day => (
              <button
                key={day}
                onClick={() => handleWeekStartChange(day)}
                className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors capitalize ${
                  settings.weekStartDay === day
                    ? 'bg-flame-500 text-white'
                    : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* Default Visibility */}
        <div className="card-steel overflow-hidden">
          <div className="p-4 border-b border-iron-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Eye className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="font-medium text-iron-200">Default Visibility</p>
                <p className="text-sm text-iron-500">Who can see your activity in the feed</p>
              </div>
            </div>
          </div>
          <div className="p-2">
            {[
              { key: 'public', label: 'Public', desc: 'Everyone can see your activity', Icon: Globe },
              { key: 'friends', label: 'Friends', desc: 'Only friends see your activity', Icon: Users },
              { key: 'private', label: 'Private', desc: 'Your activity is hidden from the feed', Icon: Lock },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={async () => {
                  const newValue = opt.key
                  setSettings(prev => ({ ...prev, defaultVisibility: newValue, isPrivate: newValue === 'private' }))
                  try {
                    await updateProfile({ defaultVisibility: newValue, isPrivate: newValue === 'private' })
                  } catch (error) {
                    console.error('Error updating visibility:', error)
                    setSettings(prev => ({ ...prev, defaultVisibility: settings.defaultVisibility }))
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  settings.defaultVisibility === opt.key
                    ? 'bg-flame-500/10 border border-flame-500/30'
                    : 'hover:bg-iron-800/50'
                }`}
              >
                <opt.Icon className={`w-5 h-5 ${settings.defaultVisibility === opt.key ? 'text-flame-400' : 'text-iron-500'}`} />
                <div className="text-left flex-1">
                  <p className={`text-sm font-medium ${settings.defaultVisibility === opt.key ? 'text-flame-400' : 'text-iron-200'}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-iron-500">{opt.desc}</p>
                </div>
                {settings.defaultVisibility === opt.key && (
                  <div className="w-5 h-5 rounded-full bg-flame-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* AI Usage Stats */}
        <div className="card-steel overflow-hidden">
          <button
            onClick={() => {
              setShowUsageSection(!showUsageSection)
              if (!showUsageSection) loadUsageStats()
            }}
            className="w-full p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-iron-200">AI Usage</p>
              <p className="text-sm text-iron-500">View your token usage</p>
            </div>
            <ChevronDown className={`w-5 h-5 text-iron-500 transition-transform ${showUsageSection ? 'rotate-180' : ''}`} />
          </button>

          {showUsageSection && (
            <div className="px-4 pb-4 border-t border-iron-800 pt-4">
              {usageLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 text-flame-500 animate-spin" />
                </div>
              ) : usageStats ? (
                <div className="space-y-4">
                  {usageStats.error ? (
                    <p className="text-sm text-iron-500 text-center py-2">
                      Usage data requires a Firestore index. Check the browser console for a link to create it.
                    </p>
                  ) : (
                  <>
                  <div className="flex gap-3">
                    <div className="flex-1 bg-iron-800/50 rounded-lg p-3 text-center">
                      <p className="text-xl font-display text-iron-100">{usageStats.totalRequests}</p>
                      <p className="text-xs text-iron-500">Requests</p>
                    </div>
                    <div className="flex-1 bg-iron-800/50 rounded-lg p-3 text-center">
                      <p className="text-xl font-display text-iron-100">
                        {usageStats.totalTokens >= 1000000 
                          ? `${(usageStats.totalTokens / 1000000).toFixed(1)}M`
                          : usageStats.totalTokens >= 1000 
                            ? `${(usageStats.totalTokens / 1000).toFixed(1)}k`
                            : usageStats.totalTokens}
                      </p>
                      <p className="text-xs text-iron-500">Total Tokens</p>
                    </div>
                  </div>
                  
                  {Object.keys(usageStats.byFeature).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-iron-500 font-medium uppercase tracking-wider">By Feature</p>
                      {Object.entries(usageStats.byFeature)
                        .sort((a, b) => b[1].tokens - a[1].tokens)
                        .map(([feature, data]) => (
                          <div key={feature} className="flex items-center justify-between py-1.5">
                            <span className="text-sm text-iron-300">{feature}</span>
                            <div className="text-right">
                              <span className="text-sm text-iron-200 font-medium">
                                {data.tokens >= 1000 ? `${(data.tokens / 1000).toFixed(1)}k` : data.tokens}
                              </span>
                              <span className="text-xs text-iron-500 ml-2">({data.requests} reqs)</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                  
                  {usageStats.totalRequests === 0 && !usageStats.error && (
                    <p className="text-sm text-iron-500 text-center py-2">No AI usage yet</p>
                  )}
                  </>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Gift Credits */}
        <div className="card-steel overflow-hidden">
          <button
            onClick={() => {
              setShowGiftSection(!showGiftSection)
              if (!showGiftSection) loadGiftFriends()
            }}
            className="w-full p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Gift className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-iron-200">Gift Credits</p>
              <p className="text-sm text-iron-500">Send credits to a friend</p>
            </div>
            <ChevronDown className={`w-5 h-5 text-iron-500 transition-transform ${showGiftSection ? 'rotate-180' : ''}`} />
          </button>

          {showGiftSection && (
            <div className="px-4 pb-4 border-t border-iron-800 pt-4">
              <p className="text-xs text-iron-500 mb-3">Your balance: {userProfile?.credits ?? 0} credits</p>
              
              {giftFriendsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 text-flame-500 animate-spin" />
                </div>
              ) : giftFriends.length === 0 ? (
                <p className="text-sm text-iron-500 text-center py-4">Add friends to gift them credits</p>
              ) : (
                <div className="space-y-3">
                  {/* Friend search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500" />
                    <input
                      type="text"
                      value={giftSearch}
                      onChange={e => setGiftSearch(e.target.value)}
                      placeholder="Search friends..."
                      className="input-field w-full pl-9 text-sm"
                    />
                  </div>

                  {/* Friend list */}
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {giftFriends
                      .filter(f => !giftSearch || 
                        (f.displayName || '').toLowerCase().includes(giftSearch.toLowerCase()) ||
                        (f.username || '').toLowerCase().includes(giftSearch.toLowerCase())
                      )
                      .map(friend => (
                        <button
                          key={friend.uid}
                          onClick={() => setGiftSelectedUser(giftSelectedUser?.uid === friend.uid ? null : friend)}
                          className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                            giftSelectedUser?.uid === friend.uid
                              ? 'bg-purple-500/10 border border-purple-500/30'
                              : 'hover:bg-iron-800/50'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-iron-800 flex items-center justify-center flex-shrink-0">
                            {friend.photoURL 
                              ? <img src={friend.photoURL} alt="" className="w-8 h-8 rounded-full" />
                              : <User className="w-4 h-4 text-iron-500" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-iron-200 truncate">{friend.displayName || 'User'}</p>
                            {friend.username && <p className="text-xs text-iron-500">@{friend.username}</p>}
                          </div>
                          {giftSelectedUser?.uid === friend.uid && (
                            <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                  </div>

                  {/* Amount + send */}
                  {giftSelectedUser && (
                    <div className="pt-2 border-t border-iron-800">
                      <p className="text-xs text-iron-400 mb-2">
                        Sending to <span className="text-purple-400">{giftSelectedUser.displayName || 'friend'}</span>
                      </p>
                      <div className="flex gap-2 mb-2">
                        {[10, 25, 50, 100].map(amt => (
                          <button
                            key={amt}
                            onClick={() => setGiftAmount(String(amt))}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              giftAmount === String(amt)
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                            }`}
                          >
                            {amt}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={giftAmount}
                          onChange={e => setGiftAmount(e.target.value)}
                          placeholder="Custom amount"
                          min="1"
                          className="input-field flex-1 text-sm"
                        />
                        <button
                          onClick={handleGiftCredits}
                          disabled={giftLoading || !giftAmount || parseInt(giftAmount) <= 0}
                          className="btn-primary text-sm px-4 flex items-center gap-2"
                        >
                          {giftLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Integrations */}
      <div className="space-y-3 mt-8">
        <h3 className="text-sm font-medium text-iron-400 px-1">Integrations</h3>

        {/* Oura Ring */}
        <div className="card-steel overflow-hidden">
          <button
            onClick={() => {
              setShowOuraSection(!showOuraSection)
              if (!showOuraSection && !ouraStatus) loadOuraStatus()
            }}
            className="w-full p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-teal-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-iron-200">Oura Ring</p>
              <p className="text-sm text-iron-500">
                {ouraStatus?.connected ? 'Connected' : 'Sleep, readiness & recovery data'}
              </p>
            </div>
            {ouraStatus?.connected && (
              <span className="text-xs px-2 py-1 rounded-full bg-teal-500/20 text-teal-400">Active</span>
            )}
            <ChevronDown className={`w-5 h-5 text-iron-500 transition-transform ${showOuraSection ? 'rotate-180' : ''}`} />
          </button>

          {showOuraSection && (
            <div className="px-4 pb-4 border-t border-iron-800 pt-4">
              {ouraLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
                </div>
              ) : !ouraStatus?.connected ? (
                <div className="text-center py-4">
                  {ouraStatus?.status === 'expired' && (
                    <p className="text-sm text-amber-400 mb-3">Your Oura connection expired. Please reconnect.</p>
                  )}
                  <p className="text-sm text-iron-400 mb-4">
                    Connect your Oura Ring to include sleep scores, readiness, and recovery data 
                    in your AI-generated workouts.
                  </p>
                  <button
                    onClick={handleOuraConnect}
                    disabled={ouraLoading}
                    className="btn-primary text-sm px-6 flex items-center gap-2 mx-auto"
                  >
                    {ouraLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Connect Oura Ring
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Status bar */}
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-iron-500">
                      {ouraStatus.lastSynced 
                        ? `Last synced: ${new Date(ouraStatus.lastSynced?.toDate ? ouraStatus.lastSynced.toDate() : ouraStatus.lastSynced).toLocaleString()}`
                        : 'Not synced yet'}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleOuraSync}
                        disabled={ouraSyncing}
                        className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${ouraSyncing ? 'animate-spin' : ''}`} />
                        Sync
                      </button>
                      <button
                        onClick={handleOuraDisconnect}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        Disconnect
                      </button>
                    </div>
                  </div>

                  {/* Score cards */}
                  {ouraStatus.data && (
                    <div className="space-y-3">
                      {/* Latest scores */}
                      <div className="grid grid-cols-3 gap-2">
                        {(() => {
                          const s = ouraStatus.data.sleep;
                          const r = ouraStatus.data.readiness;
                          const a = ouraStatus.data.activity;
                          const latestSleep = s?.length ? s[s.length - 1] : null;
                          const latestReadiness = r?.length ? r[r.length - 1] : null;
                          const latestActivity = a?.length ? a[a.length - 1] : null;
                          return (
                            <>
                              <div className="bg-iron-800/50 rounded-lg p-3 text-center">
                                <p className="text-xs text-iron-500 mb-1">Sleep</p>
                                <p className={`text-2xl font-bold ${
                                  (latestSleep?.score || 0) >= 85 ? 'text-green-400' :
                                  (latestSleep?.score || 0) >= 70 ? 'text-yellow-400' :
                                  'text-red-400'
                                }`}>
                                  {latestSleep?.score || '—'}
                                </p>
                                <p className="text-xs text-iron-600 mt-1">{latestSleep?.day || ''}</p>
                              </div>
                              <div className="bg-iron-800/50 rounded-lg p-3 text-center">
                                <p className="text-xs text-iron-500 mb-1">Readiness</p>
                                <p className={`text-2xl font-bold ${
                                  (latestReadiness?.score || 0) >= 85 ? 'text-green-400' :
                                  (latestReadiness?.score || 0) >= 70 ? 'text-yellow-400' :
                                  'text-red-400'
                                }`}>
                                  {latestReadiness?.score || '—'}
                                </p>
                                <p className="text-xs text-iron-600 mt-1">{latestReadiness?.day || ''}</p>
                              </div>
                              <div className="bg-iron-800/50 rounded-lg p-3 text-center">
                                <p className="text-xs text-iron-500 mb-1">Activity</p>
                                <p className={`text-2xl font-bold ${
                                  (latestActivity?.score || 0) >= 85 ? 'text-green-400' :
                                  (latestActivity?.score || 0) >= 70 ? 'text-yellow-400' :
                                  'text-red-400'
                                }`}>
                                  {latestActivity?.score || '—'}
                                </p>
                                <p className="text-xs text-iron-600 mt-1">{latestActivity?.day || ''}</p>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* 7-day trend */}
                      {ouraStatus.data.readiness?.length > 1 && (
                        <div className="bg-iron-800/50 rounded-lg p-3">
                          <p className="text-xs text-iron-500 mb-2">7-Day Readiness</p>
                          <div className="flex items-end gap-1 h-12">
                            {ouraStatus.data.readiness.map((r, i) => (
                              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                <div
                                  className={`w-full rounded-sm transition-all ${
                                    (r.score || 0) >= 85 ? 'bg-green-500' :
                                    (r.score || 0) >= 70 ? 'bg-yellow-500' :
                                    'bg-red-500'
                                  }`}
                                  style={{ height: `${Math.max(4, ((r.score || 0) / 100) * 48)}px` }}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-1 mt-1">
                            {ouraStatus.data.readiness.map((r, i) => (
                              <div key={i} className="flex-1 text-center">
                                <span className="text-[9px] text-iron-600">{r.day?.slice(5) || ''}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-iron-600">
                        This data is automatically included when generating workouts to optimize intensity and recovery.
                      </p>
                    </div>
                  )}

                  {!ouraStatus.data && (
                    <div className="text-center py-2">
                      <button
                        onClick={handleOuraSync}
                        disabled={ouraSyncing}
                        className="btn-primary text-sm px-4 flex items-center gap-2 mx-auto"
                      >
                        {ouraSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Sync Data
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* AI Coach Personality */}
      <div className="space-y-3 mt-8">
        <h3 className="text-sm font-medium text-iron-400 px-1">AI Coach</h3>
        <div className="card-steel overflow-hidden">
          <button
            onClick={() => setShowPersonalitySection(!showPersonalitySection)}
            className="p-4 w-full flex items-center gap-4 hover:bg-iron-800/30 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-iron-200">Coach Personality</p>
              <p className="text-sm text-iron-500">
                {PERSONALITIES.find(p => p.key === (userProfile?.chatPersonality || 'coach'))?.label || 'Coach'}
              </p>
            </div>
            <ChevronDown className={`w-5 h-5 text-iron-500 transition-transform ${showPersonalitySection ? 'rotate-180' : ''}`} />
          </button>

          {showPersonalitySection && (
            <div className="px-4 pb-4 space-y-2">
              {PERSONALITIES.map(p => {
                const isActive = (userProfile?.chatPersonality || 'coach') === p.key
                return (
                  <button
                    key={p.key}
                    onClick={() => handlePersonalityChange(p.key)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isActive
                        ? 'bg-flame-500/10 border-flame-500/30'
                        : 'bg-iron-800/30 border-iron-700/50 hover:border-iron-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <p.Icon className={`w-4 h-4 ${isActive ? 'text-flame-400' : 'text-iron-400'}`} />
                      <span className={`text-sm font-medium ${isActive ? 'text-flame-400' : 'text-iron-200'}`}>{p.label}</span>
                      {isActive && <Check className="w-3.5 h-3.5 text-flame-400 ml-auto" />}
                    </div>
                    <p className="text-xs text-iron-500 ml-6">{p.description}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Become a Trainer */}
      {!trainerService.isTrainer(userProfile, user?.email) && (
        <div className="space-y-3 mt-8">
          <h3 className="text-sm font-medium text-iron-400 px-1">Trainer Program</h3>
          <div className="card-steel overflow-hidden">
            <button
              onClick={() => {
                setShowTrainerSection(!showTrainerSection)
                if (!showTrainerSection) loadTrainerApplication()
              }}
              className="p-4 w-full flex items-center gap-4 hover:bg-iron-800/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-iron-200">Become a Trainer</p>
                <p className="text-sm text-iron-500">Create workouts for other users</p>
              </div>
              <ChevronDown className={`w-5 h-5 text-iron-500 transition-transform ${showTrainerSection ? 'rotate-180' : ''}`} />
            </button>

            {showTrainerSection && (
              <div className="px-4 pb-4">
                {trainerAppLoading ? (
                  <div className="flex items-center gap-2 text-sm text-iron-500 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking application status...
                  </div>
                ) : trainerApp && trainerApp.status === 'pending' ? (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-sm text-yellow-300 font-medium">Application Pending</p>
                    <p className="text-xs text-iron-500 mt-1">Your application is being reviewed. You'll be notified when it's approved.</p>
                  </div>
                ) : trainerApp && trainerApp.status === 'denied' ? (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-300 font-medium">Application Not Approved</p>
                    <p className="text-xs text-iron-500 mt-1">Your application wasn't approved at this time. You can apply again.</p>
                    <button
                      onClick={() => setTrainerApp(false)}
                      className="mt-2 text-xs text-flame-400 hover:text-flame-300"
                    >
                      Apply Again
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-iron-400">
                      Trainers can create custom workouts and review workout plans for users who request help. Apply below and an admin will review your application.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-iron-400 mb-1.5">
                        Why do you want to be a trainer? (optional)
                      </label>
                      <textarea
                        value={trainerAppNotes}
                        onChange={(e) => setTrainerAppNotes(e.target.value)}
                        placeholder="Experience, certifications, or why you'd be a good fit..."
                        rows={3}
                        className="input-field w-full resize-none text-sm"
                      />
                    </div>
                    <button
                      onClick={handleTrainerApply}
                      disabled={trainerApplying}
                      className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2"
                    >
                      {trainerApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Submit Application
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!window.matchMedia('(display-mode: standalone)').matches && (
        <div className="space-y-3 mt-8">
          <h3 className="text-sm font-medium text-iron-400 px-1">Install</h3>
          <div className="card-steel p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-flame-500/20 flex items-center justify-center">
              <Download className="w-5 h-5 text-flame-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-iron-200">Add to Home Screen</p>
              <p className="text-sm text-iron-500">
                {/iPad|iPhone|iPod/.test(navigator.userAgent)
                  ? 'Tap the Share button → "Add to Home Screen"'
                  : 'Install as an app for the best experience'
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Account */}
      <div className="space-y-3 mt-8">
        <h3 className="text-sm font-medium text-iron-400 px-1">Account</h3>
        
        <a
          href="https://benchpressonly.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="card-steel p-4 flex items-center gap-4 hover:border-iron-600 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-iron-800 flex items-center justify-center">
            <Shield className="w-5 h-5 text-iron-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-iron-200">Privacy Policy</p>
          </div>
          <ExternalLink className="w-4 h-4 text-iron-500" />
        </a>
        
        <button
          onClick={handleSignOut}
          className="card-steel p-4 w-full flex items-center gap-4 hover:border-iron-600 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-iron-800 flex items-center justify-center">
            <LogOut className="w-5 h-5 text-iron-400" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-medium text-iron-200">Sign Out</p>
          </div>
          <ChevronRight className="w-5 h-5 text-iron-600" />
        </button>
        
        <button
          onClick={handleDeleteAccount}
          className="card-steel p-4 w-full flex items-center gap-4 hover:border-red-500/20 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-medium text-red-400">Delete Account</p>
            <p className="text-sm text-iron-500">Permanently remove your data</p>
          </div>
        </button>
      </div>

      {/* Version */}
      <div className="mt-12 text-center text-sm text-iron-600">
        <p>Bench Only v1.3.0</p>
        <p className="mt-1">Made for serious lifters</p>
      </div>
    </div>
  )
}