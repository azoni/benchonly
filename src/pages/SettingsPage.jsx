import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { signOut, updateProfile as updateAuthProfile } from 'firebase/auth'
import { auth } from '../services/firebase'
import { ACTIVITY_LEVELS } from '../services/calorieService'
import { userService, tokenUsageService } from '../services/firestore'

export default function SettingsPage() {
  const { user, userProfile, updateProfile, isGuest } = useAuth()
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || user?.photoURL)
  const fileInputRef = useRef(null)
  const [showProfileSection, setShowProfileSection] = useState(false)
  const [showExercisesSection, setShowExercisesSection] = useState(false)
  const [showUsageSection, setShowUsageSection] = useState(false)
  const [usageStats, setUsageStats] = useState(null)
  const [usageLoading, setUsageLoading] = useState(false)
  
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
    isPrivate: userProfile?.isPrivate || false
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
    } finally {
      setUsageLoading(false)
    }
  }

  const profileComplete = profile.weight && profile.heightFeet && profile.age && profile.gender

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
                {profileComplete ? 'Profile complete ✓' : 'Set up for calorie estimates'}
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

        {/* Privacy Toggle */}
        <button
          onClick={async () => {
            const newValue = !settings.isPrivate
            setSettings(prev => ({ ...prev, isPrivate: newValue }))
            try {
              await updateProfile({ isPrivate: newValue })
            } catch (error) {
              console.error('Error updating privacy:', error)
              setSettings(prev => ({ ...prev, isPrivate: !newValue }))
            }
          }}
          className="card-steel p-4 w-full flex items-center gap-4 hover:border-iron-600 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
            {settings.isPrivate ? (
              <EyeOff className="w-5 h-5 text-orange-400" />
            ) : (
              <Eye className="w-5 h-5 text-orange-400" />
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="font-medium text-iron-200">Private Profile</p>
            <p className="text-sm text-iron-500">
              {settings.isPrivate ? 'Your activity is hidden from the feed' : 'Your activity appears in the feed'}
            </p>
          </div>
          <div className={`w-12 h-7 rounded-full transition-colors ${
            settings.isPrivate ? 'bg-flame-500' : 'bg-iron-700'
          }`}>
            <div className={`w-5 h-5 bg-white rounded-full mt-1 transition-transform ${
              settings.isPrivate ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </div>
        </button>

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
                  
                  {usageStats.totalRequests === 0 && (
                    <p className="text-sm text-iron-500 text-center py-2">No AI usage yet</p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

      </div>

      {/* Install App */}
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
        <p className="mt-1">Made with 💪 for serious lifters</p>
      </div>
    </div>
  )
}