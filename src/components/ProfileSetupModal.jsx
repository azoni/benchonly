import { useState, useEffect } from 'react'
import { X, ChevronRight, Activity, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ACTIVITY_LEVELS } from '../services/calorieService'

const STORAGE_KEY = 'profile_setup_dismissed'

export function useProfileSetup() {
  const { userProfile } = useAuth()
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    // Check if user has completed profile or dismissed the modal
    const dismissed = localStorage.getItem(STORAGE_KEY)
    const hasProfile = userProfile?.weight && userProfile?.height && userProfile?.age
    
    if (!dismissed && !hasProfile && userProfile) {
      // Show after a short delay so the page loads first
      const timer = setTimeout(() => setShowModal(true), 1500)
      return () => clearTimeout(timer)
    }
  }, [userProfile])

  const dismissModal = () => {
    setShowModal(false)
    localStorage.setItem(STORAGE_KEY, 'true')
  }

  return { showModal, dismissModal }
}

export default function ProfileSetupModal({ isOpen, onClose }) {
  const { userProfile, updateProfile } = useAuth()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  
  const [profile, setProfile] = useState({
    weight: '',
    heightFeet: '',
    heightInches: '',
    age: '',
    gender: '',
    activityLevel: 'light'
  })

  if (!isOpen) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      const heightTotal = profile.heightFeet && profile.heightInches 
        ? (parseInt(profile.heightFeet) * 12) + parseInt(profile.heightInches)
        : null

      await updateProfile({
        weight: profile.weight ? parseFloat(profile.weight) : null,
        heightFeet: profile.heightFeet ? parseInt(profile.heightFeet) : null,
        heightInches: profile.heightInches ? parseInt(profile.heightInches) : null,
        height: heightTotal,
        age: profile.age ? parseInt(profile.age) : null,
        gender: profile.gender || null,
        activityLevel: profile.activityLevel || 'light'
      })
      
      localStorage.setItem(STORAGE_KEY, 'true')
      onClose()
    } catch (error) {
      console.error('Error saving profile:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    onClose()
  }

  const canProceed = () => {
    switch (step) {
      case 1: return profile.weight && profile.heightFeet
      case 2: return profile.age && profile.gender
      case 3: return profile.activityLevel
      default: return false
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-iron-900 rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-iron-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-flame-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-flame-400" />
            </div>
            <div>
              <h2 className="font-display text-lg text-iron-100">Set Up Your Profile</h2>
              <p className="text-xs text-iron-500">For accurate calorie tracking</p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            className="p-2 text-iron-400 hover:text-iron-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-4 pt-4">
          <div className="flex gap-2">
            {[1, 2, 3].map(s => (
              <div 
                key={s}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  s <= step ? 'bg-flame-500' : 'bg-iron-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-iron-100">Body Measurements</h3>
              <p className="text-sm text-iron-400">This helps us calculate your base calorie burn.</p>
              
              <div>
                <label className="text-sm text-iron-400 mb-1 block">Weight (lbs)</label>
                <input
                  type="number"
                  value={profile.weight}
                  onChange={(e) => setProfile(p => ({ ...p, weight: e.target.value }))}
                  placeholder="170"
                  className="input-field w-full text-lg"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm text-iron-400 mb-1 block">Height</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={profile.heightFeet}
                      onChange={(e) => setProfile(p => ({ ...p, heightFeet: e.target.value }))}
                      placeholder="5"
                      className="input-field w-full text-lg"
                    />
                    <span className="text-xs text-iron-500 mt-1 block">feet</span>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      value={profile.heightInches}
                      onChange={(e) => setProfile(p => ({ ...p, heightInches: e.target.value }))}
                      placeholder="10"
                      className="input-field w-full text-lg"
                    />
                    <span className="text-xs text-iron-500 mt-1 block">inches</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-iron-100">About You</h3>
              <p className="text-sm text-iron-400">Age and gender affect your metabolism.</p>
              
              <div>
                <label className="text-sm text-iron-400 mb-1 block">Age</label>
                <input
                  type="number"
                  value={profile.age}
                  onChange={(e) => setProfile(p => ({ ...p, age: e.target.value }))}
                  placeholder="30"
                  className="input-field w-full text-lg"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm text-iron-400 mb-2 block">Gender</label>
                <div className="flex gap-2">
                  {['male', 'female', 'other'].map(g => (
                    <button
                      key={g}
                      onClick={() => setProfile(p => ({ ...p, gender: g }))}
                      className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors capitalize ${
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
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-iron-100">Daily Activity</h3>
              <p className="text-sm text-iron-400">How active are you outside of workouts?</p>
              
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
                    <p className={`font-medium ${profile.activityLevel === key ? 'text-flame-400' : 'text-iron-200'}`}>
                      {level.label}
                    </p>
                    <p className="text-xs text-iron-500">{level.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-iron-800 flex gap-3">
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="btn-secondary flex-1"
            >
              Back
            </button>
          ) : (
            <button
              onClick={handleSkip}
              className="btn-secondary flex-1"
            >
              Skip for now
            </button>
          )}
          
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Saving...' : 'Complete'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
