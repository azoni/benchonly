import { useState, useEffect } from 'react'
import { X, Download, Share, Plus } from 'lucide-react'

// Detects iOS Safari for manual install instructions
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showBanner, setShowBanner] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Don't show if already installed or recently dismissed
    if (isStandalone()) return
    const dismissedAt = localStorage.getItem('installPromptDismissed')
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return

    // Android / Desktop Chrome
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // Show after a delay so it's not the first thing they see
      setTimeout(() => setShowBanner(true), 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // iOS — show after 3 visits
    if (isIOS()) {
      const visits = parseInt(localStorage.getItem('appVisits') || '0') + 1
      localStorage.setItem('appVisits', String(visits))
      if (visits >= 3) {
        setTimeout(() => setShowBanner(true), 3000)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') {
        setShowBanner(false)
      }
      setDeferredPrompt(null)
    } else if (isIOS()) {
      setShowIOSGuide(true)
    }
  }

  const handleDismiss = () => {
    setShowBanner(false)
    setDismissed(true)
    localStorage.setItem('installPromptDismissed', String(Date.now()))
  }

  if (!showBanner || dismissed) return null

  // iOS guide overlay
  if (showIOSGuide) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-4">
        <div className="bg-iron-900 border border-iron-700 rounded-2xl p-5 max-w-sm w-full mb-4 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-iron-100">Add to Home Screen</h3>
            <button onClick={handleDismiss} className="text-iron-500 hover:text-iron-300">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-iron-800 flex items-center justify-center flex-shrink-0">
                <Share className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-iron-200 font-medium">1. Tap the Share button</p>
                <p className="text-xs text-iron-500">In Safari's bottom toolbar</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-iron-800 flex items-center justify-center flex-shrink-0">
                <Plus className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-iron-200 font-medium">2. Tap "Add to Home Screen"</p>
                <p className="text-xs text-iron-500">Scroll down in the share sheet</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-iron-800 flex items-center justify-center flex-shrink-0">
                <Download className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-iron-200 font-medium">3. Tap "Add"</p>
                <p className="text-xs text-iron-500">The app will appear on your home screen</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="w-full mt-4 py-2.5 text-sm text-iron-400 hover:text-iron-200 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    )
  }

  // Compact banner
  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 lg:left-auto lg:right-6 lg:bottom-6 lg:max-w-sm">
      <div className="bg-iron-900 border border-iron-700 rounded-xl p-3 shadow-xl flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-flame-500 flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-iron-100">Install Bench Only</p>
          <p className="text-xs text-iron-500">Add to home screen for the full experience</p>
        </div>
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 bg-flame-500 text-white text-sm font-medium rounded-lg hover:bg-flame-400 transition-colors flex-shrink-0"
        >
          Install
        </button>
        <button onClick={handleDismiss} className="text-iron-600 hover:text-iron-400 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
