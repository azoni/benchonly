import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Dumbbell, Loader2, Award, ChevronRight, ChevronDown, ChevronUp, ArrowLeft, RotateCcw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { workoutService } from '../services/firestore'

export default function SpecialEventModal({ event, onClose, userContext }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [creating, setCreating] = useState(false)
  const [step, setStep] = useState('intro') // 'intro' | 'preview'
  const [expandedExercise, setExpandedExercise] = useState(null)

  // Build the workout once so we can preview it
  const previewWorkout = useMemo(() => {
    if (!event) return null
    return event.buildWorkout(userContext)
  }, [event, userContext])

  if (!event) return null

  const handleAccept = async () => {
    if (!user || creating) return
    setCreating(true)

    try {
      const workoutData = previewWorkout
      const today = new Date()
      today.setHours(12, 0, 0, 0)
      
      // Don't save circuitExercises to Firestore — it's just for preview
      const { circuitExercises, ...saveData } = workoutData
      
      const result = await workoutService.create(user.uid, {
        ...saveData,
        date: today,
      })

      onClose()
      if (result?.id) {
        navigate(`/workouts/${result.id}`)
      }
    } catch (err) {
      console.error('Error creating event workout:', err)
      alert('Something went wrong. Try again!')
    } finally {
      setCreating(false)
    }
  }

  const theme = event.theme || {}
  // Use circuitExercises for clean preview, fall back to flat list
  const circuitExercises = previewWorkout?.circuitExercises || []

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-sm bg-iron-900 rounded-2xl border border-iron-800 overflow-hidden shadow-2xl max-h-[85vh] flex flex-col"
        >
          {/* Top accent */}
          <div className={`h-1.5 flex-shrink-0 ${theme.buttonBg || 'bg-flame-500'}`} />

          <AnimatePresence mode="wait">
            {step === 'intro' ? (
              <motion.div
                key="intro"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6 text-center"
              >
                <div className="text-5xl mb-4">{event.emoji}</div>

                <h2 className="text-xl font-display text-iron-50 mb-2">
                  {event.name}
                </h2>
                <p className="text-sm text-iron-400 leading-relaxed mb-4">
                  {event.description}
                </p>
                {event.dateLabel && (
                  <p className="text-xs text-iron-500 mb-6">
                    Available {event.dateLabel}
                  </p>
                )}

                {/* Rewards */}
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-iron-800 rounded-lg">
                    <Zap className="w-4 h-4 text-flame-400" />
                    <span className="text-sm font-medium text-iron-200">{event.creditReward} credits</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-iron-800 rounded-lg">
                    <Award className="w-4 h-4 text-pink-400" />
                    <span className="text-sm font-medium text-iron-200">Profile badge</span>
                  </div>
                </div>

                <button
                  onClick={() => setStep('preview')}
                  className={`w-full py-3 rounded-xl font-semibold text-white transition-colors flex items-center justify-center gap-2 ${
                    theme.buttonBg || 'bg-flame-500'
                  } ${theme.buttonHover || 'hover:bg-flame-600'}`}
                >
                  See the Workout
                  <ChevronRight className="w-5 h-5" />
                </button>
                
                <button
                  onClick={onClose}
                  className="mt-3 text-sm text-iron-500 hover:text-iron-300 transition-colors"
                >
                  Maybe later
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col min-h-0"
              >
                {/* Preview header */}
                <div className="p-4 pb-3 flex-shrink-0">
                  <button
                    onClick={() => setStep('intro')}
                    className="flex items-center gap-1 text-xs text-iron-500 hover:text-iron-300 transition-colors mb-3"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                  <h2 className="text-lg font-display text-iron-50 flex items-center gap-2">
                    <span>{event.emoji}</span>
                    Workout Preview
                  </h2>
                  
                  {/* Circuit explanation */}
                  <div className="mt-3 p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <RotateCcw className="w-4 h-4 text-pink-400" />
                      <span className="text-xs font-semibold text-pink-300">Circuit Format</span>
                    </div>
                    <p className="text-xs text-iron-400 leading-relaxed">
                      Do all 6 exercises in order = 1 round. Rest 30–60s, then repeat. 3 rounds total. ~10 min.
                    </p>
                  </div>
                </div>

                {/* Exercise list — shown as the circuit (one round) */}
                <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2">
                  {circuitExercises.map((ex, i) => {
                    const isExpanded = expandedExercise === i
                    const isTime = ex.type === 'time'
                    const repsLabel = isTime ? `${ex.time}s hold` : `${ex.reps} reps`
                    
                    return (
                      <div
                        key={i}
                        className="bg-iron-800/50 border border-iron-700/50 rounded-xl overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedExercise(isExpanded ? null : i)}
                          className="w-full flex items-center gap-3 p-3 text-left hover:bg-iron-800/80 transition-colors"
                        >
                          <span className="w-6 h-6 rounded-full bg-pink-500/15 text-pink-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-iron-200">{ex.name}</p>
                            <p className="text-xs text-iron-500">{repsLabel}</p>
                          </div>
                          {ex.notes && (
                            isExpanded 
                              ? <ChevronUp className="w-4 h-4 text-iron-500 flex-shrink-0" />
                              : <ChevronDown className="w-4 h-4 text-iron-500 flex-shrink-0" />
                          )}
                        </button>
                        
                        <AnimatePresence>
                          {isExpanded && ex.notes && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <p className="px-3 pb-3 text-xs text-iron-400 leading-relaxed border-t border-iron-700/30 pt-2 mx-3">
                                {ex.notes}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                  
                  {/* Repeat reminder */}
                  <div className="flex items-center gap-2 py-2 px-1">
                    <div className="flex-1 border-t border-iron-700/40" />
                    <span className="text-[11px] text-iron-500 flex items-center gap-1.5">
                      <RotateCcw className="w-3 h-3" />
                      Repeat 3×
                    </span>
                    <div className="flex-1 border-t border-iron-700/40" />
                  </div>
                </div>

                {/* Bottom CTA */}
                <div className="p-4 pt-3 flex-shrink-0 border-t border-iron-800/50">
                  <button
                    onClick={handleAccept}
                    disabled={creating}
                    className={`w-full py-3 rounded-xl font-semibold text-white transition-colors flex items-center justify-center gap-2 ${
                      theme.buttonBg || 'bg-flame-500'
                    } ${theme.buttonHover || 'hover:bg-flame-600'} disabled:opacity-50`}
                  >
                    {creating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Dumbbell className="w-5 h-5" />
                        Let's Go
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}