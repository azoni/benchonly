import { groupExercisesForDisplay, getSummaryText } from './workoutUtils'

// Brand colors
const COLORS = {
  bg: '#0a0a0a',
  cardBg: '#18181b',
  cardBorder: '#3f3f46',
  flame: '#ff4d00',
  flameAccent: '#fb923c',
  textPrimary: '#f4f4f5',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  supersetBadge: '#a855f7',
}

const FONTS = {
  display: (size) => `${size}px "Bebas Neue", sans-serif`,
  body: (size) => `${size}px "Outfit", sans-serif`,
  bodyBold: (size) => `bold ${size}px "Outfit", sans-serif`,
}

// Layout constants
const CANVAS_WIDTH = 1080
const PADDING = 48
const CONTENT_WIDTH = CANVAS_WIDTH - PADDING * 2
const ROW_HEIGHT = 56
const MAX_EXERCISES = 12

function formatDate(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : date?.toDate ? date.toDate() : new Date(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let truncated = text
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '...'
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/**
 * Generate a branded workout summary image.
 * @param {Object} workout - The workout object with name, date, exercises, status
 * @param {Object} options - { userName }
 * @returns {Promise<Blob>} PNG image blob
 */
export async function generateWorkoutImage(workout, { userName } = {}) {
  await document.fonts.ready

  const isCompleted = workout.status === 'completed'
  const groups = groupExercisesForDisplay(workout.exercises || [])

  // Build flat list of exercise rows
  const rows = []
  for (const group of groups) {
    if (group.type === 'superset') {
      rows.push({ exercise: group.exerciseA, isSuperset: true, isFirst: true })
      rows.push({ exercise: group.exerciseB, isSuperset: true, isFirst: false })
    } else {
      rows.push({ exercise: group.exercise, isSuperset: false })
    }
  }

  const displayRows = rows.slice(0, MAX_EXERCISES)
  const overflowCount = rows.length - displayRows.length

  // Calculate dynamic height
  const headerHeight = 180
  const cardPaddingY = 20
  const exerciseListHeight = displayRows.length * ROW_HEIGHT + (overflowCount > 0 ? 44 : 0)
  const cardHeight = exerciseListHeight + cardPaddingY * 2
  const footerHeight = 80
  const totalHeight = headerHeight + cardHeight + footerHeight + PADDING

  // Create canvas
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = totalHeight
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, totalHeight)

  // --- Header ---
  let y = PADDING

  // App name
  ctx.font = FONTS.display(52)
  ctx.fillStyle = COLORS.flame
  ctx.textBaseline = 'top'
  ctx.fillText('BENCH ONLY', PADDING, y)
  y += 58

  // Workout name
  ctx.font = FONTS.display(38)
  ctx.fillStyle = COLORS.textPrimary
  const workoutName = truncateText(ctx, (workout.name || 'Workout').toUpperCase(), CONTENT_WIDTH)
  ctx.fillText(workoutName, PADDING, y)
  y += 44

  // Date + optional user name
  ctx.font = FONTS.body(22)
  ctx.fillStyle = COLORS.textSecondary
  let subline = formatDate(workout.date)
  if (userName) subline += `  •  ${userName}`
  ctx.fillText(subline, PADDING, y)
  y += 36

  // Flame divider
  ctx.fillStyle = COLORS.flame
  ctx.fillRect(PADDING, y, CONTENT_WIDTH, 3)
  y += 24

  // --- Exercise Card ---
  const cardX = PADDING
  const cardY = y
  const cardW = CONTENT_WIDTH

  // Card background
  roundRect(ctx, cardX, cardY, cardW, cardHeight, 16)
  ctx.fillStyle = COLORS.cardBg
  ctx.fill()

  // Card border
  roundRect(ctx, cardX, cardY, cardW, cardHeight, 16)
  ctx.strokeStyle = COLORS.cardBorder
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Exercise rows
  const rowX = cardX + 24
  const rowW = cardW - 48
  let rowY = cardY + cardPaddingY

  for (const row of displayRows) {
    const { exercise, isSuperset, isFirst } = row
    const summary = getSummaryText(exercise, isCompleted)
    const centerY = rowY + ROW_HEIGHT / 2

    // Superset badge
    let nameX = rowX
    if (isSuperset) {
      if (isFirst) {
        // Draw SS badge
        ctx.font = FONTS.bodyBold(13)
        const badgeW = 28
        const badgeH = 20
        const badgeX = rowX
        const badgeY = centerY - badgeH / 2
        roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 4)
        ctx.fillStyle = COLORS.supersetBadge + '30'
        ctx.fill()
        ctx.fillStyle = COLORS.supersetBadge
        ctx.textBaseline = 'middle'
        ctx.fillText('SS', badgeX + 5, centerY + 1)
      }
      nameX = rowX + 36
    }

    // Exercise name (left)
    ctx.font = FONTS.bodyBold(22)
    ctx.fillStyle = COLORS.textPrimary
    ctx.textBaseline = 'middle'
    const summaryWidth = (() => {
      ctx.font = FONTS.body(22)
      return ctx.measureText(summary).width
    })()
    const maxNameW = rowW - summaryWidth - 24 - (isSuperset ? 36 : 0)
    ctx.font = FONTS.bodyBold(22)
    const name = truncateText(ctx, exercise.name || 'Exercise', maxNameW)
    ctx.fillText(name, nameX, centerY)

    // Summary text (right, flame accent)
    ctx.font = FONTS.body(22)
    ctx.fillStyle = isCompleted ? COLORS.flameAccent : COLORS.textSecondary
    ctx.textAlign = 'right'
    ctx.fillText(summary, rowX + rowW, centerY)
    ctx.textAlign = 'left'

    // Subtle divider between rows
    if (row !== displayRows[displayRows.length - 1]) {
      ctx.fillStyle = COLORS.cardBorder + '60'
      ctx.fillRect(rowX, rowY + ROW_HEIGHT - 1, rowW, 1)
    }

    rowY += ROW_HEIGHT
  }

  // Overflow indicator
  if (overflowCount > 0) {
    ctx.font = FONTS.body(18)
    ctx.fillStyle = COLORS.textMuted
    ctx.textBaseline = 'middle'
    ctx.fillText(`+${overflowCount} more exercise${overflowCount > 1 ? 's' : ''}`, rowX, rowY + 22)
  }

  // --- Footer ---
  const footerY = cardY + cardHeight + 28
  ctx.font = FONTS.body(20)
  ctx.fillStyle = COLORS.textMuted
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('benchpressonly.com', CANVAS_WIDTH / 2, footerY)
  ctx.textAlign = 'left'

  // Convert to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}
