import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function readFile(path) {
  return readFileSync(path, 'utf-8')
}

const PAGES = join(__dirname, '../pages')
const COMPONENTS = join(__dirname, '../components')
const SERVICES = join(__dirname, '../services')
const FUNCTIONS = join(__dirname, '../../netlify/functions')

// ============================================================
// BUG-001: workoutService.complete() was missing
// The WorkoutDetailPage called workoutService.complete() but only
// completeWorkout() existed. Now both exist.
// ============================================================
describe('BUG-001: workoutService.complete method exists', () => {
  const firestore = readFile(join(SERVICES, 'firestore.js'))

  it('workoutService has complete() method', () => {
    // Find workoutService section and verify it has async complete
    const wsStart = firestore.indexOf('export const workoutService')
    expect(wsStart).toBeGreaterThan(-1)

    // Find the next export (end of workoutService)
    const wsEnd = firestore.indexOf('export const', wsStart + 1)
    const wsContent = firestore.slice(wsStart, wsEnd > -1 ? wsEnd : undefined)

    expect(wsContent).toMatch(/async complete\s*\(/)
  })

  it('complete() sets status to completed', () => {
    expect(firestore).toMatch(/complete.*\n[\s\S]*?status:\s*['"]completed['"]/)
  })

  it('complete() saves completedAt timestamp', () => {
    const completeMethod = firestore.slice(
      firestore.indexOf("async complete(workoutId, payload)"),
      firestore.indexOf("async complete(workoutId, payload)") + 800
    )
    expect(completeMethod).toContain('completedAt')
    expect(completeMethod).toContain('serverTimestamp()')
  })

  it('complete() checks and updates goals', () => {
    const completeMethod = firestore.slice(
      firestore.indexOf("async complete(workoutId, payload)"),
      firestore.indexOf("async complete(workoutId, payload)") + 800
    )
    expect(completeMethod).toContain('checkAndUpdateGoals')
  })

  it('complete() tracks analytics', () => {
    const completeMethod = firestore.slice(
      firestore.indexOf("async complete(workoutId, payload)"),
      firestore.indexOf("async complete(workoutId, payload)") + 800
    )
    expect(completeMethod).toContain('WORKOUT_COMPLETED')
  })

  it('WorkoutDetailPage calls workoutService.complete not completeWorkout', () => {
    const wdp = readFile(join(PAGES, 'WorkoutDetailPage.jsx'))
    expect(wdp).toContain('workoutService.complete(')
    // Should NOT call the old completeWorkout method
    expect(wdp).not.toContain('workoutService.completeWorkout(')
  })
})

// ============================================================
// BUG-002: OnboardingPage goalService.create() wrong signature
// Was: goalService.create({ userId: uid, ... })
// Fix: goalService.create(user.uid, { ... })
// ============================================================
describe('BUG-002: OnboardingPage goalService.create signature', () => {
  const onboarding = readFile(join(PAGES, 'OnboardingPage.jsx'))

  it('calls goalService.create with userId as first arg, not inside object', () => {
    const createCall = onboarding.match(/goalService\.create\(([^{]*)\{/s)
    expect(createCall).toBeTruthy()
    // First arg should be user.uid or similar, not an opening brace
    const firstArg = createCall[1].trim()
    expect(firstArg).toMatch(/user\.uid/)
  })

  it('does not pass userId inside the goal data object', () => {
    // Find the goalService.create call block
    const lines = onboarding.split('\n')
    const createIdx = lines.findIndex(l => l.includes('goalService.create('))
    expect(createIdx).toBeGreaterThan(-1)

    // Check the next 10 lines for userId key inside the object
    const block = lines.slice(createIdx, createIdx + 10).join('\n')
    // After the first arg (user.uid,), the object should NOT contain userId:
    const objectPart = block.slice(block.indexOf('{'))
    expect(objectPart).not.toMatch(/\buserId\b/)
  })
})

// ============================================================
// BUG-003: Unprotected JSON.parse in DashboardPage healthGoals
// ============================================================
describe('BUG-003: DashboardPage healthGoals JSON.parse safety', () => {
  const dashboard = readFile(join(PAGES, 'DashboardPage.jsx'))

  it('healthGoals initializer has try/catch', () => {
    // Find the healthGoals useState
    const match = dashboard.match(/\[healthGoals.*useState\(\(\) => \{([\s\S]*?)\}\)/)
    expect(match).toBeTruthy()
    expect(match[1]).toContain('try')
    expect(match[1]).toContain('catch')
  })
})

// ============================================================
// BUG-004: Unprotected JSON.parse in HealthPage goals
// ============================================================
describe('BUG-004: HealthPage goals JSON.parse safety', () => {
  const health = readFile(join(PAGES, 'HealthPage.jsx'))

  it('goals initializer has try/catch', () => {
    const match = health.match(/\[goals.*useState\(\(\) => \{([\s\S]*?)\}\)/)
    expect(match).toBeTruthy()
    expect(match[1]).toContain('try')
    expect(match[1]).toContain('catch')
  })
})

// ============================================================
// BUG-005: Unprotected JSON.parse in AIChatPanel rate limiting
// ============================================================
describe('BUG-005: AIChatPanel rate limit JSON.parse safety', () => {
  const chatPanel = readFile(join(COMPONENTS, 'AIChatPanel.jsx'))

  // Helper: extract full function body by brace counting
  function extractFunction(source, fnName) {
    const start = source.indexOf(fnName)
    if (start === -1) return ''
    let braceDepth = 0
    let foundFirst = false
    for (let i = start; i < source.length; i++) {
      if (source[i] === '{') { braceDepth++; foundFirst = true }
      if (source[i] === '}') braceDepth--
      if (foundFirst && braceDepth === 0) return source.slice(start, i + 1)
    }
    return source.slice(start)
  }

  it('checkRateLimit wraps JSON.parse in try/catch', () => {
    const fnBody = extractFunction(chatPanel, 'checkRateLimit = ()')
    expect(fnBody).toContain('try')
    expect(fnBody).toContain('catch')
  })

  it('incrementRateLimit wraps JSON.parse in try/catch', () => {
    const fnBody = extractFunction(chatPanel, 'incrementRateLimit = ()')
    expect(fnBody).toContain('try')
    expect(fnBody).toContain('catch')
  })

  it('incrementRateLimit clears corrupted localStorage on error', () => {
    const fnBody = extractFunction(chatPanel, 'incrementRateLimit = ()')
    expect(fnBody).toContain('localStorage.removeItem')
  })
})

// ============================================================
// BUG-006 (PREV): All serverless functions verify Firebase auth
// ============================================================
describe('BUG-006: Serverless auth enforcement', () => {
  const authUtil = readFile(join(FUNCTIONS, 'utils/auth.js'))

  it('shared auth utility exports verifyAuth', () => {
    expect(authUtil).toContain('export')
    expect(authUtil).toContain('verifyAuth')
  })

  it('verifyAuth checks Authorization header', () => {
    expect(authUtil).toMatch(/Authorization|Bearer/)
  })

  it('verifyAuth calls verifyIdToken', () => {
    expect(authUtil).toContain('verifyIdToken')
  })

  it('auth utility exports UNAUTHORIZED response', () => {
    expect(authUtil).toContain('UNAUTHORIZED')
    expect(authUtil).toContain('401')
  })

  // Verify each function uses auth.uid not body userId
  const functionNames = [
    'generate-workout.js',
    'generate-program.js',
    'analyze-progress.js',
    'ask-assistant.js',
    'autofill-workout.js',
    'swap-exercise.js',
    'delete-group-workouts.js',
    'generate-group-workout.js',
  ]

  it.each(functionNames)('%s derives userId from auth token', (name) => {
    const content = readFile(join(FUNCTIONS, name))
    expect(content).toContain('verifyAuth')
    // swap-exercise doesn't need userId — it just verifies the caller is authenticated
    if (name !== 'swap-exercise.js') {
      expect(content).toContain('auth.uid')
    }
  })
})

// ============================================================
// BUG-007: Client API calls must include auth headers
// ============================================================
describe('BUG-007: Client auth headers', () => {
  const api = readFile(join(SERVICES, 'api.js'))

  it('getAuthHeaders uses Firebase getIdToken', () => {
    expect(api).toContain('getIdToken')
  })

  it('getAuthHeaders sets Authorization Bearer header', () => {
    expect(api).toContain('Bearer')
    expect(api).toContain('Authorization')
  })

  it('all API methods call getAuthHeaders before fetch', () => {
    // Split into function blocks
    const fns = api.split(/export\s+async\s+function\s+/)
    for (const fn of fns) {
      if (!fn.includes('getAuthHeaders') && fn.includes('.netlify/functions/')) {
        // This function makes API calls but doesn't get auth headers
        expect.fail(`Function makes API call without getAuthHeaders: ${fn.slice(0, 50)}...`)
      }
    }
  })
})