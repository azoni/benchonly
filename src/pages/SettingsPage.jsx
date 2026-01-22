import { useState, useRef, useEffect } from 'react'
import { 
  User, 
  Bell, 
  Moon, 
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
  ChevronDown
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { signOut, updateProfile as updateAuthProfile } from 'firebase/auth'
import { auth } from '../services/firebase'
import { ACTIVITY_LEVELS } from '../services/calorieService'

export default function SettingsPage() {
  const { user, userProfile, updateProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || user?.photoURL)
  const fileInputRef = useRef(null)
  const [showProfileSection, setShowProfileSection] = useState(false)
  
  const [settings, setSettings] = useState({
    notifications: userProfile?.settings?.notifications ?? true,
    units: userProfile?.settings?.units || 'lbs',
    theme: userProfile?.settings?.theme || 'dark',
    weekStartDay: userProfile?.settings?.weekStartDay || 'monday'
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
    }
  }, [userProfile])

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
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="text-xs text-flame-400 hover:text-flame-300 mt-1"
            >
              {uploadingPhoto ? 'Uploading...' : 'Change photo'}
            </button>
          </div>
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
                <label className="text-sm text-iron-400 mb-1 block">Daily Activity Level</label>
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

        {/* Theme */}
        <div className="card-steel p-4 opacity-50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Moon className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-iron-200">Dark Mode</p>
              <p className="text-sm text-iron-500">Always on (more themes coming)</p>
            </div>
            <Check className="w-5 h-5 text-flame-400" />
          </div>
        </div>
      </div>

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
        <p>Bench Only v1.0.0</p>
        <p className="mt-1">Made with 💪 for serious lifters</p>
      </div>
    </div>
  )
}
