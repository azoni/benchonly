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
  Shield,
  Target,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { creditService } from '../services/firestore'
import usePageTitle from '../utils/usePageTitle'
import { apiUrl } from '../utils/platform'

const FRAME_PRESETS = {
  quick:    { frames: 5,  label: 'Quick',    desc: '5 frames',  credits: 10 },
  standard: { frames: 10, label: 'Standard', desc: '10 frames', credits: 15 },
  detailed: { frames: 20, label: 'Detailed', desc: '20 frames', credits: 25 },
}
const FRAME_WIDTH = 480
const JPEG_QUALITY = 0.5
const FORM_CHECK_PREMIUM_COST = 50

const ANALYZING_TIPS = [
  'Tip: Film from a 45° angle for the most useful analysis',
  'Tip: Keep your phone at hip height for squats and deadlifts',
  'Tip: Side angle works best for bench press form',
  'Tip: Wear form-fitting clothes so joint positions are visible',
  'Tip: Good lighting makes a huge difference in analysis quality',
  'Tip: Film entire reps — setup through lockout',
]

// ─── Score Utilities ───

function scoreColor(score) {
  if (score >= 8) return 'text-green-400'
  if (score >= 6) return 'text-yellow-400'
  if (score >= 4) return 'text-orange-400'
  return 'text-red-400'
}

function scoreBg(score) {
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

function scoreLabel(score) {
  if (score >= 9) return 'Excellent'
  if (score >= 8) return 'Great'
  if (score >= 7) return 'Good'
  if (score >= 6) return 'Decent'
  if (score >= 5) return 'Needs Work'
  if (score >= 4) return 'Poor'
  if (score >= 2) return 'Dangerous'
  return 'N/A'
}

function severityColor(sev) {
  if (sev === 'high') return 'text-red-400 bg-red-500/15 border-red-500/30'
  if (sev === 'medium') return 'text-orange-400 bg-orange-500/15 border-orange-500/30'
  return 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30'
}

function severityIcon(sev) {
  if (sev === 'high') return '🔴'
  if (sev === 'medium') return '🟡'
  return '🟢'
}

// ─── Score Arc ───

function ScoreArc({ score, size = 100 }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(score / 10, 1))
  const color = score >= 8 ? '#4ade80' : score >= 6 ? '#facc15' : score >= 4 ? '#fb923c' : '#f87171'

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <motion.circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className={`text-3xl font-bold font-display ${scoreColor(score)}`}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          {score}
        </motion.span>
        <span className="text-[10px] text-iron-500 uppercase tracking-wider">{scoreLabel(score)}</span>
      </div>
    </div>
  )
}

// ─── Quality Bar ───

function QualityBar({ label, score, note }) {
  const [open, setOpen] = useState(false)
  const color = score >= 8 ? 'bg-green-500' : score >= 6 ? 'bg-yellow-500' : score >= 4 ? 'bg-orange-500' : 'bg-red-500'

  return (
    <div>
      <button onClick={() => note && setOpen(!open)} className="w-full flex items-center gap-3">
        <span className="text-xs text-iron-400 w-16 text-right flex-shrink-0">{label}</span>
        <div className="flex-1 h-2 bg-iron-800 rounded-full overflow-hidden">
          <motion.div className={`h-full rounded-full ${color}`}
            initial={{ width: 0 }}
            animate={{ width: `${(score / 10) * 100}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
          />
        </div>
        <span className={`text-xs font-semibold w-6 text-right ${scoreColor(score)}`}>{score}</span>
      </button>
      <AnimatePresence>
        {open && note && (
          <motion.p
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="text-[11px] text-iron-500 ml-[76px] mt-1 overflow-hidden"
          >{note}</motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Phase Pill ───

function PhasePill({ phase }) {
  const c = {
    setup: 'bg-blue-500/20 text-blue-400', descent: 'bg-purple-500/20 text-purple-400',
    bottom: 'bg-red-500/20 text-red-400', ascent: 'bg-amber-500/20 text-amber-400',
    lockout: 'bg-green-500/20 text-green-400', transition: 'bg-iron-700/50 text-iron-400',
    rest: 'bg-iron-700/50 text-iron-500',
  }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${c[phase] || c.transition}`}>
      {phase}
    </span>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function FormCheckPage() {
  usePageTitle('Form Check')
  const { user, isAppAdmin } = useAuth()
  const isAdmin = isAppAdmin
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const videoPreviewRef = useRef(null)

  const [step, setStep] = useState('upload')
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [frames, setFrames] = useState([])
  const [note, setNote] = useState('')
  const [model, setModel] = useState('standard')
  const [quality, setQuality] = useState('standard')
  const [extractProgress, setExtractProgress] = useState(0)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState(null)
  const [activeFrame, setActiveFrame] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [analyzingTip, setAnalyzingTip] = useState(0)
  const [showAllRecs, setShowAllRecs] = useState(false)

  useEffect(() => { return () => { if (videoUrl) URL.revokeObjectURL(videoUrl) } }, [videoUrl])

  // Keyboard nav for frames
  useEffect(() => {
    if (step !== 'results') return
    const h = (e) => {
      if (e.key === 'ArrowLeft' && activeFrame > 0) setActiveFrame(a => a - 1)
      if (e.key === 'ArrowRight' && activeFrame < frames.length - 1) setActiveFrame(a => a + 1)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [step, activeFrame, frames.length])

  // Rotate analyzing tips
  useEffect(() => {
    if (step !== 'analyzing') return
    const iv = setInterval(() => setAnalyzingTip(t => (t + 1) % ANALYZING_TIPS.length), 4000)
    return () => clearInterval(iv)
  }, [step])

  // ─── File Handling ───

  const processFile = useCallback((file) => {
    if (!file) return
    if (!file.type.startsWith('video/')) { setError('Please select a video file.'); return }
    if (file.size > 100 * 1024 * 1024) { setError('Video must be under 100MB.'); return }
    setError(null)
    setVideoFile(file)
    setVideoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
  }, [])

  const handleFileSelect = useCallback((e) => processFile(e.target.files?.[0]), [processFile])

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragOver(false); processFile(e.dataTransfer.files?.[0])
  }, [processFile])

  const toggleVideoPreview = useCallback(() => {
    const v = videoPreviewRef.current
    if (!v) return
    if (v.paused) { v.play(); setIsVideoPlaying(true) }
    else { v.pause(); setIsVideoPlaying(false) }
  }, [])

  // ─── Frame Extraction (unchanged logic) ───

  const extractFrames = useCallback(async () => {
    if (!videoUrl) return
    const maxFrames = FRAME_PRESETS[quality].frames
    setStep('extracting')
    setExtractProgress(0)
    setError(null)

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) { setError('Could not initialize video processor.'); setStep('upload'); return }
    const ctx = canvas.getContext('2d')

    const seekTo = (time) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Frame seek timed out')), 5000)
      video.onseeked = () => { clearTimeout(timeout); resolve() }
      video.onerror = () => { clearTimeout(timeout); reject(new Error('Video error during seek')) }
      video.currentTime = time
    })

    try {
      video.src = videoUrl
      await new Promise((resolve, reject) => {
        if (video.readyState >= 1) resolve()
        else { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Could not load video')) }
      })

      const duration = video.duration
      if (!duration || duration <= 0 || !isFinite(duration)) {
        setError('Could not read video duration. Try a different file.'); setStep('upload'); return
      }

      // Motion scan
      const SCAN_WIDTH = 160
      const scanScale = Math.min(1, SCAN_WIDTH / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scanScale)
      canvas.height = Math.round(video.videoHeight * scanScale)
      const scanCount = Math.max(2, Math.min(30, Math.floor(duration * 2)))
      const scanInterval = duration / scanCount
      const motionScores = []
      let prevData = null

      for (let i = 0; i < scanCount; i++) {
        const time = i * scanInterval
        await seekTo(time)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        if (prevData) {
          let diff = 0
          for (let p = 0; p < imgData.length; p += 16) {
            diff += Math.abs(imgData[p] - prevData[p])
              + Math.abs(imgData[p + 1] - prevData[p + 1])
              + Math.abs(imgData[p + 2] - prevData[p + 2])
          }
          motionScores.push({ time, score: diff })
        }
        prevData = new Uint8Array(imgData)
        setExtractProgress(Math.round(((i + 1) / scanCount) * 30))
      }

      let startTime = 0, endTime = duration
      if (motionScores.length > maxFrames) {
        const windowSize = Math.min(maxFrames, motionScores.length)
        let bestSum = 0, bestStart = 0
        for (let i = 0; i <= motionScores.length - windowSize; i++) {
          let sum = 0
          for (let j = i; j < i + windowSize; j++) sum += motionScores[j].score
          if (sum > bestSum) { bestSum = sum; bestStart = i }
        }
        const ws = Math.max(0, bestStart - 1)
        const we = Math.min(motionScores.length - 1, bestStart + windowSize)
        startTime = motionScores[ws].time
        endTime = motionScores[we].time
      }

      const windowDuration = endTime - startTime
      const totalFrames = Math.max(1, Math.min(maxFrames, Math.floor(windowDuration)))
      const interval = windowDuration / totalFrames

      const finalScale = Math.min(1, FRAME_WIDTH / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * finalScale)
      canvas.height = Math.round(video.videoHeight * finalScale)

      const extractedFrames = []
      for (let i = 0; i < totalFrames; i++) {
        const time = startTime + (i * interval)
        await seekTo(time)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
        const base64 = dataUrl.split(',')[1]
        extractedFrames.push({ dataUrl, base64, timestamp: time, index: i + 1 })
        setExtractProgress(30 + Math.round(((i + 1) / totalFrames) * 70))
      }
      setFrames(extractedFrames)
      setStep('preview')
    } catch (err) {
      console.error('Frame extraction error:', err)
      setError(err.message || 'Could not extract frames. Try a different file.')
      setStep('upload')
    }
  }, [videoUrl, quality])

  // ─── Analysis ───

  const analyzeForm = useCallback(async () => {
    if (!user || frames.length === 0) return
    setStep('analyzing')
    setError(null)
    setAnalyzingTip(Math.floor(Math.random() * ANALYZING_TIPS.length))

    const isPremium = model === 'premium'
    const cost = isPremium ? FORM_CHECK_PREMIUM_COST : FRAME_PRESETS[quality].credits

    try {
      if (!isAdmin) {
        const balance = await creditService.getBalance(user.uid)
        if (balance < cost) {
          setError(`Not enough credits. You need ${cost} credits.`)
          setStep('preview'); return
        }
      }

      const token = await user.getIdToken()
      const response = await fetch(apiUrl('analyze-form'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          frames: frames.map(f => f.base64),
          note: note.trim() || undefined,
          model: isPremium ? 'premium' : 'standard',
          quality,
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
      setStep('preview')
    }
  }, [user, frames, note, model, quality, isAdmin])

  const reset = () => {
    setStep('upload'); setVideoFile(null)
    setVideoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setFrames([]); setNote(''); setModel('standard'); setQuality('standard')
    setAnalysis(null); setError(null); setActiveFrame(0); setShowAllRecs(false)
  }

  const cfa = analysis?.frames?.[activeFrame]
  const mq = analysis?.movementQuality

  // ━━━ RENDER ━━━

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
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 uppercase">Beta</span>
          </h1>
          {step !== 'results' && (
            <p className="text-sm text-iron-500 mt-1">Upload a video for AI-powered frame-by-frame form analysis</p>
          )}
        </div>
      </div>

      <video ref={videoRef} className="hidden" muted playsInline preload="metadata" />
      <canvas ref={canvasRef} className="hidden" />

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ━━━ UPLOAD ━━━ */}
      {step === 'upload' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div
            onClick={() => !videoFile && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`relative rounded-2xl overflow-hidden transition-all duration-200 ${
              isDragOver ? 'ring-2 ring-flame-500 bg-flame-500/5'
                : videoFile ? 'bg-black' : 'card-steel border-2 border-dashed border-iron-700 hover:border-flame-500/40 cursor-pointer'
            }`}
          >
            {videoFile && videoUrl ? (
              <div className="relative">
                <video ref={videoPreviewRef} src={videoUrl} className="w-full aspect-video object-contain bg-black" playsInline loop muted onEnded={() => setIsVideoPlaying(false)} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <button onClick={(e) => { e.stopPropagation(); toggleVideoPreview() }}
                    className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors">
                    {isVideoPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white ml-0.5" />}
                  </button>
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white font-medium truncate max-w-[200px]">{videoFile.name}</p>
                      <p className="text-xs text-iron-400">{(videoFile.size / (1024 * 1024)).toFixed(1)}MB</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                      className="text-xs text-flame-400 hover:text-flame-300 font-medium">Change</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-iron-800/80 flex items-center justify-center mx-auto mb-4">
                  <Upload className={`w-7 h-7 transition-colors ${isDragOver ? 'text-flame-400' : 'text-iron-500'}`} />
                </div>
                <p className="text-iron-200 font-medium mb-1">Drop a video here or tap to upload</p>
                <p className="text-xs text-iron-500">MP4, MOV, WEBM up to 100MB</p>
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" aria-label="Upload video" />

          <div>
            <label className="text-sm text-iron-400 mb-1.5 block">Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., checking squat depth, elbow pain on bench..."
              className="input-field w-full" aria-label="Analysis note" />
          </div>

          <div>
            <label className="block text-sm text-iron-400 mb-2">Analysis Depth</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(FRAME_PRESETS).map(([key, preset]) => (
                <button key={key} onClick={() => setQuality(key)}
                  className={`relative px-3 py-3 rounded-xl border transition-all text-center ${
                    quality === key ? 'border-flame-500 bg-flame-500/10 shadow-glow' : 'border-iron-700 hover:border-iron-600 bg-iron-900/50'
                  }`}>
                  {key === 'standard' && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-flame-500 text-white uppercase">Popular</span>
                  )}
                  <div className={`text-sm font-semibold ${quality === key ? 'text-flame-400' : 'text-iron-300'}`}>{preset.label}</div>
                  <div className="text-[11px] text-iron-500 mt-0.5">{preset.desc}</div>
                  <div className={`text-xs font-semibold mt-1 ${quality === key ? 'text-flame-400' : 'text-iron-400'}`}>{preset.credits} credits</div>
                </button>
              ))}
            </div>
          </div>

          {isAdmin && (
            <div>
              <label className="block text-sm text-iron-400 mb-2">AI Model</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setModel('standard')}
                  className={`px-3 py-2 text-xs rounded-xl border transition-colors text-center ${model === 'standard' ? 'border-flame-500 bg-flame-500/10 text-flame-400' : 'border-iron-700 text-iron-400 hover:border-iron-600'}`}>
                  <div className="font-medium flex items-center justify-center gap-1"><Zap className="w-3 h-3" />Standard</div>
                </button>
                <button onClick={() => setModel('premium')}
                  className={`px-3 py-2 text-xs rounded-xl border transition-colors text-center ${model === 'premium' ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-iron-700 text-iron-400 hover:border-iron-600'}`}>
                  <div className="font-medium flex items-center justify-center gap-1"><Sparkles className="w-3 h-3" />Premium</div>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5 p-3 bg-iron-800/40 rounded-xl">
            <Info className="w-4 h-4 text-iron-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-iron-500 leading-relaxed">
              Video is processed on your device — only extracted frames are sent. We auto-detect when the exercise starts. Best with a side or 45° angle.
            </p>
          </div>

          <button onClick={extractFrames} disabled={!videoFile}
            className="btn-primary w-full py-3.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base">
            <Camera className="w-5 h-5" /> Extract Frames
          </button>
        </motion.div>
      )}

      {/* ━━━ EXTRACTING ━━━ */}
      {step === 'extracting' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card-steel p-8 text-center">
          <div className="relative w-16 h-16 mx-auto mb-5">
            <div className="absolute inset-0 rounded-2xl bg-flame-500/20 animate-ping" />
            <div className="relative w-16 h-16 rounded-2xl bg-flame-500/10 flex items-center justify-center">
              <Camera className="w-7 h-7 text-flame-400" />
            </div>
          </div>
          <p className="text-iron-200 font-semibold mb-1">
            {extractProgress <= 30 ? 'Scanning for movement...' : 'Extracting key frames...'}
          </p>
          <p className="text-xs text-iron-500 mb-4">
            {extractProgress <= 30 ? 'Detecting when the exercise starts' : `Capturing ${FRAME_PRESETS[quality].frames} frames`}
          </p>
          <div className="w-56 h-2.5 bg-iron-800 rounded-full mx-auto overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-flame-500 to-flame-400 rounded-full"
              animate={{ width: `${extractProgress}%` }} transition={{ duration: 0.3 }} />
          </div>
          <p className="text-xs text-iron-600 mt-2">{extractProgress}%</p>
        </motion.div>
      )}

      {/* ━━━ PREVIEW ━━━ */}
      {step === 'preview' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="card-steel p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-iron-200">{frames.length} frames captured</h3>
              <span className="text-[11px] text-iron-500">
                {frames.length > 0 && `${frames[0].timestamp.toFixed(1)}s – ${frames[frames.length-1].timestamp.toFixed(1)}s`}
              </span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
              {frames.map((frame, i) => (
                <div key={i} className="relative flex-shrink-0 w-20 aspect-video rounded-lg overflow-hidden bg-iron-800 ring-1 ring-iron-700/50">
                  <img src={frame.dataUrl} alt={`Frame ${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0.5 right-1 text-[9px] text-white/80 bg-black/60 px-1 rounded">{frame.timestamp.toFixed(1)}s</span>
                  <span className="absolute top-0.5 left-1 text-[9px] text-white/60 font-semibold">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {note && (
            <div className="card-steel p-3 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-iron-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-iron-500 uppercase tracking-wider mb-0.5">Note</p>
                <p className="text-sm text-iron-300">{note}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={reset} className="btn-secondary flex-1 py-3">Start Over</button>
            <button onClick={analyzeForm} className="btn-primary flex-1 py-3 flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" />
              Analyze ({model === 'premium' ? FORM_CHECK_PREMIUM_COST : FRAME_PRESETS[quality].credits} credits)
            </button>
          </div>
        </motion.div>
      )}

      {/* ━━━ ANALYZING ━━━ */}
      {step === 'analyzing' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="card-steel p-6">
            <div className="flex items-center gap-5">
              <div className="w-[100px] h-[100px] rounded-full bg-iron-800 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="h-5 w-40 bg-iron-800 rounded animate-pulse" />
                <div className="h-3 w-full bg-iron-800/60 rounded animate-pulse" />
                <div className="h-3 w-3/4 bg-iron-800/60 rounded animate-pulse" />
              </div>
            </div>
          </div>
          <div className="card-steel p-5 text-center">
            <Loader2 className="w-8 h-8 text-flame-400 animate-spin mx-auto mb-3" />
            <p className="text-iron-200 font-semibold mb-1">Analyzing your form...</p>
            <p className="text-xs text-iron-500 mb-4">GPT-4o is reviewing each frame</p>
            <AnimatePresence mode="wait">
              <motion.p key={analyzingTip}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="text-xs text-iron-600 italic">{ANALYZING_TIPS[analyzingTip]}</motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* ━━━ RESULTS ━━━ */}
      {step === 'results' && analysis && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

          {/* Score + Exercise */}
          <motion.div className="card-steel p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-center gap-5">
              <ScoreArc score={analysis.overallScore} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-display text-iron-100">{analysis.exercise || 'Exercise'}</h2>
                  {analysis.variation && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-iron-800 text-iron-400 border border-iron-700">{analysis.variation}</span>
                  )}
                </div>
                {analysis.repsDetected > 0 && (
                  <p className="text-xs text-iron-500 mt-0.5">{analysis.repsDetected} rep{analysis.repsDetected !== 1 ? 's' : ''} detected</p>
                )}
                <p className="text-sm text-iron-400 mt-2 leading-relaxed">{analysis.overallSummary}</p>
              </div>
            </div>
          </motion.div>

          {/* Movement Quality */}
          {mq && (
            <motion.div className="card-steel p-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h3 className="text-xs font-semibold text-iron-400 uppercase tracking-wider mb-3">Movement Quality</h3>
              <div className="space-y-2.5">
                {mq.stability && <QualityBar label="Stability" score={mq.stability.score} note={mq.stability.note} />}
                {mq.rangeOfMotion && <QualityBar label="ROM" score={mq.rangeOfMotion.score} note={mq.rangeOfMotion.note} />}
                {mq.control && <QualityBar label="Control" score={mq.control.score} note={mq.control.note} />}
                {mq.alignment && <QualityBar label="Alignment" score={mq.alignment.score} note={mq.alignment.note} />}
              </div>
            </motion.div>
          )}

          {/* Strengths & Issues */}
          <motion.div className="grid grid-cols-2 gap-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            {analysis.keyStrengths?.length > 0 && (
              <div className="card-steel p-4">
                <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Strengths
                </h3>
                <div className="space-y-2">
                  {analysis.keyStrengths.map((s, i) => <p key={i} className="text-xs text-iron-400 leading-relaxed">{s}</p>)}
                </div>
              </div>
            )}
            {analysis.keyIssues?.length > 0 && (
              <div className="card-steel p-4">
                <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> Issues
                </h3>
                <div className="space-y-2">
                  {analysis.keyIssues.map((s, i) => <p key={i} className="text-xs text-iron-400 leading-relaxed">{s}</p>)}
                </div>
              </div>
            )}
          </motion.div>

          {/* Injury Risks */}
          {analysis.injuryRisks?.length > 0 && (
            <motion.div className="card-steel p-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              <h3 className="text-xs font-semibold text-iron-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Injury Risk Areas
              </h3>
              <div className="space-y-2.5">
                {analysis.injuryRisks.map((risk, i) => (
                  <div key={i} className={`p-3 rounded-xl border ${severityColor(risk.severity)}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{severityIcon(risk.severity)}</span>
                      <span className="text-xs font-semibold">{risk.area}</span>
                      <span className="text-[9px] uppercase tracking-wider opacity-70 ml-auto">{risk.severity}</span>
                    </div>
                    <p className="text-[11px] opacity-80 leading-relaxed">{risk.description}</p>
                    {risk.fix && <p className="text-[11px] mt-1.5 opacity-90"><span className="font-semibold">Fix:</span> {risk.fix}</p>}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Frame-by-Frame */}
          {frames.length > 0 && analysis.frames?.length > 0 && (
            <motion.div className="card-steel overflow-hidden" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <h3 className="text-xs font-semibold text-iron-400 uppercase tracking-wider px-4 pt-4 pb-2">Frame-by-Frame</h3>

              <div className="relative bg-black"
                onTouchStart={(e) => { e.currentTarget.dataset.touchX = e.touches[0].clientX }}
                onTouchEnd={(e) => {
                  const dx = e.changedTouches[0].clientX - Number(e.currentTarget.dataset.touchX || 0)
                  if (dx > 50 && activeFrame > 0) setActiveFrame(activeFrame - 1)
                  if (dx < -50 && activeFrame < frames.length - 1) setActiveFrame(activeFrame + 1)
                }}>
                <AnimatePresence mode="wait">
                  <motion.img key={activeFrame} src={frames[activeFrame]?.dataUrl} alt={`Frame ${activeFrame + 1}`}
                    className="w-full aspect-video object-contain"
                    initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} />
                </AnimatePresence>

                {activeFrame > 0 && (
                  <button onClick={() => setActiveFrame(activeFrame - 1)} aria-label="Previous frame"
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-80 lg:opacity-0 lg:hover:opacity-100 transition-opacity">
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </button>
                )}
                {activeFrame < frames.length - 1 && (
                  <button onClick={() => setActiveFrame(activeFrame + 1)} aria-label="Next frame"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-80 lg:opacity-0 lg:hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-5 h-5 text-white" />
                  </button>
                )}

                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="text-xs text-white bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg font-medium">{activeFrame + 1}/{frames.length}</span>
                  {cfa && <span className={`text-xs font-bold px-2 py-1 rounded-lg backdrop-blur-sm ${scoreBg(cfa.formScore)} ${scoreColor(cfa.formScore)}`}>{cfa.formScore}/10</span>}
                </div>
                {cfa?.phase && <div className="absolute top-3 right-3"><PhasePill phase={cfa.phase} /></div>}
              </div>

              {cfa && (
                <div className="p-4 border-t border-iron-800/50">
                  <p className="text-sm text-iron-200 leading-relaxed">{cfa.assessment}</p>
                  {cfa.cues?.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      {cfa.cues.map((cue, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <ArrowRight className="w-3 h-3 text-flame-400 mt-1 flex-shrink-0" />
                          <p className="text-xs text-iron-400 leading-relaxed">{cue}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="px-4 pb-4">
                <div className="flex gap-1">
                  {frames.map((_, i) => {
                    const fa = analysis.frames?.[i]
                    const sc = fa?.formScore || 0
                    return (
                      <button key={i} onClick={() => setActiveFrame(i)} aria-label={`Frame ${i + 1}`}
                        className={`flex-1 rounded-full transition-all ${i === activeFrame ? `h-3 ${scoreBgSolid(sc)} shadow-sm` : `h-2 ${sc > 0 ? scoreBgFaint(sc) : 'bg-iron-700'} hover:h-2.5`}`}
                        title={`Frame ${i + 1}: ${fa?.phase || ''} (${sc}/10)`} />
                    )
                  })}
                </div>
                <p className="text-center text-[10px] text-iron-600 mt-2">← → arrow keys to navigate · swipe on mobile</p>
              </div>
            </motion.div>
          )}

          {/* Focus Drill */}
          {analysis.focusDrill && (
            <motion.div className="relative overflow-hidden rounded-2xl border border-flame-500/20"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <div className="absolute inset-0 bg-gradient-to-br from-flame-500/10 via-transparent to-transparent" />
              <div className="relative p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-flame-400" />
                  <h3 className="text-sm font-semibold text-flame-400">Focus Next Session</h3>
                </div>
                <p className="text-sm font-semibold text-iron-100 mb-1">{analysis.focusDrill.title}</p>
                <p className="text-xs text-iron-400 leading-relaxed mb-3">{analysis.focusDrill.description}</p>
                {analysis.focusDrill.cue && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-flame-500/15 rounded-lg border border-flame-500/20">
                    <span className="text-xs text-iron-500">Cue:</span>
                    <span className="text-sm font-semibold text-flame-300">"{analysis.focusDrill.cue}"</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Recommendations */}
          {analysis.recommendations?.length > 0 && (
            <motion.div className="card-steel p-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
              <h3 className="text-xs font-semibold text-iron-400 uppercase tracking-wider mb-3">Recommendations</h3>
              <div className="space-y-2.5">
                {(showAllRecs ? analysis.recommendations : analysis.recommendations.slice(0, 3)).map((rec, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold ${i === 0 ? 'bg-flame-500/20 text-flame-400' : 'bg-iron-800 text-iron-500'}`}>{i + 1}</span>
                    <p className="text-sm text-iron-300 leading-relaxed">{rec}</p>
                  </div>
                ))}
              </div>
              {analysis.recommendations.length > 3 && (
                <button onClick={() => setShowAllRecs(!showAllRecs)}
                  className="mt-3 text-xs text-iron-500 hover:text-iron-300 flex items-center gap-1 transition-colors">
                  {showAllRecs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showAllRecs ? 'Show less' : `Show ${analysis.recommendations.length - 3} more`}
                </button>
              )}
            </motion.div>
          )}

          <button onClick={reset} className="btn-secondary w-full py-3 flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4" /> Analyze Another Video
          </button>
        </motion.div>
      )}
    </div>
  )
}
