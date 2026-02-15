import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Video,
  Upload,
  Camera,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  RotateCcw,
  ArrowLeft,
  Info,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { creditService, CREDIT_COSTS } from '../services/firestore'

const MAX_FRAMES = 20
const FRAME_WIDTH = 480
const JPEG_QUALITY = 0.6
const FORM_CHECK_PREMIUM_COST = 50

// Score helpers — return full static class names so Tailwind can detect them at build
function scoreColor(score) {
  if (score >= 8) return 'text-green-400'
  if (score >= 6) return 'text-yellow-400'
  if (score >= 4) return 'text-orange-400'
  return 'text-red-400'
}

function scoreBgClass(score) {
  if (score >= 8) return 'bg-green-500/20'
  if (score >= 6) return 'bg-yellow-500/20'
  if (score >= 4) return 'bg-orange-500/20'
  return 'bg-red-500/20'
}

function scoreBgSolid(score) {
  if (score >= 8) return 'bg-green-500'
  if (score >= 6) return 'bg-yellow-500'
  if (score >= 4) return 'bg-orange-500'
  return 'bg-red-500'
}

function scoreBgFaint(score) {
  if (score >= 8) return 'bg-green-500/30'
  if (score >= 6) return 'bg-yellow-500/30'
  if (score >= 4) return 'bg-orange-500/30'
  return 'bg-red-500/30'
}

export default function FormCheckPage() {
  const { user, isAppAdmin } = useAuth()
  const isAdmin = isAppAdmin
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)

  const [step, setStep] = useState('upload')
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [frames, setFrames] = useState([])
  const [note, setNote] = useState('')
  const [model, setModel] = useState('standard')
  const [extractProgress, setExtractProgress] = useState(0)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState(null)
  const [activeFrame, setActiveFrame] = useState(0)

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [videoUrl])

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('video/')) {
      setError('Please select a video file.')
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('Video must be under 100MB.')
      return
    }

    setError(null)
    setVideoFile(file)
    // Revoke old URL if re-selecting
    setVideoUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }, [])

  const extractFrames = useCallback(async () => {
    if (!videoUrl) return
    setStep('extracting')
    setExtractProgress(0)
    setError(null)

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) {
      setError('Could not initialize video processor.')
      setStep('upload')
      return
    }

    const ctx = canvas.getContext('2d')

    try {
      video.src = videoUrl
      await new Promise((resolve, reject) => {
        if (video.readyState >= 1) {
          resolve()
        } else {
          video.onloadedmetadata = resolve
          video.onerror = () => reject(new Error('Could not load video'))
        }
      })

      const duration = video.duration
      if (!duration || duration <= 0 || !isFinite(duration)) {
        setError('Could not read video duration. Try a different file.')
        setStep('upload')
        return
      }

      const totalFrames = Math.max(1, Math.min(MAX_FRAMES, Math.floor(duration)))
      const interval = duration / totalFrames

      const scale = Math.min(1, FRAME_WIDTH / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)

      const extractedFrames = []

      for (let i = 0; i < totalFrames; i++) {
        const time = i * interval

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Frame seek timed out')), 5000)
          video.onseeked = () => { clearTimeout(timeout); resolve() }
          video.onerror = () => { clearTimeout(timeout); reject(new Error('Video error during seek')) }
          video.currentTime = time
        })

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
        const base64 = dataUrl.split(',')[1]
        extractedFrames.push({ dataUrl, base64, timestamp: time, index: i + 1 })

        setExtractProgress(Math.round(((i + 1) / totalFrames) * 100))
      }

      setFrames(extractedFrames)
      setStep('preview')
    } catch (err) {
      console.error('Frame extraction error:', err)
      setError(err.message || 'Could not extract frames from this video. Try a different file.')
      setStep('upload')
    }
  }, [videoUrl])

  const analyzeForm = useCallback(async () => {
    if (!user || frames.length === 0) return
    setStep('analyzing')
    setError(null)

    const isPremium = model === 'premium'
    const cost = isPremium ? FORM_CHECK_PREMIUM_COST : CREDIT_COSTS['form-check']

    try {
      if (!isAdmin) {
        const creditResult = await creditService.deduct(user.uid, 'form-check', isPremium ? FORM_CHECK_PREMIUM_COST / CREDIT_COSTS['form-check'] : 1)
        if (!creditResult.success) {
          setError(`Not enough credits. You need ${cost} credits for a ${isPremium ? 'premium ' : ''}form check.`)
          setStep('preview')
          return
        }
      }

      const token = await user.getIdToken()
      const frameData = frames.map(f => f.base64)

      const response = await fetch('/.netlify/functions/analyze-form', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          frames: frameData,
          note: note.trim() || undefined,
          model: isPremium ? 'premium' : 'standard',
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Analysis failed')
      }

      const data = await response.json()
      setAnalysis(data.analysis)
      setActiveFrame(0)
      setStep('results')
    } catch (err) {
      console.error('Form analysis error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
      if (!isAdmin) {
        try { await creditService.add(user.uid, cost) } catch (_) {}
      }
      setStep('preview')
    }
  }, [user, frames, note, model, isAdmin])

  const reset = () => {
    setStep('upload')
    setVideoFile(null)
    setVideoUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setFrames([])
    setNote('')
    setModel('standard')
    setAnalysis(null)
    setError(null)
    setActiveFrame(0)
  }

  const currentFrameAnalysis = analysis?.frames?.[activeFrame]

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {step === 'results' && (
          <button onClick={reset} className="p-2 -ml-2 text-iron-400 hover:text-iron-200 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-display text-iron-100 flex items-center gap-2">
            <Video className="w-6 h-6 text-flame-400" />
            Form Check
          </h1>
          <p className="text-sm text-iron-500 mt-1">
            Upload a video and get AI-powered frame-by-frame form analysis
          </p>
        </div>
      </div>

      {/* Hidden elements for processing */}
      <video ref={videoRef} className="hidden" muted playsInline preload="metadata" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── UPLOAD STEP ─── */}
      {step === 'upload' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="card-steel p-8 border-2 border-dashed border-iron-700 hover:border-flame-500/50 rounded-xl cursor-pointer transition-colors text-center"
          >
            {videoFile ? (
              <div>
                <Video className="w-12 h-12 text-flame-400 mx-auto mb-3" />
                <p className="text-iron-200 font-medium">{videoFile.name}</p>
                <p className="text-xs text-iron-500 mt-1">
                  {(videoFile.size / (1024 * 1024)).toFixed(1)}MB · Tap to change
                </p>
              </div>
            ) : (
              <div>
                <Upload className="w-12 h-12 text-iron-600 mx-auto mb-3" />
                <p className="text-iron-300 font-medium">Upload a video</p>
                <p className="text-xs text-iron-500 mt-1">
                  Record a set or select from your camera roll
                </p>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Optional note */}
          <div>
            <label className="text-sm text-iron-400 mb-1.5 block">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., checking squat depth, first time deadlifting..."
              className="input-field w-full"
            />
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-iron-800/50 rounded-xl">
            <Info className="w-4 h-4 text-iron-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-iron-500 leading-relaxed">
              Your video is processed entirely on your device — only extracted frames are sent for analysis. Works best with a side or 45° angle of the full movement.
            </p>
          </div>

          {/* Model toggle */}
          <div>
            <label className="block text-sm text-iron-400 mb-2">AI Model</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setModel('standard')}
                className={`px-3 py-2 text-xs rounded-lg border transition-colors text-center
                  ${model === 'standard'
                    ? 'border-flame-500 bg-flame-500/10 text-flame-400'
                    : 'border-iron-700 text-iron-400 hover:border-iron-600'
                  }`}
              >
                <div className="font-medium flex items-center justify-center gap-1"><Zap className="w-3 h-3" />Standard</div>
                <div className="text-[10px] text-iron-500">{CREDIT_COSTS['form-check']} credits</div>
              </button>
              <button
                onClick={() => { if (isAdmin) setModel('premium') }}
                className={`px-3 py-2 text-xs rounded-lg border transition-colors text-center relative
                  ${model === 'premium'
                    ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                    : isAdmin
                      ? 'border-iron-700 text-iron-400 hover:border-iron-600'
                      : 'border-iron-800 text-iron-600 cursor-not-allowed opacity-50'
                  }`}
              >
                <div className="font-medium flex items-center justify-center gap-1"><Sparkles className="w-3 h-3" />Premium</div>
                <div className="text-[10px] text-iron-500">{isAdmin ? `${FORM_CHECK_PREMIUM_COST} credits` : 'Coming soon'}</div>
              </button>
            </div>
          </div>

          <button
            onClick={extractFrames}
            disabled={!videoFile}
            className="btn-primary w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Camera className="w-5 h-5" />
            Extract Frames
          </button>
        </motion.div>
      )}

      {/* ─── EXTRACTING STEP ─── */}
      {step === 'extracting' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card-steel p-8 text-center">
          <Loader2 className="w-10 h-10 text-flame-400 animate-spin mx-auto mb-4" />
          <p className="text-iron-200 font-medium mb-2">Extracting frames...</p>
          <div className="w-48 h-2 bg-iron-800 rounded-full mx-auto overflow-hidden">
            <div
              className="h-full bg-flame-500 rounded-full transition-all duration-300"
              style={{ width: `${extractProgress}%` }}
            />
          </div>
          <p className="text-xs text-iron-500 mt-2">{extractProgress}%</p>
        </motion.div>
      )}

      {/* ─── PREVIEW STEP ─── */}
      {step === 'preview' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="card-steel p-4">
            <h3 className="text-sm font-semibold text-iron-200 mb-3">
              {frames.length} frames extracted
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {frames.map((frame, i) => (
                <div key={i} className="relative aspect-video rounded-lg overflow-hidden bg-iron-800">
                  <img
                    src={frame.dataUrl}
                    alt={`Frame ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0.5 right-1 text-[10px] text-white/80 bg-black/60 px-1 rounded">
                    {Math.floor(frame.timestamp)}s
                  </span>
                </div>
              ))}
            </div>
          </div>

          {note && (
            <div className="card-steel p-3">
              <p className="text-xs text-iron-500">Note</p>
              <p className="text-sm text-iron-300">{note}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={reset} className="btn-secondary flex-1 py-3">
              Start Over
            </button>
            <button onClick={analyzeForm} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" />
              Analyze ({model === 'premium' ? FORM_CHECK_PREMIUM_COST : CREDIT_COSTS['form-check']} credits)
            </button>
          </div>
        </motion.div>
      )}

      {/* ─── ANALYZING STEP ─── */}
      {step === 'analyzing' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card-steel p-8 text-center">
          <Loader2 className="w-10 h-10 text-flame-400 animate-spin mx-auto mb-4" />
          <p className="text-iron-200 font-medium mb-1">Analyzing your form...</p>
          <p className="text-xs text-iron-500">This may take 15-30 seconds</p>
        </motion.div>
      )}

      {/* ─── RESULTS STEP ─── */}
      {step === 'results' && analysis && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Overall Score Card */}
          <div className="card-steel p-5">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${scoreBgClass(analysis.overallScore)}`}>
                <span className={`text-3xl font-display font-bold ${scoreColor(analysis.overallScore)}`}>
                  {analysis.overallScore}
                </span>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-display text-iron-100">{analysis.exercise || 'Exercise'}</h2>
                <p className="text-sm text-iron-400 mt-1 leading-relaxed">{analysis.overallSummary}</p>
              </div>
            </div>

            {/* Key issues & strengths */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {analysis.keyStrengths?.length > 0 && (
                <div className="space-y-1.5">
                  {analysis.keyStrengths.map((s, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-iron-400">{s}</p>
                    </div>
                  ))}
                </div>
              )}
              {analysis.keyIssues?.length > 0 && (
                <div className="space-y-1.5">
                  {analysis.keyIssues.map((s, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-iron-400">{s}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Frame-by-frame viewer */}
          {frames.length > 0 && analysis.frames?.length > 0 && (
            <div className="card-steel overflow-hidden">
              {/* Active frame image */}
              <div
                className="relative bg-black"
                onTouchStart={(e) => { e.currentTarget.dataset.touchX = e.touches[0].clientX }}
                onTouchEnd={(e) => {
                  const dx = e.changedTouches[0].clientX - Number(e.currentTarget.dataset.touchX || 0)
                  if (dx > 50 && activeFrame > 0) setActiveFrame(activeFrame - 1)
                  if (dx < -50 && activeFrame < frames.length - 1) setActiveFrame(activeFrame + 1)
                }}
              >
                <img
                  src={frames[activeFrame]?.dataUrl}
                  alt={`Frame ${activeFrame + 1}`}
                  className="w-full aspect-video object-contain"
                />
                {/* Frame nav — always visible on mobile, hover reveal on desktop */}
                {activeFrame > 0 && (
                  <button
                    onClick={() => setActiveFrame(activeFrame - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center
                      opacity-70 lg:opacity-0 lg:hover:opacity-100 active:opacity-100 transition-opacity"
                  >
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </button>
                )}
                {activeFrame < frames.length - 1 && (
                  <button
                    onClick={() => setActiveFrame(activeFrame + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center
                      opacity-70 lg:opacity-0 lg:hover:opacity-100 active:opacity-100 transition-opacity"
                  >
                    <ChevronRight className="w-5 h-5 text-white" />
                  </button>
                )}
                {/* Frame counter + score */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="text-xs text-white bg-black/60 px-2 py-1 rounded-lg">
                    {activeFrame + 1} / {frames.length}
                  </span>
                  {currentFrameAnalysis && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${scoreBgClass(currentFrameAnalysis.formScore)} ${scoreColor(currentFrameAnalysis.formScore)}`}>
                      {currentFrameAnalysis.formScore}/10
                    </span>
                  )}
                </div>
                {/* Phase badge */}
                {currentFrameAnalysis?.phase && (
                  <div className="absolute top-3 right-3">
                    <span className="text-xs text-white/90 bg-black/60 px-2 py-1 rounded-lg capitalize">
                      {currentFrameAnalysis.phase}
                    </span>
                  </div>
                )}
              </div>

              {/* Frame analysis text */}
              {currentFrameAnalysis && (
                <div className="p-4">
                  <p className="text-sm text-iron-200 leading-relaxed">{currentFrameAnalysis.assessment}</p>
                  {currentFrameAnalysis.cues?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {currentFrameAnalysis.cues.map((cue, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="text-flame-400 mt-0.5">→</span>
                          <p className="text-xs text-iron-400">{cue}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Frame timeline scrubber */}
              <div className="px-4 pb-4">
                <div className="flex gap-1">
                  {frames.map((_, i) => {
                    const fa = analysis.frames?.[i]
                    const score = fa?.formScore || 0
                    return (
                      <button
                        key={i}
                        onClick={() => setActiveFrame(i)}
                        className={`flex-1 h-2 rounded-full transition-all ${
                          i === activeFrame
                            ? scoreBgSolid(score)
                            : score > 0 ? scoreBgFaint(score) : 'bg-iron-700'
                        }`}
                        title={`Frame ${i + 1}: ${fa?.phase || ''} (${score}/10)`}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {analysis.recommendations?.length > 0 && (
            <div className="card-steel p-4">
              <h3 className="text-sm font-semibold text-iron-200 mb-3">Recommendations</h3>
              <div className="space-y-2">
                {analysis.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-flame-500/15 text-flame-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-sm text-iron-300">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={reset}
            className="btn-secondary w-full py-3 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Analyze Another Video
          </button>
        </motion.div>
      )}
    </div>
  )
}