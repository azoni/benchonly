// MediaPipe Pose Estimation — runs in-browser via WASM, no server cost
// Extracts 33 body keypoints per frame for biomechanical analysis

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

// MediaPipe landmark indices
const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,    RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,    RIGHT_WRIST: 16,
  LEFT_HIP: 23,      RIGHT_HIP: 24,
  LEFT_KNEE: 25,     RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,    RIGHT_ANKLE: 28,
}

let _landmarker = null
let _loadPromise = null
// VIDEO mode requires timestamps to be strictly monotonically increasing across
// all detectForVideo calls on the same instance — even across separate videos.
let _lastTimestampMs = 0

// Returns the next valid timestamp to pass to detectForVideo.
// Uses the actual video time in ms but never goes backward.
export function nextVideoTimestamp(videoTimeSeconds) {
  const tsMs = Math.round(videoTimeSeconds * 1000)
  _lastTimestampMs = Math.max(_lastTimestampMs + 1, tsMs)
  return _lastTimestampMs
}

export async function getLandmarker() {
  if (_landmarker) return _landmarker
  if (_loadPromise) return _loadPromise

  _loadPromise = (async () => {
    try {
      const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
      const resolver = await FilesetResolver.forVisionTasks(WASM_CDN)

      const baseOptions = { modelAssetPath: MODEL_URL }

      // Try GPU first (faster), fall back to CPU for Capacitor/WebView environments
      // where WebGL may be limited or unavailable
      try {
        _landmarker = await PoseLandmarker.createFromOptions(resolver, {
          baseOptions: { ...baseOptions, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
        })
      } catch {
        console.warn('[pose] GPU delegate failed, retrying with CPU')
        _landmarker = await PoseLandmarker.createFromOptions(resolver, {
          baseOptions: { ...baseOptions, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
        })
      }

      return _landmarker
    } catch (err) {
      _loadPromise = null
      throw err
    }
  })()

  return _loadPromise
}

function calcAngle3D(a, b, c) {
  // Returns angle at joint b using x, y, z — more accurate than 2D when depth is available
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) }
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) }
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z
  const m1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2)
  const m2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2)
  if (!m1 || !m2) return null
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * (180 / Math.PI))
}

export function extractMetrics(lm, timestamp) {
  // 3D angles for all joint calculations
  const leftElbow  = calcAngle3D(lm[LM.LEFT_SHOULDER],  lm[LM.LEFT_ELBOW],  lm[LM.LEFT_WRIST])
  const rightElbow = calcAngle3D(lm[LM.RIGHT_SHOULDER], lm[LM.RIGHT_ELBOW], lm[LM.RIGHT_WRIST])
  const leftFlare  = calcAngle3D(lm[LM.LEFT_HIP],       lm[LM.LEFT_SHOULDER],  lm[LM.LEFT_ELBOW])
  const rightFlare = calcAngle3D(lm[LM.RIGHT_HIP],      lm[LM.RIGHT_SHOULDER], lm[LM.RIGHT_ELBOW])
  const leftHip    = calcAngle3D(lm[LM.LEFT_SHOULDER],  lm[LM.LEFT_HIP],  lm[LM.LEFT_KNEE])
  const rightHip   = calcAngle3D(lm[LM.RIGHT_SHOULDER], lm[LM.RIGHT_HIP], lm[LM.RIGHT_KNEE])
  const leftKnee   = calcAngle3D(lm[LM.LEFT_HIP],       lm[LM.LEFT_KNEE],  lm[LM.LEFT_ANKLE])
  const rightKnee  = calcAngle3D(lm[LM.RIGHT_HIP],      lm[LM.RIGHT_KNEE], lm[LM.RIGHT_ANKLE])

  const wL = lm[LM.LEFT_WRIST]
  const wR = lm[LM.RIGHT_WRIST]

  const visScores = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_ELBOW]
    .map(i => lm[i]?.visibility ?? 0)
  const confidence = Math.round((visScores.reduce((s, v) => s + v, 0) / visScores.length) * 100)

  // Raw joint positions for client-side skeleton overlay (not sent to server)
  const j = (idx) => lm[idx] ? { x: lm[idx].x, y: lm[idx].y, v: lm[idx].visibility ?? 1 } : null
  const joints = {
    nose:          j(LM.NOSE),
    leftShoulder:  j(LM.LEFT_SHOULDER),
    rightShoulder: j(LM.RIGHT_SHOULDER),
    leftElbow:     j(LM.LEFT_ELBOW),
    rightElbow:    j(LM.RIGHT_ELBOW),
    leftWrist:     j(LM.LEFT_WRIST),
    rightWrist:    j(LM.RIGHT_WRIST),
    leftHip:       j(LM.LEFT_HIP),
    rightHip:      j(LM.RIGHT_HIP),
    leftKnee:      j(LM.LEFT_KNEE),
    rightKnee:     j(LM.RIGHT_KNEE),
    leftAnkle:     j(LM.LEFT_ANKLE),
    rightAnkle:    j(LM.RIGHT_ANKLE),
  }

  return {
    timestamp,
    poseDetected: true,
    confidence,
    elbowFlexion: { left: leftElbow,  right: rightElbow },
    elbowFlare:   { left: leftFlare,  right: rightFlare },
    hipAngle:     { left: leftHip,    right: rightHip },
    kneeAngle:    { left: leftKnee,   right: rightKnee },
    wristPos: {
      left:  { x: wL?.x ?? null, y: wL?.y ?? null },
      right: { x: wR?.x ?? null, y: wR?.y ?? null },
    },
    joints, // raw positions for overlay rendering — stripped before server upload
  }
}

/**
 * Run MediaPipe pose estimation on an array of extracted video frames.
 * Uses VIDEO mode with monotonically increasing timestamps for tracking.
 * Falls back gracefully if MediaPipe fails to load.
 * @param {Array<{dataUrl: string, timestamp: number}>} frames
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<Array>} poseData array (one entry per frame)
 */
export async function estimatePoses(frames, onProgress) {
  let landmarker
  try {
    onProgress?.('Loading pose model...')
    landmarker = await getLandmarker()
  } catch (err) {
    console.warn('[pose] Failed to load MediaPipe:', err.message)
    return frames.map(f => ({ timestamp: f.timestamp, poseDetected: false }))
  }

  const results = []
  for (let i = 0; i < frames.length; i++) {
    onProgress?.(`Mapping movement... (${i + 1}/${frames.length})`)
    try {
      const img = new Image()
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = frames[i].dataUrl })
      const raw = landmarker.detectForVideo(img, nextVideoTimestamp(frames[i].timestamp))
      const lm = raw.landmarks?.[0]
      results.push(lm
        ? extractMetrics(lm, frames[i].timestamp)
        : { timestamp: frames[i].timestamp, poseDetected: false }
      )
    } catch {
      results.push({ timestamp: frames[i].timestamp, poseDetected: false })
    }
  }
  return results
}
