// Shared prompt builder for form check analysis functions.
// Centralizes exercise-specific coaching criteria and pose data formatting.

// ─── Exercise-specific criteria ──────────────────────────────────────────────

function getExerciseCriteria(exercise) {
  const ex = (exercise || '').toLowerCase()

  if (ex.includes('bench')) return `
BENCH PRESS ASSESSMENT CRITERIA:
- BAR TOUCH POINT: Lower sternum/upper abdomen. Too high (toward neck) = shoulder impingement risk. Too low = reduced ROM and power transfer.
- ELBOW FLARE: Upper arm angle from torso at bottom should be 45–75°. Pose "elbow_flare" measures this — flag >80° as shoulder risk, <30° as excessive tuck.
- ELBOW FLEXION: At the bottom position, elbow joint angle should be ~85–100° (forearms roughly vertical). Pose "elbow_flex" measures this.
- BAR PATH: A slight diagonal from lower pec at bottom toward J-cups at lockout. Not perfectly vertical. Bar drifting toward face is a major flag.
- WRIST: Neutral to slight extension. Excessive hyperextension = forearm and wrist strain, compromises bar control. Wrists should be stacked over elbows at bottom.
- SCAPULAR RETRACTION: Shoulder blades pulled together and depressed throughout. Any loss of retraction = setup/positional issue.
- ARCH: Moderate natural arch is fine and protective. Extreme arch that dramatically shortens ROM is a flag. Buttocks must stay in contact with bench.
- LEG DRIVE: Feet flat on floor (or heels raised) — not lifted entirely. Knees tracking outward. Loss of leg drive reduces force transfer to the bar.`

  if (ex.includes('front squat')) return `
FRONT SQUAT ASSESSMENT CRITERIA:
- RACK POSITION: Bar resting on front delts, elbows high and forward. Dropped elbows = bar rolls forward.
- TORSO: Should remain very upright throughout. More forward lean than back squat = technique issue or mobility deficit.
- DEPTH: Hip crease at or below knee level. Pose "knee_flexion" ≤90° = good depth.
- KNEE TRACKING: Knees track in line with toes. Valgus collapse = injury risk.
- HEELS: Must stay on floor. Rising = ankle dorsiflexion limitation.`

  if (ex.includes('squat')) return `
SQUAT ASSESSMENT CRITERIA:
- DEPTH: Hip crease must reach or pass below top of knee for a legal squat. Pose "knee_flexion" ≤90° = good depth, >120° = above parallel.
- KNEE TRACKING: Knees track in line with toes throughout. Valgus collapse (knees caving inward) = significant injury risk.
- BAR PATH: Should stay vertically over mid-foot throughout. Forward or backward drift = technique flag.
- TORSO LEAN: Low-bar allows more forward lean than high-bar. Excessive lean beyond what the style requires = hip dominance or mobility limit.
- HEEL RISE: Heels must remain on the floor. Rising = ankle dorsiflexion restriction.
- LUMBAR: Neutral lordosis throughout. Butt-wink (posterior pelvic tilt at depth) is a flag, especially with load.`

  if (ex.includes('romanian') || (ex.includes('rdl'))) return `
ROMANIAN DEADLIFT ASSESSMENT CRITERIA:
- HIP HINGE: Movement is a pure hip hinge — knees have slight bend that stays fixed, not a squat. Hips drive back as torso lowers.
- BACK POSITION: Neutral spine throughout is critical. Any lumbar rounding = high injury risk.
- BAR PATH: Bar should stay close to the body (drag down the legs). Bar drift away = increased spinal loading.
- DEPTH: Hinge until a hamstring stretch is felt — typically bar reaches mid-shin. Going lower than hamstring mobility allows = lumbar compensation.
- LOCKOUT: Full hip extension at the top. No hyperextension of the lumbar at lockout.`

  if (ex.includes('deadlift')) return `
DEADLIFT ASSESSMENT CRITERIA:
- SETUP: Hips above knees, bar over mid-foot, shoulder blades above or just in front of bar.
- BACK: Neutral spine throughout. Lumbar rounding = high injury risk. Upper back rounding (thoracic) less severe but still flag it.
- HIP HINGE: Movement initiates from hips. Early knee straightening ("squatting the bar up") = power loss and increased spinal load.
- BAR PATH: Straight vertical line, staying as close to the body as possible. Bar drift away = greater moment arm = more spinal load.
- LOCKOUT: Hip and knee extension simultaneous. Hyperextending at lockout = flag.
- NECK: Neutral position, eyes roughly parallel to floor. Not aggressively extended or tucked.`

  if (ex.includes('overhead') || (ex.includes('press') && !ex.includes('bench'))) return `
OVERHEAD PRESS ASSESSMENT CRITERIA:
- GRIP: Just outside shoulder width. Bar resting in lower palm (not fingertips).
- BAR PATH: Straight vertical line. Lifter's head moves back briefly as bar passes face, then "presses through" to lockout. Forward bar path = inefficient.
- LOCKOUT: Full elbow extension, bar stacked directly over the shoulder joint. Bar forward of shoulder = unstable endpoint.
- CORE: Some lumbar extension is normal and expected. Aggressive hyperextension = core weakness flag.
- WRIST: Neutral — not hyperextended. Hyperextension with heavy loads = injury risk.`

  if (ex.includes('row')) return `
BARBELL ROW ASSESSMENT CRITERIA:
- HIP HINGE: Torso should be ~45° or more horizontal depending on style. Upright torso = insufficient hinge.
- PULL: Bar drives toward lower abdomen/upper hip, not toward chest. Elbow path should be close to the body.
- BACK: Neutral spine throughout. Lumbar rounding = flag. Excessive body English on each rep = cheating the load.
- SCAPULAR RETRACTION: Scapulae retract fully at the top of each rep.
- ECCENTRIC: Bar should lower with control, not drop.`

  if (ex.includes('pull') || ex.includes('chin')) return `
PULL-UP/CHIN-UP ASSESSMENT CRITERIA:
- STARTING POSITION: Full dead hang at bottom with shoulder blades engaged, not passive shrug.
- CHIN CLEARANCE: Chin must clear the bar at the top of each rep.
- ELBOW PATH: Elbows drive down and back. Excessive forward elbow path = front-delt dominant.
- KIPPING: Note if the lifter is using kip or strict. Strict is preferred for strength development.
- CORE: Body should remain relatively straight. Excessive leg swing = momentum use.`

  if (ex.includes('lunge')) return `
LUNGE ASSESSMENT CRITERIA:
- STEP LENGTH: Front foot positioned so that the front shin is roughly vertical at the bottom of the rep. Too short = excessive forward knee travel. Too long = reduced glute engagement.
- KNEE TRACKING: Front knee must track in line with the toes — not caving inward (valgus).
- FRONT KNEE TRAVEL: Front knee should not drift significantly past the toes (though minor travel is acceptable with good ankle mobility).
- REAR KNEE: Should descend toward (but not necessarily touch) the floor.
- TORSO: Upright throughout. Excessive forward lean = hip flexor tightness or step-length issue.
- BALANCE: Any lateral sway or hip drop indicates hip abductor weakness or instability.`

  if (ex.includes('hip thrust')) return `
HIP THRUST ASSESSMENT CRITERIA:
- SETUP: Upper back on bench, bar over hip crease, feet flat and roughly hip-width.
- LOCKOUT: Full hip extension at top — pelvis neutral or slightly posteriorly tilted. NOT hyperextended lumbar.
- FOOT POSITION: Feet positioned so shins are vertical at top position.
- DESCENT: Hips should lower fully without the bar rolling. Controlled eccentric.`

  return `
GENERAL MOVEMENT ASSESSMENT CRITERIA:
- JOINT ALIGNMENT: Check that joints stack appropriately for the movement pattern.
- LOAD PATH: Track the bar or load through the full movement. Straight and controlled is preferred.
- LEFT-RIGHT SYMMETRY: Note any significant asymmetry in position or movement between sides.
- CONTROL: Assess tempo, especially during the eccentric (lowering) phase.
- RANGE OF MOTION: Assess whether appropriate full ROM for the exercise is being achieved.`
}

// ─── Pose data formatter (backend version) ───────────────────────────────────

/**
 * Format pose data (from client-side MediaPipe) into a text block for the LLM prompt.
 * @param {Array} poseData
 * @param {string} exercise
 * @returns {string}
 */
export function formatPoseContext(poseData, exercise) {
  if (!poseData?.length) return ''
  const detected = poseData.filter(p => p.poseDetected)
  if (!detected.length) return '\nNote: Pose estimation ran but no person was detected in the frames.'

  const ex = (exercise || '').toLowerCase()
  const isBench    = ex.includes('bench')
  const isSquat    = ex.includes('squat')
  const isDeadlift = ex.includes('deadlift') || ex.includes('rdl')

  const lines = [
    '',
    '--- BIOMECHANICAL MEASUREMENTS (MediaPipe pose estimation, client-side) ---',
    'These are objective computer vision measurements. Reference specific values in your feedback.',
    "When pose confidence is ≥70%, trust the measurement over visual guessing from compressed images.",
    '',
  ]

  poseData.forEach((p, i) => {
    const label = `Frame ${i + 1} (${(p.timestamp ?? 0).toFixed(1)}s)`
    if (!p.poseDetected) { lines.push(`${label}: pose not detected`); return }

    const parts = [`conf:${p.confidence}%`]

    if (p.elbowFlexion?.left && p.elbowFlexion?.right) {
      parts.push(`elbow_flex: L${p.elbowFlexion.left}°/R${p.elbowFlexion.right}°`)
    }

    if (isBench && p.elbowFlare?.left && p.elbowFlare?.right) {
      const avg = Math.round((p.elbowFlare.left + p.elbowFlare.right) / 2)
      const flag = avg > 80 ? ' [WIDE — elbow flare, shoulder risk]' : avg < 30 ? ' [very tucked]' : ' [within 45–75° target]'
      parts.push(`elbow_flare: ~${avg}°${flag}`)
    }

    if ((isSquat || isDeadlift) && p.hipAngle?.left && p.hipAngle?.right) {
      const avg = Math.round((p.hipAngle.left + p.hipAngle.right) / 2)
      parts.push(`hip_angle: ~${avg}°`)
    }

    if (isSquat && p.kneeAngle?.left && p.kneeAngle?.right) {
      const avg = Math.round((p.kneeAngle.left + p.kneeAngle.right) / 2)
      const flag = avg > 120 ? ' [above parallel]' : avg < 90 ? ' [good depth]' : ''
      parts.push(`knee_flexion: ~${avg}°${flag}`)
    }

    if (p.wristPos?.left?.y !== null && p.wristPos?.right?.y !== null) {
      const diff = Math.abs((p.wristPos.left.y ?? 0) - (p.wristPos.right.y ?? 0))
      parts.push(diff > 0.04 ? `wrist_asymmetry: ${Math.round(diff * 100)}% [uneven — one side higher]` : `wrist_symmetry: even`)
    }

    lines.push(`${label}: ${parts.join(', ')}`)
  })

  // Bar path summary across all frames
  const tracked = poseData
    .filter(p => p.poseDetected && p.wristPos?.left?.x !== null && p.wristPos?.right?.x !== null)
    .map(p => ({
      x: ((p.wristPos.left.x ?? 0) + (p.wristPos.right.x ?? 0)) / 2,
      y: ((p.wristPos.left.y ?? 0) + (p.wristPos.right.y ?? 0)) / 2,
    }))

  if (tracked.length >= 3) {
    const xRange = Math.max(...tracked.map(p => p.x)) - Math.min(...tracked.map(p => p.x))
    const yRange = Math.max(...tracked.map(p => p.y)) - Math.min(...tracked.map(p => p.y))
    const driftFlag = xRange > 0.06 ? '[notable horizontal drift]' : '[consistent vertical path]'
    lines.push('')
    lines.push(`Bar path (wrist tracking): vertical_travel=${Math.round(yRange * 100)}%frame, horizontal_drift=${Math.round(xRange * 100)}%frame ${driftFlag}`)
  }

  lines.push('--- END MEASUREMENTS ---')
  return lines.join('\n')
}

// ─── System prompt builder ────────────────────────────────────────────────────

/**
 * Build the system prompt for a form check, tailored to the exercise.
 * @param {string} exercise
 * @param {boolean} hasPoseData
 * @returns {string}
 */
export function buildSystemPrompt(exercise, hasPoseData) {
  const poseSection = hasPoseData
    ? `\nYou will also receive BIOMECHANICAL MEASUREMENTS from client-side MediaPipe pose estimation alongside the frames. These are objective measurements of joint angles and bar path — more accurate than visually estimating angles from compressed images. Always reference these values in your analysis. Quote specific measurements in your feedback (e.g., "your elbow flare measured ~72°, which is on the wider end of the safe range").`
    : ''

  return `You are an elite strength and conditioning coach analyzing exercise form from sequential video frames.${poseSection}

Analyze the complete movement across ALL frames before assigning any phases or scores.

RULES:
1. ONLY describe what you can actually see. Never invent positions or angles not clearly visible.
2. Frames showing the lifter standing, resting, walking, or setting up → phase "setup" or "rest", formScore 0, cues []. Do NOT fabricate form issues for these frames.
3. If camera angle prevents assessment of something, list it in cameraLimitations — do NOT guess.
4. Score (formScore) ONLY frames where active lifting is occurring. Base overallScore ONLY on those frames.
5. Use timestamps to understand tempo, pauses, and movement speed.
6. When pose measurements are available and confidence ≥70%, weight them over visual interpretation of the compressed image.
${getExerciseCriteria(exercise)}
SCORING: 1–3 dangerous/injury risk, 4–5 significant technique issues, 6–7 decent with clear fixes, 8–9 solid with minor tweaks, 10 textbook perfect. formScore 0 for setup/rest.

RESPOND WITH ONLY VALID JSON (no markdown, no backticks):
{
  "exercise": "Detected exercise name",
  "variation": "Specific variation if identifiable (e.g. 'low bar', 'sumo', 'close grip') or null",
  "repsDetected": 1,
  "overallScore": 7,
  "overallSummary": "2–3 sentences written directly to the lifter. Reference measured values where available. Be specific about what you observed.",
  "cameraLimitations": ["Things that could not be assessed due to camera angle or frame quality"],
  "movementQuality": {
    "stability":    { "score": 8, "note": "...", "confidence": "high|medium|low" },
    "rangeOfMotion":{ "score": 7, "note": "...", "confidence": "high|medium|low" },
    "control":      { "score": 6, "note": "...", "confidence": "high|medium|low" },
    "alignment":    { "score": 8, "note": "...", "confidence": "high|medium|low" }
  },
  "keyStrengths": ["Specific strength — reference body part and measurement if available"],
  "keyIssues":    ["Specific issue with measured value if available, and WHY it matters for the lift or injury risk"],
  "injuryRisks": [
    {
      "area": "Body area at risk",
      "severity": "low|medium|high",
      "description": "What's happening and why it's risky — cite measurements if available",
      "fix": "Specific actionable cue to address it"
    }
  ],
  "frames": [
    {
      "frameNumber": 1,
      "phase": "setup|descent|bottom|ascent|lockout|transition|rest",
      "assessment": "Describe only what you see. Reference pose measurements for this frame if available.",
      "formScore": 8,
      "cues": ["Actionable coaching cue for lift frames. Empty array [] for setup/rest."]
    }
  ],
  "focusDrill": {
    "title": "The ONE thing to fix first",
    "description": "2–3 sentences: what to do differently next session, with a specific cue or drill",
    "cue": "Short memorable coaching cue (e.g. 'chest up, spread the floor')"
  },
  "recommendations": ["Priority fix 1 with specific instruction", "Fix 2", "Fix 3"]
}

Write directly to the lifter using "you/your". Be concise but specific. Never fabricate observations — if uncertain, say so.`
}

// ─── User message builder ─────────────────────────────────────────────────────

/**
 * Build the multipart user message array for the OpenAI API call.
 * @param {string[]} frames - base64 encoded frames
 * @param {number[]} timestamps
 * @param {string} exercise
 * @param {string} note
 * @param {string} imageDetail - 'low' or 'high'
 * @param {string} poseContext - formatted pose measurement text
 * @returns {Array}
 */
export function buildUserMessage(frames, timestamps, exercise, note, imageDetail, poseContext) {
  let text = `Analyze these ${frames.length} sequential frames from a workout video.`
  if (exercise) text += `\n\nExercise: ${exercise}. Apply the exercise-specific criteria in your analysis.`
  if (note) text += `\n\nLifter's note: "${note}"`
  const duration = timestamps?.length >= 2 ? timestamps[timestamps.length - 1] : null
  text += `\n\nFrames numbered 1–${frames.length} in chronological order${duration ? `, spanning ${duration}s of video` : ''}.`
  if (poseContext) text += poseContext

  const content = [{ type: 'text', text }]
  frames.forEach((frame, i) => {
    const ts = timestamps?.[i]
    content.push({ type: 'text', text: ts != null ? `Frame ${i + 1} (${ts}s):` : `Frame ${i + 1}:` })
    content.push({
      type: 'image_url',
      image_url: {
        url: frame.startsWith('data:') ? frame : `data:image/jpeg;base64,${frame}`,
        detail: imageDetail || 'low',
      },
    })
  })

  return content
}
