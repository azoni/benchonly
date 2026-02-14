import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap, Dumbbell, Loader2, Award } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { workoutService } from '../services/firestore'

export default function SpecialEventModal({ event, onClose, userContext }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [creating, setCreating] = useState(false)

  if (!event) return null

  const handleAccept = async () => {
    if (!user || creating) return
    setCreating(true)

    try {
      const workoutData = event.buildWorkout(userContext)
      const today = new Date()
      today.setHours(12, 0, 0, 0)
      
      const result = await workoutService.create(user.uid, {
        ...workoutData,
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
          className="w-full max-w-sm bg-iron-900 rounded-2xl border border-iron-800 overflow-hidden shadow-2xl"
        >
          {/* Top accent */}
          <div className={`h-1.5 ${theme.buttonBg || 'bg-flame-500'}`} />

          <div className="p-6 text-center">
            {/* Emoji */}
            <div className="text-5xl mb-4">{event.emoji}</div>

            {/* Title */}
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

            {/* CTA */}
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
                  Start Challenge
                </>
              )}
            </button>
            
            <button
              onClick={onClose}
              className="mt-3 text-sm text-iron-500 hover:text-iron-300 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}