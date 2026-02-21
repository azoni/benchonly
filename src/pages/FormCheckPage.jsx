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
  Clock,
  Eye,
  EyeOff,
  Maximize2,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { creditService } from '../services/firestore'
import { collection, query, where, orderBy, limit, getDocs, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../services/firebase'
import usePageTitle from '../utils/usePageTitle'
import { apiUrl } from '../utils/platform'
import { estimatePoses } from '../utils/poseEstimation'

const FRAME_PRESETS = {
  quick:    { frames: 5,  label: 'Quick',    desc: '5 frames',  credits: 10 },
  standard: { frames: 10, label: 'Standard', desc: '10 frames', credits: 15 },
  detailed: { frames: 20, label: 'Detailed', desc: '20 frames', credits: 25 },
}
const FRAME_WIDTH = 480
const JPEG_QUALITY = 0.5
const FORM_CHECK_PREMIUM_COST = 50

const ANALYZING_TIPS = [
  'Tip: Trim your video to start right before the first rep',
  'Tip: Film from a 45° angle for the most useful analysis',
  'Tip: Side angle works best for bench press form',
  'Tip: Keep your phone at hip height for squats and deadlifts',
  'Tip: Wear form-fitting clothes so joint positions are visible',
  'Tip: Good lighting makes a huge difference in analysis quality',
  'Tip: Shorter clips (5-15s) give the best frame coverage',
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

// ─── Camera Guide ───

const CAMERA_GUIDES = {
  'bench press':       { angle: 'Side view',        height: 'Chest height', mode: 'Landscape', tip: 'Place phone on the floor beside the bench pointing toward you — level with your chest' },
  'front squat':       { angle: 'Side view',        height: 'Hip height',   mode: 'Landscape', tip: 'Set phone on a rack safety bar or box to your right or left at hip height' },
  'squat':             { angle: 'Side view',        height: 'Hip height',   mode: 'Landscape', tip: 'Set phone on a rack safety bar or box to your right or left at hip height' },
  'romanian deadlift': { angle: 'Side view',        height: 'Hip height',   mode: 'Landscape', tip: 'Same as deadlift — side profile at hip height shows the hip hinge and back angle best' },
  'rdl':               { angle: 'Side view',        height: 'Hip height',   mode: 'Landscape', tip: 'Same as deadlift — side profile at hip height shows the hip hinge and back angle best' },
  'deadlift':          { angle: 'Side view',        height: 'Hip height',   mode: 'Landscape', tip: 'Set phone on a box or plate stack to your side — hip height gives the clearest bar path' },
  'overhead press':    { angle: 'Side view',        height: 'Hip height',   mode: 'Landscape', tip: 'Side view shows bar path and lockout position clearly' },
  'barbell row':       { angle: 'Side view',        height: 'Hip height',   mode: 'Landscape', tip: 'Side view shows your hinge angle and elbow drive path' },
  'pull-up':           { angle: 'Front view',       height: 'Chest height', mode: 'Portrait',  tip: 'Face the camera — place phone 2–3m in front on a surface at chest height' },
  'chin-up':           { angle: 'Front view',       height: 'Chest height', mode: 'Portrait',  tip: 'Face the camera — place phone 2–3m in front on a surface at chest height' },
  'hip thrust':        { angle: 'Side view',        height: 'Hip height',   mode: 'Landscape', tip: 'Side view shows lockout and bar position over hips most clearly' },
  'lunge':             { angle: 'Side view',        height: 'Hip height',   mode: 'Landscape', tip: 'Side view shows step length, knee tracking, and torso angle' },
}

function CameraGuide({ exercise }) {
  const ex = (exercise || '').toLowerCase()
  const guide = Object.entries(CAMERA_GUIDES).find(([key]) => ex.includes(key))?.[1] || {
    angle: '45° or side view', height: 'Hip height', mode: 'Landscape',
    tip: 'Side view gives the most accurate joint angle measurements — set your phone at hip height',
  }
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
      <Camera className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs font-semibold text-blue-300 mb-1">Camera Placement</p>
        <p className="text-xs text-iron-400 leading-relaxed mb-2">{guide.tip}</p>
        <div className="flex flex-wrap gap-1.5">
          {[guide.angle, guide.height, guide.mode].map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-300">{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Annotated Frame (skeleton overlay) ───

const SKELETON_CONNECTIONS = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],   ['leftElbow',  'leftWrist'],
  ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],     ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],   ['leftKnee',  'leftAnkle'],
  ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle'],
]

function AnnotatedFrame({ dataUrl, joints, metrics, exercise, show }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const cW = container.offsetWidth
    const cH = container.offsetHeight
    if (!cW || !cH) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = cW * dpr
    canvas.height = cH * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cW, cH)

    if (!show || !joints || !img?.naturalWidth) return

    // Compute letterbox rect for object-contain fitting
    const iW = img.naturalWidth
    const iH = img.naturalHeight
    const scale = Math.min(cW / iW, cH / iH)
    const rW = iW * scale
    const rH = iH * scale
    const ox = (cW - rW) / 2
    const oy = (cH - rH) / 2

    // Convert normalized landmark (0–1) to canvas pixel
    const toPx = (j) => j ? { x: j.x * rW + ox, y: j.y * rH + oy, v: j.v ?? 1 } : null

    // Draw skeleton lines
    const lw = Math.max(1.5, cW / 220)
    ctx.lineWidth = lw
    SKELETON_CONNECTIONS.forEach(([a, b]) => {
      const pa = toPx(joints[a])
      const pb = toPx(joints[b])
      if (!pa || !pb || pa.v < 0.25 || pb.v < 0.25) return
      const alpha = Math.min(0.8, (pa.v + pb.v) / 2)
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    })

    // Draw joint dots
    const dotR = Math.max(3, cW / 130)
    Object.values(joints).forEach((j) => {
      if (!j || j.v < 0.3) return
      const p = toPx(j)
      if (!p) return
      ctx.fillStyle = `rgba(251,146,60,${Math.min(0.95, j.v)})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2)
      ctx.fill()
    })

    // Draw angle labels at key joints
    if (!metrics) return
    const ex = (exercise || '').toLowerCase()
    const fontSize = Math.max(10, Math.round(cW / 42))
    ctx.font = `bold ${fontSize}px monospace`
    ctx.textBaseline = 'top'

    const elbowColor = ex.includes('bench')
      ? (a) => a >= 80 && a <= 105 ? '#4ade80' : a >= 65 && a <= 120 ? '#facc15' : '#f87171'
      : () => '#94a3b8'

    const kneeColor = (ex.includes('squat') || ex.includes('deadlift') || ex.includes('rdl'))
      ? (a) => a <= 90 ? '#4ade80' : a <= 115 ? '#facc15' : '#f87171'
      : () => '#94a3b8'

    const drawLabel = (jointName, angle, colorFn) => {
      if (!angle || !joints[jointName] || (joints[jointName]?.v ?? 0) < 0.4) return
      const p = toPx(joints[jointName])
      if (!p) return
      const label = `${angle}°`
      const color = colorFn(angle)
      const tw = ctx.measureText(label).width
      const pad = 3
      const bx = p.x + dotR + 4
      const by = p.y - fontSize / 2 - pad
      ctx.fillStyle = 'rgba(0,0,0,0.72)'
      ctx.fillRect(bx - pad, by, tw + pad * 2, fontSize + pad * 2)
      ctx.fillStyle = color
      ctx.fillText(label, bx, by + pad)
    }

    drawLabel('leftElbow',  metrics?.elbowFlexion?.left,  elbowColor)
    drawLabel('rightElbow', metrics?.elbowFlexion?.right, elbowColor)
    drawLabel('leftKnee',   metrics?.kneeAngle?.left,     kneeColor)
    drawLabel('rightKnee',  metrics?.kneeAngle?.right,    kneeColor)
    drawLabel('leftHip',    metrics?.hipAngle?.left,      () => '#94a3b8')
    drawLabel('rightHip',   metrics?.hipAngle?.right,     () => '#94a3b8')
  }, [joints, metrics, exercise, show])

  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth) draw()
  }, [draw])

  return (
    <div ref={containerRef} className="relative w-full aspect-video bg-black">
      <img
        ref={imgRef}
        src={dataUrl}
        alt="Frame"
        className="w-full h-full object-contain"
        onLoad={draw}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
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
  const listenerRef = useRef(null)

  const [step, setStep] = useState('upload')
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [frames, setFrames] = useState([])
  const [note, setNote] = useState('')
  const [exercise, setExercise] = useState('')
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
  const [poseData, setPoseData] = useState([])
  const [poseLandmarks, setPoseLandmarks] = useState([])
  const [showOverlay, setShowOverlay] = useState(true)
  const [fullscreenFrame, setFullscreenFrame] = useState(false)
  const [extractPhase, setExtractPhase] = useState('')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => { return () => { if (videoUrl) URL.revokeObjectURL(videoUrl) } }, [videoUrl])
  useEffect(() => { return () => { if (listenerRef.current) listenerRef.current() } }, [])

  // Load past form checks
  const loadHistory = useCallback(() => {
    if (!user || user.uid === 'guest') return
    setHistoryLoading(true)

    // Try the optimized query first (requires composite index)
    // Falls back to simpler query if index doesn't exist
    const q = query(
      collection(db, 'formCheckJobs'),
      where('userId', '==', user.uid),
      where('status', '==', 'complete'),
      orderBy('createdAt', 'desc'),
      limit(20)
    )
    getDocs(q).then(snap => {
      const items = []
      snap.forEach(doc => {
        const data = doc.data()
        if (data.analysis && data.analysis.overallScore > 0) {
          items.push({
            id: doc.id,
            exercise: data.analysis.exercise || 'Unknown',
            score: data.analysis.overallScore || 0,
            quality: data.quality || 'standard',
            frameCount: data.frameCount || 0,
            createdAt: data.createdAt?.toDate?.() || new Date(),
            analysis: data.analysis,
          })
        }
      })
      setHistory(items)
    }).catch(err => {
      console.warn('Form check history needs composite index, trying fallback:', err.message)
      // Fallback: simpler query without orderBy (no index needed)
      const fallbackQ = query(
        collection(db, 'formCheckJobs'),
        where('userId', '==', user.uid),
        where('status', '==', 'complete'),
        limit(20)
      )
      getDocs(fallbackQ).then(snap => {
        const items = []
        snap.forEach(doc => {
          const data = doc.data()
          if (data.analysis && data.analysis.overallScore > 0) {
            items.push({
              id: doc.id,
              exercise: data.analysis.exercise || 'Unknown',
              score: data.analysis.overallScore || 0,
              quality: data.quality || 'standard',
              frameCount: data.frameCount || 0,
              createdAt: data.createdAt?.toDate?.() || new Date(),
              analysis: data.analysis,
            })
          }
        })
        // Sort client-side since we couldn't orderBy
        items.sort((a, b) => b.createdAt - a.createdAt)
        setHistory(items)
      }).catch(err2 => {
        console.error('Failed to load form check history:', err2)
      })
    }).finally(() => setHistoryLoading(false))
  }, [user])

  useEffect(() => { loadHistory() }, [loadHistory])

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

  // ─── Frame Extraction ───

  const extractFrames = useCallback(async () => {
    if (!videoUrl) return
    const maxFrames = FRAME_PRESETS[quality].frames
    setStep('extracting')
    setExtractProgress(0)
    setError(null)

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) { setError('Could not initialize video processor.'); setStep('upload'); return }
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const seekTo = (time) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Frame seek timed out')), 10000)
      const onSeeked = () => {
        clearTimeout(timeout)
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        requestAnimationFrame(() => setTimeout(resolve, 150))
      }
      const onError = () => {
        clearTimeout(timeout)
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        reject(new Error('Video error during seek'))
      }
      video.addEventListener('seeked', onSeeked)
      video.addEventListener('error', onError)
      video.currentTime = time
    })

    // Check if a canvas frame is actually decoded (not gray/blank)
    const isRealFrame = () => {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const step = Math.max(4, Math.floor(data.length / 500)) * 4
      // Check 1: variance (gray frames have near-zero variance)
      let sum = 0, count = 0
      for (let p = 0; p < data.length; p += step) {
        sum += data[p] + data[p + 1] + data[p + 2]
        count++
      }
      const avg = sum / (count * 3)
      let variance = 0
      for (let p = 0; p < data.length; p += step) {
        const v = (data[p] + data[p + 1] + data[p + 2]) / 3 - avg
        variance += v * v
      }
      variance /= count
      // Check 2: unique color count (gray frames have very few unique values)
      const colors = new Set()
      for (let p = 0; p < data.length; p += step) {
        colors.add((data[p] >> 4) * 256 + (data[p + 1] >> 4) * 16 + (data[p + 2] >> 4))
      }
      return variance > 200 || colors.size > 20
    }

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

      // ─── Pass 1: Low-res motion scan ───
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
        setExtractProgress(Math.round(((i + 1) / scanCount) * 20))
      }

      // ─── Burst detection: find where the actual lift happens ───
      let startTime = 0, endTime = duration
      if (motionScores.length > maxFrames) {
        const sorted = [...motionScores].map(m => m.score).sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length / 2)]
        const p75 = sorted[Math.floor(sorted.length * 0.75)]
        const threshold = (median + p75) / 2

        const bursts = []
        let currentBurst = null
        for (let i = 0; i < motionScores.length; i++) {
          if (motionScores[i].score >= threshold) {
            if (!currentBurst) currentBurst = { start: i, end: i, totalScore: 0 }
            currentBurst.end = i
            currentBurst.totalScore += motionScores[i].score
          } else {
            if (currentBurst && i - currentBurst.end <= 2) {
              currentBurst.end = i
              currentBurst.totalScore += motionScores[i].score
            } else if (currentBurst) {
              bursts.push(currentBurst)
              currentBurst = null
            }
          }
        }
        if (currentBurst) bursts.push(currentBurst)

        let bestBurst = bursts.length > 0
          ? bursts.reduce((a, b) => a.totalScore > b.totalScore ? a : b)
          : null

        if (bestBurst) {
          const ws = Math.max(0, bestBurst.start - 1)
          const we = Math.min(motionScores.length - 1, bestBurst.end + 1)
          startTime = motionScores[ws].time
          endTime = motionScores[we].time
        } else {
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
      }

      // ─── Pass 2: Full-res frame capture from the detected lift window ───
      const windowDuration = endTime - startTime
      const totalFrames = Math.max(1, Math.min(maxFrames, Math.floor(windowDuration)))
      const interval = windowDuration / totalFrames

      const finalScale = Math.min(1, FRAME_WIDTH / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * finalScale)
      canvas.height = Math.round(video.videoHeight * finalScale)

      const extractedFrames = []
      for (let i = 0; i < totalFrames; i++) {
        const time = startTime + (i * interval)
        let dataUrl, base64
        let gotReal = false

        // Try up to 5 times with escalating decode waits
        for (let attempt = 0; attempt < 5; attempt++) {
          await seekTo(time + (attempt > 0 ? 0.02 * attempt : 0))
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

          if (isRealFrame()) {
            gotReal = true
            break
          }

          // Escalating wait: 100, 200, 300, 400ms
          await new Promise(r => setTimeout(r, 100 * (attempt + 1)))
          // Re-draw after waiting (frame may have decoded)
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          if (isRealFrame()) {
            gotReal = true
            break
          }
        }

        dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
        base64 = dataUrl.split(',')[1]
        extractedFrames.push({ dataUrl, base64, timestamp: time, index: i + 1 })
        setExtractProgress(20 + Math.round(((i + 1) / totalFrames) * 40))
      }
      setFrames(extractedFrames)

      // ─── Pose estimation (runs in-browser, no server cost) ───
      let poses = []
      try {
        poses = await estimatePoses(extractedFrames, (msg) => {
          setExtractPhase(msg)
          setExtractProgress(prev => Math.min(prev + Math.round(35 / extractedFrames.length), 95))
        })
      } catch (poseErr) {
        console.warn('[pose] Estimation skipped:', poseErr.message)
      }
      // Split: raw joints stay client-side for overlay, metrics go to server
      const poseMetrics = poses.map(({ joints: _, ...metrics }) => metrics)
      const landmarks = poses.map(p => p.joints || null)
      setPoseData(poseMetrics)
      setPoseLandmarks(landmarks)
      setExtractProgress(100)
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
      // Client-side credit check (server will enforce too)
      if (!isAdmin) {
        const balance = await creditService.getBalance(user.uid)
        if (balance < cost) {
          setError(`Not enough credits. You need ${cost} credits.`)
          setStep('preview'); return
        }
      }

      // Generate unique job ID
      const jobId = `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const token = await user.getIdToken()

      // Clean up any previous listener
      if (listenerRef.current) { listenerRef.current(); listenerRef.current = null }

      // Create initial job doc FIRST so onSnapshot has something to read
      // (Firestore rules need resource.data.userId to exist for read access)
      const jobRef = doc(db, 'formCheckJobs', jobId)
      await setDoc(jobRef, {
        userId: user.uid,
        status: 'pending',
        createdAt: new Date(),
      })

      // Set up listener + fetch in parallel
      let resolved = false

      // Call analyze-form — tries background, falls back to inline
      const response = await fetch(apiUrl('analyze-form'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jobId,
          frames: frames.map(f => f.base64),
          timestamps: frames.map(f => Math.round(f.timestamp * 10) / 10),
          note: note.trim() || undefined,
          exercise: exercise || undefined,
          model: isPremium ? 'premium' : 'standard',
          quality,
          poseData: poseData.length > 0 ? poseData : undefined,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to start analysis. Please try again.')
      }

      const result = await response.json()

      // If inline fallback returned the analysis directly, use it
      if (result.analysis && !result.background) {
        resolved = true
        if (listenerRef.current) { listenerRef.current(); listenerRef.current = null }
        setAnalysis(result.analysis)
        setActiveFrame(0)
        setStep('results')
        if (result.analysis.overallScore > 0) loadHistory()
        return
      }

      // Background path — wait for Firestore listener

      // Firestore listener as backup (catches errors written by server)
      const unsubscribe = onSnapshot(jobRef, (snap) => {
        if (resolved) return
        const data = snap.data()
        if (!data) return

        if (data.status === 'complete') {
          resolved = true
          unsubscribe()
          listenerRef.current = null
          setAnalysis(data.analysis)
          setActiveFrame(0)
          setStep('results')
          // Refresh history
          if (data.analysis?.overallScore > 0) loadHistory()
        } else if (data.status === 'error') {
          resolved = true
          unsubscribe()
          listenerRef.current = null
          setError(data.error || 'Analysis failed. Please try again.')
          setStep('preview')
        }
        // status === 'processing' — keep waiting
      }, (err) => {
        if (resolved) return
        resolved = true
        console.error('Firestore listener error:', err)
        unsubscribe()
        listenerRef.current = null
        setError('Lost connection to analysis. Please try again.')
        setStep('preview')
      })

      listenerRef.current = unsubscribe

      // Safety timeout — 3 min for background processing
      setTimeout(() => {
        if (resolved) return
        resolved = true
        unsubscribe()
        listenerRef.current = null
        setStep(prev => {
          if (prev === 'analyzing') {
            setError('Analysis is taking longer than expected. Please try again or use fewer frames.')
            return 'preview'
          }
          return prev
        })
      }, 180000)

    } catch (err) {
      console.error('Form analysis error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
      setStep('preview')
    }
  }, [user, frames, note, model, quality, isAdmin])

  const reset = () => {
    if (listenerRef.current) { listenerRef.current(); listenerRef.current = null }
    setStep('upload'); setVideoFile(null)
    setVideoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setFrames([]); setNote(''); setModel('standard'); setQuality('standard')
    setAnalysis(null); setError(null); setActiveFrame(0); setShowAllRecs(false)
    setPoseData([]); setPoseLandmarks([]); setExtractPhase('')
  }

  const cfa = analysis?.frames?.[activeFrame]
  const mq = analysis?.movementQuality

  // Load a past form check — analysis only (no stored frames)
  const loadHistoryItem = useCallback((item) => {
    setFrames([])
    setAnalysis(item.analysis)
    setActiveFrame(0)
    setShowAllRecs(false)
    setStep('results')
  }, [])

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
            <label className="text-sm text-iron-400 mb-1.5 block">Exercise (optional)</label>
            <select value={exercise} onChange={(e) => setExercise(e.target.value)}
              className="input-field w-full" aria-label="Exercise selection">
              <option value="">Auto-detect</option>
              <option value="Bench Press">Bench Press</option>
              <option value="Squat">Squat</option>
              <option value="Deadlift">Deadlift</option>
              <option value="Overhead Press">Overhead Press</option>
              <option value="Barbell Row">Barbell Row</option>
              <option value="Pull-up">Pull-up</option>
              <option value="Romanian Deadlift">Romanian Deadlift</option>
              <option value="Front Squat">Front Squat</option>
              <option value="Hip Thrust">Hip Thrust</option>
              <option value="Lunges">Lunges</option>
            </select>
          </div>

          <CameraGuide exercise={exercise} />

          <div>
            <label className="text-sm text-iron-400 mb-1.5 block">Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
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
              Video is processed on your device — only extracted frames are sent for AI analysis. Trim your clip to start right before your first rep for the best frame selection.
            </p>
          </div>

          <button onClick={extractFrames} disabled={!videoFile}
            className="btn-primary w-full py-3.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base">
            <Camera className="w-5 h-5" /> Extract Frames
          </button>
        </motion.div>
      )}

      {/* ━━━ HISTORY ━━━ */}
      {step === 'upload' && history.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-4">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="card-steel p-3 w-full flex items-center gap-3 hover:border-iron-600 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-iron-200">Past Form Checks</p>
              <p className="text-xs text-iron-500">{history.length} analysis{history.length !== 1 ? 'es' : ''}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-iron-500 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {historyOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="card-steel mt-1 divide-y divide-iron-800/50 max-h-72 overflow-y-auto">
                  {history.map(item => (
                    <button
                      key={item.id}
                      onClick={() => loadHistoryItem(item)}
                      className="w-full p-3 flex items-center gap-3 hover:bg-iron-800/30 transition-colors text-left"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${scoreBg(item.score)}`}>
                        <span className={`text-sm font-bold ${scoreColor(item.score)}`}>{item.score}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-iron-200 truncate">{item.exercise}</p>
                        <p className="text-[11px] text-iron-500">
                          {item.createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {item.frameCount} frames · {item.quality}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-iron-600 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
            {extractProgress <= 20 ? 'Scanning for the actual lift...' : extractProgress <= 60 ? 'Extracting key frames...' : 'Mapping movement...'}
          </p>
          <p className="text-xs text-iron-500 mb-4">
            {extractProgress <= 20 ? 'Detecting when the lift starts'
              : extractProgress <= 60 ? `Capturing ${FRAME_PRESETS[quality].frames} frames`
              : extractPhase || 'Running pose estimation on each frame'}
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
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-iron-200">{frames.length} frames captured</h3>
                {poseData.length > 0 && (() => {
                  const detected = poseData.filter(p => p.poseDetected).length
                  return detected > 0 ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      Movement mapped
                    </span>
                  ) : null
                })()}
              </div>
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
            <p className="text-xs text-iron-500 mb-4">{model === 'premium' ? 'GPT-4o' : 'GPT-4o mini'} is reviewing each frame</p>
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

              <div className="relative"
                onTouchStart={(e) => { e.currentTarget.dataset.touchX = e.touches[0].clientX }}
                onTouchEnd={(e) => {
                  const dx = e.changedTouches[0].clientX - Number(e.currentTarget.dataset.touchX || 0)
                  if (dx > 50 && activeFrame > 0) setActiveFrame(activeFrame - 1)
                  if (dx < -50 && activeFrame < frames.length - 1) setActiveFrame(activeFrame + 1)
                }}>
                <AnnotatedFrame
                  dataUrl={frames[activeFrame]?.dataUrl}
                  joints={poseLandmarks[activeFrame] || null}
                  metrics={poseData[activeFrame] || null}
                  exercise={analysis.exercise}
                  show={showOverlay}
                />

                {/* Score badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  {cfa && (Number(cfa.formScore) > 0
                    ? <span className={`text-xs font-bold px-2 py-1 rounded-lg backdrop-blur-sm ${scoreBg(Number(cfa.formScore))} ${scoreColor(Number(cfa.formScore))}`}>{cfa.formScore}/10</span>
                    : <span className="text-xs font-medium px-2 py-1 rounded-lg backdrop-blur-sm bg-iron-700/80 text-iron-400">Not scored</span>
                  )}
                  {cfa?.phase && <PhasePill phase={cfa.phase} />}
                </div>

                {/* Overlay toggle — only shown when pose data exists */}
                {poseLandmarks.some(l => l !== null) && (
                  <button
                    onClick={() => setShowOverlay(v => !v)}
                    className="absolute top-3 right-12 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors"
                    title={showOverlay ? 'Hide skeleton overlay' : 'Show skeleton overlay'}
                  >
                    {showOverlay
                      ? <Eye className="w-4 h-4 text-white/80" />
                      : <EyeOff className="w-4 h-4 text-white/40" />}
                  </button>
                )}

                {/* Fullscreen expand */}
                <button
                  onClick={() => setFullscreenFrame(true)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-4 h-4 text-white/80" />
                </button>
              </div>

              {/* Navigation bar */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-iron-900/80 border-t border-iron-800/50">
                <button onClick={() => setActiveFrame(Math.max(0, activeFrame - 1))}
                  disabled={activeFrame === 0} aria-label="Previous frame"
                  className="w-10 h-10 rounded-xl bg-iron-800 border border-iron-700 flex items-center justify-center transition-colors hover:bg-iron-700 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft className="w-5 h-5 text-iron-200" />
                </button>

                <div className="flex-1 flex items-center gap-1 overflow-x-auto px-1">
                  {frames.map((_, i) => {
                    const fa = analysis.frames?.[i]
                    const sc = Number(fa?.formScore) || 0
                    return (
                      <button key={i} onClick={() => setActiveFrame(i)} aria-label={`Frame ${i + 1}`}
                        className={`flex-1 min-w-[12px] rounded-full transition-all ${i === activeFrame ? `h-3 ${sc > 0 ? scoreBgSolid(sc) : 'bg-iron-400'} shadow-sm ring-1 ring-white/20` : `h-2 ${sc > 0 ? scoreBgFaint(sc) : 'bg-iron-700/50'} hover:h-2.5`}`}
                        title={`Frame ${i + 1}: ${fa?.phase || ''} ${sc > 0 ? `(${sc}/10)` : '(not scored)'}`} />
                    )
                  })}
                </div>

                <button onClick={() => setActiveFrame(Math.min(frames.length - 1, activeFrame + 1))}
                  disabled={activeFrame === frames.length - 1} aria-label="Next frame"
                  className="w-10 h-10 rounded-xl bg-iron-800 border border-iron-700 flex items-center justify-center transition-colors hover:bg-iron-700 disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight className="w-5 h-5 text-iron-200" />
                </button>

                <span className="text-xs text-iron-500 font-mono w-10 text-center flex-shrink-0">{activeFrame + 1}/{frames.length}</span>
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
            </motion.div>
          )}

          {/* Fullscreen frame modal */}
          <AnimatePresence>
            {fullscreenFrame && frames.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black flex flex-col"
                onTouchStart={(e) => { e.currentTarget.dataset.touchX = e.touches[0].clientX }}
                onTouchEnd={(e) => {
                  const dx = e.changedTouches[0].clientX - Number(e.currentTarget.dataset.touchX || 0)
                  if (dx > 50 && activeFrame > 0) setActiveFrame(activeFrame - 1)
                  if (dx < -50 && activeFrame < frames.length - 1) setActiveFrame(activeFrame + 1)
                }}
              >
                {/* Top bar */}
                <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    {(() => { const cfa2 = analysis.frames?.[activeFrame]; const sc = Number(cfa2?.formScore) || 0; return sc > 0
                      ? <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${scoreBg(sc)} ${scoreColor(sc)}`}>{sc}/10</span>
                      : <span className="text-sm font-medium px-2.5 py-1 rounded-lg bg-iron-800 text-iron-400">Not scored</span>
                    })()}
                    {(() => { const cfa2 = analysis.frames?.[activeFrame]; return cfa2?.phase && <PhasePill phase={cfa2.phase} /> })()}
                    <span className="text-xs text-iron-500 font-mono ml-1">{activeFrame + 1}/{frames.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {poseLandmarks.some(l => l !== null) && (
                      <button onClick={() => setShowOverlay(v => !v)} className="p-2 rounded-lg bg-iron-800 hover:bg-iron-700 transition-colors">
                        {showOverlay ? <Eye className="w-4 h-4 text-white/80" /> : <EyeOff className="w-4 h-4 text-white/40" />}
                      </button>
                    )}
                    <button onClick={() => setFullscreenFrame(false)} className="p-2 rounded-lg bg-iron-800 hover:bg-iron-700 transition-colors">
                      <X className="w-4 h-4 text-white/80" />
                    </button>
                  </div>
                </div>

                {/* Frame — fills remaining space */}
                <div className="flex-1 min-h-0">
                  <AnnotatedFrame
                    dataUrl={frames[activeFrame]?.dataUrl}
                    joints={poseLandmarks[activeFrame] || null}
                    metrics={poseData[activeFrame] || null}
                    exercise={analysis.exercise}
                    show={showOverlay}
                  />
                </div>

                {/* Assessment text */}
                {(() => {
                  const cfa2 = analysis.frames?.[activeFrame]
                  if (!cfa2) return null
                  return (
                    <div className="flex-shrink-0 px-4 pt-3 pb-4 max-h-40 overflow-y-auto">
                      <p className="text-sm text-iron-200 leading-relaxed">{cfa2.assessment}</p>
                      {cfa2.cues?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {cfa2.cues.map((cue, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <ArrowRight className="w-3 h-3 text-flame-400 mt-0.5 flex-shrink-0" />
                              <p className="text-xs text-iron-400 leading-relaxed">{cue}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Frame nav dots */}
                <div className="flex-shrink-0 flex items-center gap-2 px-4 pb-6">
                  <button onClick={() => setActiveFrame(Math.max(0, activeFrame - 1))}
                    disabled={activeFrame === 0}
                    className="w-10 h-10 rounded-xl bg-iron-800 flex items-center justify-center disabled:opacity-30">
                    <ChevronLeft className="w-5 h-5 text-iron-200" />
                  </button>
                  <div className="flex-1 flex items-center gap-1">
                    {frames.map((_, i) => {
                      const fa = analysis.frames?.[i]
                      const sc = Number(fa?.formScore) || 0
                      return (
                        <button key={i} onClick={() => setActiveFrame(i)}
                          className={`flex-1 min-w-[12px] rounded-full transition-all ${i === activeFrame ? `h-3 ${sc > 0 ? scoreBgSolid(sc) : 'bg-iron-400'} ring-1 ring-white/20` : `h-2 ${sc > 0 ? scoreBgFaint(sc) : 'bg-iron-700/50'}`}`} />
                      )
                    })}
                  </div>
                  <button onClick={() => setActiveFrame(Math.min(frames.length - 1, activeFrame + 1))}
                    disabled={activeFrame === frames.length - 1}
                    className="w-10 h-10 rounded-xl bg-iron-800 flex items-center justify-center disabled:opacity-30">
                    <ChevronRight className="w-5 h-5 text-iron-200" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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