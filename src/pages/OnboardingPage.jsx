import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  ChevronLeft,
  Dumbbell,
  Target,
  Zap,
  User,
  Ruler,
  Scale,
  Calendar,
  Loader2,
  Sparkles,
  Check,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'profile', title: 'Your Stats' },
  { id: 'focus', title: 'Training Focus' },
  { id: 'goal', title: 'First Goal' },
  { id: 'ready', title: 'Ready' },
]

const TRAINING_FOCUSES = [
  { id: 'bench-pr', label: 'Bench Press PR', desc: 'Chasing a new max' },
  { id: 'strength', label: 'General Strength', desc: 'Get stronger all around' },
  { id: 'hypertrophy', label: 'Hypertrophy', desc: 'Build muscle mass' },
  { id: 'powerlifting', label: 'Powerlifting', desc: 'Compete in the big 3' },
  { id: 'fitness', label: 'General Fitness', desc: 'Stay healthy and active' },
  { id: 'rehab', label: 'Rehab / Return', desc: 'Coming back from injury' },
]

const COMMON_LIFTS = [
  'Bench Press', 'Squat', 'Deadlift', 'Overhead Press',
  'Incline Bench', 'Close Grip Bench', 'Barbell Row', 'Pull-ups',
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, updateProfile } = useAuth()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [direction, setDirection] = useState(1)
  const isPreview = new URLSearchParams(window.location.search).has('preview')

  const [profile, setProfile] = useState({
    weight: '',
    heightFeet: '',
    heightInches: '',
    age: '',
    gender: '',
  })

  const [focus, setFocus] = useState([])
  const [goal, setGoal] = useState({
    lift: 'Bench Press',
    currentWeight: '',
    targetWeight: '',
  })
  const [skipGoal, setSkipGoal] = useState(false)

  const goNext = () => {
    setDirection(1)
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  const goBack = () => {
    setDirection(-1)
    setStep(s => Math.max(s - 1, 0))
  }

  const canProceed = () => {
    switch (STEPS[step].id) {
      case 'welcome': return true
      case 'profile': return profile.weight && profile.heightFeet && profile.age
      case 'focus': return focus.length > 0
      case 'goal': return skipGoal || (goal.currentWeight && goal.targetWeight)
      case 'ready': return true
      default: return true
    }
  }

  const handleFinish = async () => {
    // In preview mode, just navigate back without saving
    if (isPreview) {
      navigate('/today', { replace: true })
      return
    }

    setSaving(true)
    try {
      const heightTotal = profile.heightFeet && profile.heightInches
        ? (parseInt(profile.heightFeet) * 12) + parseInt(profile.heightInches || 0)
        : null

      const updates = {
        weight: profile.weight ? parseFloat(profile.weight) : null,
        heightFeet: profile.heightFeet ? parseInt(profile.heightFeet) : null,
        heightInches: profile.heightInches ? parseInt(profile.heightInches) : null,
        height: heightTotal,
        age: profile.age ? parseInt(profile.age) : null,
        gender: profile.gender || null,
        trainingFocus: focus,
        onboardingComplete: true,
        credits: 50,
      }

      await updateProfile(updates)

      // Create goal if provided
      if (!skipGoal && goal.currentWeight && goal.targetWeight) {
        const { goalService } = await import('../services/firestore')
        await goalService.create(user.uid, {
          lift: goal.lift,
          startWeight: parseFloat(goal.currentWeight),
          currentWeight: parseFloat(goal.currentWeight),
          targetWeight: parseFloat(goal.targetWeight),
          targetDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'active',
        })
      }

      navigate('/today', { replace: true })
    } catch (error) {
      console.error('Onboarding error:', error)
      alert('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const slideVariants = {
    enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  }

  const renderStep = () => {
    switch (STEPS[step].id) {
      case 'welcome':
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-flame-500/20 rounded-2xl flex items-center justify-center mx-auto">
              <Dumbbell className="w-10 h-10 text-flame-400" />
            </div>
            <div>
              <h1 className="text-3xl font-display text-iron-100">
                Welcome{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
              </h1>
              <p className="text-iron-400 mt-3 max-w-sm mx-auto">
                Let's get you set up. This takes about 30 seconds and helps the AI
                build better workouts for you.
              </p>
            </div>
            <div className="flex flex-col gap-3 max-w-xs mx-auto pt-2">
              <div className="flex items-center gap-3 text-left">
                <div className="w-8 h-8 rounded-full bg-flame-500/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-flame-400" />
                </div>
                <span className="text-sm text-iron-300">Your body stats for smart weight calculations</span>
              </div>
              <div className="flex items-center gap-3 text-left">
                <div className="w-8 h-8 rounded-full bg-flame-500/10 flex items-center justify-center flex-shrink-0">
                  <Target className="w-4 h-4 text-flame-400" />
                </div>
                <span className="text-sm text-iron-300">Your training focus and first goal</span>
              </div>
              <div className="flex items-center gap-3 text-left">
                <div className="w-8 h-8 rounded-full bg-flame-500/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-flame-400" />
                </div>
                <span className="text-sm text-iron-300">50 free AI credits to get started</span>
              </div>
            </div>
          </div>
        )

      case 'profile':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-display text-iron-100">Your Stats</h2>
              <p className="text-iron-500 text-sm mt-1">Used for workout calculations and calorie estimates</p>
            </div>

            <div className="space-y-4 max-w-sm mx-auto">
              <div>
                <label className="text-sm text-iron-400 mb-1.5 block">Body Weight (lbs)</label>
                <div className="relative">
                  <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500" />
                  <input
                    type="number"
                    value={profile.weight}
                    onChange={(e) => setProfile(p => ({ ...p, weight: e.target.value }))}
                    placeholder="170"
                    className="input-field w-full pl-10"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-iron-400 mb-1.5 block">Height</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500" />
                    <input
                      type="number"
                      value={profile.heightFeet}
                      onChange={(e) => setProfile(p => ({ ...p, heightFeet: e.target.value }))}
                      placeholder="5"
                      className="input-field w-full pl-10"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-iron-500">ft</span>
                  </div>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={profile.heightInches}
                      onChange={(e) => setProfile(p => ({ ...p, heightInches: e.target.value }))}
                      placeholder="10"
                      className="input-field w-full"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-iron-500">in</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm text-iron-400 mb-1.5 block">Age</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500" />
                    <input
                      type="number"
                      value={profile.age}
                      onChange={(e) => setProfile(p => ({ ...p, age: e.target.value }))}
                      placeholder="25"
                      className="input-field w-full pl-10"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-sm text-iron-400 mb-1.5 block">Gender</label>
                  <div className="flex gap-1.5">
                    {['male', 'female'].map(g => (
                      <button
                        key={g}
                        onClick={() => setProfile(p => ({ ...p, gender: g }))}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors capitalize ${
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
            </div>
          </div>
        )

      case 'focus':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-display text-iron-100">Training Focus</h2>
              <p className="text-iron-500 text-sm mt-1">Select all that apply — helps the AI tailor workouts</p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
              {TRAINING_FOCUSES.map(f => {
                const selected = focus.includes(f.id)
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      setFocus(prev =>
                        selected ? prev.filter(x => x !== f.id) : [...prev, f.id]
                      )
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selected
                        ? 'border-flame-500 bg-flame-500/10'
                        : 'border-iron-700 bg-iron-800/50 hover:border-iron-600'
                    }`}
                  >
                    <p className={`text-sm font-medium ${selected ? 'text-flame-300' : 'text-iron-200'}`}>
                      {f.label}
                    </p>
                    <p className="text-xs text-iron-500 mt-0.5">{f.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )

      case 'goal':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-display text-iron-100">Set a Goal</h2>
              <p className="text-iron-500 text-sm mt-1">Something to work toward — you can always change it</p>
            </div>

            {skipGoal ? (
              <div className="text-center py-8 max-w-sm mx-auto">
                <p className="text-iron-400">No worries — you can set goals anytime from the Goals page.</p>
                <button
                  onClick={() => setSkipGoal(false)}
                  className="text-flame-400 text-sm mt-3 hover:text-flame-300"
                >
                  Actually, let me set one →
                </button>
              </div>
            ) : (
              <div className="space-y-4 max-w-sm mx-auto">
                <div>
                  <label className="text-sm text-iron-400 mb-1.5 block">Lift</label>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_LIFTS.slice(0, 6).map(lift => (
                      <button
                        key={lift}
                        onClick={() => setGoal(g => ({ ...g, lift }))}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          goal.lift === lift
                            ? 'bg-flame-500 text-white'
                            : 'bg-iron-800 text-iron-400 hover:bg-iron-700'
                        }`}
                      >
                        {lift}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-sm text-iron-400 mb-1.5 block">Current (lbs)</label>
                    <input
                      type="number"
                      value={goal.currentWeight}
                      onChange={(e) => setGoal(g => ({ ...g, currentWeight: e.target.value }))}
                      placeholder="225"
                      className="input-field w-full"
                    />
                  </div>
                  <div className="flex items-end pb-2.5">
                    <ChevronRight className="w-5 h-5 text-iron-600" />
                  </div>
                  <div className="flex-1">
                    <label className="text-sm text-iron-400 mb-1.5 block">Target (lbs)</label>
                    <input
                      type="number"
                      value={goal.targetWeight}
                      onChange={(e) => setGoal(g => ({ ...g, targetWeight: e.target.value }))}
                      placeholder="315"
                      className="input-field w-full"
                    />
                  </div>
                </div>

                <p className="text-xs text-iron-500 text-center">
                  Target date auto-set to 90 days from now
                </p>

                <button
                  onClick={() => setSkipGoal(true)}
                  className="text-iron-500 text-sm w-full text-center hover:text-iron-300 pt-2"
                >
                  Skip for now
                </button>
              </div>
            )}
          </div>
        )

      case 'ready':
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto">
              <Sparkles className="w-10 h-10 text-green-400" />
            </div>
            <div>
              <h2 className="text-3xl font-display text-iron-100">You're All Set</h2>
              <p className="text-iron-400 mt-3 max-w-xs mx-auto">
                You've got <span className="text-flame-400 font-semibold">50 free credits</span> to 
                generate AI workouts and chat with your training assistant.
              </p>
            </div>

            <div className="max-w-xs mx-auto space-y-2 text-left">
              <div className="flex items-center gap-3 bg-iron-800/50 rounded-lg p-3">
                <div className="w-6 h-6 rounded-full bg-flame-500/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-3 h-3 text-flame-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-iron-300">AI Chat</p>
                </div>
                <span className="text-xs text-iron-500">1 credit / msg</span>
              </div>
              <div className="flex items-center gap-3 bg-iron-800/50 rounded-lg p-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Dumbbell className="w-3 h-3 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-iron-300">Workout Generation</p>
                </div>
                <span className="text-xs text-iron-500">5 credits</span>
              </div>
              <div className="flex items-center gap-3 bg-iron-800/50 rounded-lg p-3">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                  <Target className="w-3 h-3 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-iron-300">Group Workout</p>
                </div>
                <span className="text-xs text-iron-500">5 credits / athlete</span>
              </div>
              <div className="flex items-center gap-3 bg-iron-800/50 rounded-lg p-3">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-3 h-3 text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-iron-300">Training Program</p>
                </div>
                <span className="text-xs text-iron-500">10 credits</span>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-iron-950 flex flex-col">
      {/* Progress bar */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex gap-1.5 max-w-sm mx-auto">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= step ? 'bg-flame-500' : 'bg-iron-800'
              }`}
            />
          ))}
        </div>
        <p className="text-center text-xs text-iron-600 mt-2">
          {step + 1} of {STEPS.length}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="w-full max-w-md"
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="px-6 pb-8 pt-4">
        <div className="flex gap-3 max-w-sm mx-auto">
          {step > 0 && (
            <button
              onClick={goBack}
              className="px-4 py-3 rounded-xl bg-iron-800 text-iron-300 
                hover:bg-iron-700 transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          {step < STEPS.length - 1 ? (
            <button
              onClick={goNext}
              disabled={!canProceed()}
              className="flex-1 py-3 rounded-xl bg-flame-500 text-white font-medium
                hover:bg-flame-400 disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors flex items-center justify-center gap-2"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-flame-500 text-white font-medium
                hover:bg-flame-400 disabled:opacity-50 transition-colors
                flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Let's Go
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}