import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Dumbbell,
  Users,
  Target,
  Calendar,
  Calculator,
  Sparkles,
  Check,
  Video,
} from 'lucide-react'

const ONBOARDING_STEPS = [
  {
    icon: Sparkles,
    title: 'Welcome to BENCH ONLY',
    description: 'Your personal strength training companion. Track workouts, set goals, and train smarter.',
    color: 'flame'
  },
  {
    icon: Dumbbell,
    title: 'Log Your Workouts',
    description: 'Log sets, reps, and weight with a clean, focused interface. Track RPE and pain to monitor recovery.',
    color: 'green'
  },
  {
    icon: Target,
    title: 'Set & Track Goals',
    description: 'Create goals for weight, reps, or time. Watch your progress with visual tracking.',
    color: 'purple'
  },
  {
    icon: Sparkles,
    title: 'AI Training Assistant',
    description: 'Generate workouts tailored to your maxes and history. Each exercise includes form cues, substitutions, and video links.',
    color: 'flame'
  },
  {
    icon: Video,
    title: 'AI Form Check',
    description: 'Upload a video of your lift and get frame-by-frame form analysis with coaching cues and scores.',
    color: 'purple'
  },
  {
    icon: Users,
    title: 'Train with Groups',
    description: 'Coaches can create groups and prescribe personalized workouts for each member with specific weights and reps.',
    color: 'cyan'
  },
  {
    icon: Calendar,
    title: 'Schedule & Plan',
    description: 'Set recurring workout days and see everything on your calendar. Never miss a session.',
    color: 'yellow'
  },
  {
    icon: Calculator,
    title: 'Training Tools',
    description: 'Calculate your 1RM, plan working weights, and optimize your training.',
    color: 'green'
  }
]

const colorClasses = {
  flame: { bg: 'bg-flame-500/20', text: 'text-flame-400', border: 'border-flame-500' },
  green: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500' },
  cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500' },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500' },
}

export default function OnboardingModal({ isOpen, onClose, isFirstTime = false }) {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
    }
  }, [isOpen])

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleComplete = () => {
    // Mark onboarding as seen
    localStorage.setItem('benchpressonly_onboarding_seen', 'true')
    onClose()
  }

  const handleSkip = () => {
    localStorage.setItem('benchpressonly_onboarding_seen', 'true')
    onClose()
  }

  const step = ONBOARDING_STEPS[currentStep]
  const colors = colorClasses[step.color]
  const Icon = step.icon
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleSkip}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-[15%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg z-50"
          >
            <div className="bg-iron-900 rounded-2xl border border-iron-800 overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-iron-800">
                <div className="flex items-center gap-2">
                  {ONBOARDING_STEPS.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentStep(index)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentStep 
                          ? 'w-6 bg-flame-500' 
                          : index < currentStep 
                            ? 'bg-flame-500/50' 
                            : 'bg-iron-700'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={handleSkip}
                  className="p-2 text-iron-500 hover:text-iron-300 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="text-center"
                  >
                    {/* Icon */}
                    <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl ${colors.bg} flex items-center justify-center`}>
                      <Icon className={`w-10 h-10 ${colors.text}`} />
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl font-display text-iron-100 mb-3">
                      {step.title}
                    </h2>

                    {/* Description */}
                    <p className="text-iron-400 leading-relaxed">
                      {step.description}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-iron-800 flex items-center justify-between">
                <button
                  onClick={handlePrev}
                  disabled={currentStep === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    currentStep === 0
                      ? 'text-iron-600 cursor-not-allowed'
                      : 'text-iron-400 hover:text-iron-200 hover:bg-iron-800'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>

                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-2 bg-flame-500 hover:bg-flame-600 text-white rounded-lg font-medium transition-colors"
                >
                  {isLastStep ? (
                    <>
                      Get Started
                      <Check className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Hook to check if onboarding should show
export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem('benchpressonly_onboarding_seen')
    if (!seen) {
      // Small delay so page loads first
      const timer = setTimeout(() => setShowOnboarding(true), 500)
      return () => clearTimeout(timer)
    }
  }, [])

  const openOnboarding = () => setShowOnboarding(true)
  const closeOnboarding = () => setShowOnboarding(false)

  return { showOnboarding, openOnboarding, closeOnboarding }
}