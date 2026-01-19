import { useState, useRef } from 'react'
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
  Loader2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { signOut, updateProfile as updateAuthProfile } from 'firebase/auth'
import { auth } from '../services/firebase'

export default function SettingsPage() {
  const { user, userProfile, updateProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoURL, setPhotoURL] = useState(userProfile?.photoURL || user?.photoURL)
  const fileInputRef = useRef(null)
  const [settings, setSettings] = useState({
    notifications: userProfile?.settings?.notifications ?? true,
    units: userProfile?.settings?.units || 'lbs',
    theme: userProfile?.settings?.theme || 'dark'
  })

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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (max 5MB before compression)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB')
      return
    }

    setUploadingPhoto(true)
    try {
      // Compress image to small Base64
      const base64Image = await compressImage(file, 200, 0.8)
      
      // Update Firestore profile with Base64 image
      await updateProfile({
        photoURL: base64Image
      })
      
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
      // Revert on error
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

  const handleSignOut = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      // TODO: Implement account deletion
      alert('Account deletion coming soon. Contact support for now.')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-display text-iron-100">Settings</h1>
        <p className="text-iron-500 text-sm mt-1">
          Manage your preferences
        </p>
      </div>

      {/* Profile Section */}
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
            
            {/* Upload button overlay */}
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
        <p>BenchPressOnly v1.0.0</p>
        <p className="mt-1">Made with 💪 for serious lifters</p>
      </div>
    </div>
  )
}