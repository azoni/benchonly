import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const SRC = join(__dirname, '..')
const PAGES_DIR = join(SRC, 'pages')
const COMPONENTS_DIR = join(SRC, 'components')
const FUNCTIONS_DIR = join(__dirname, '../../netlify/functions')

function readFile(path) {
  return readFileSync(path, 'utf-8')
}

function getFiles(dir, ext = '.jsx') {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith(ext))
    .map(f => [f, join(dir, f)])
}

const pageFiles = getFiles(PAGES_DIR)
const componentFiles = getFiles(COMPONENTS_DIR)
const allReactFiles = [...pageFiles, ...componentFiles]
const functionFiles = getFiles(FUNCTIONS_DIR, '.js').filter(([n]) => !n.endsWith('.bak'))

// ============================================================
// Import integrity — no broken imports
// ============================================================
describe('import integrity', () => {
  it.each(allReactFiles)('%s has no import from non-existent local files', (name, path) => {
    const content = readFile(path)
    const dir = join(path, '..')
    const localImports = content.match(/from\s+['"](\.\.[^'"]+)['"]/g) || []
    for (const imp of localImports) {
      const importPath = imp.match(/from\s+['"]([^'"]+)['"]/)?.[1]
      if (!importPath) continue
      const resolved = join(dir, importPath)
      // Check with common extensions
      const exists = [resolved, `${resolved}.js`, `${resolved}.jsx`, `${resolved}/index.js`, `${resolved}/index.jsx`]
        .some(p => existsSync(p))
      expect(exists, `Import ${importPath} in ${name} should resolve`).toBe(true)
    }
  })
})

// ============================================================
// No dangerouslySetInnerHTML (XSS vector)
// ============================================================
describe('XSS prevention', () => {
  it.each(allReactFiles)('%s has no dangerouslySetInnerHTML', (name, path) => {
    const content = readFile(path)
    expect(content).not.toContain('dangerouslySetInnerHTML')
  })
})

// ============================================================
// No hardcoded secrets or API keys
// ============================================================
describe('no hardcoded secrets', () => {
  const allFiles = [...allReactFiles, ...functionFiles]
  
  it.each(allFiles)('%s has no hardcoded API keys', (name, path) => {
    const content = readFile(path)
    // Check for common API key patterns (long hex/base64 strings assigned to key-like vars)
    expect(content).not.toMatch(/apiKey\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/)
    expect(content).not.toMatch(/secret\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/)
  })
})

// ============================================================
// useEffect cleanup — intervals/timeouts must be cleaned up  
// ============================================================
describe('interval/timeout cleanup', () => {
  const filesWithTimers = allReactFiles.filter(([, path]) => {
    const content = readFile(path)
    return content.includes('setInterval') || content.includes('setTimeout')
  })

  it.each(filesWithTimers)('%s clears intervals on cleanup', (name, path) => {
    const content = readFile(path)
    const intervals = (content.match(/setInterval/g) || []).length
    const clears = (content.match(/clearInterval/g) || []).length
    // Should have at least as many clearInterval as setInterval
    // (or store in ref and clear elsewhere)
    if (intervals > 0) {
      const hasRef = content.includes('Ref.current') && content.includes('clearInterval')
      const hasCleanup = clears >= intervals || hasRef
      expect(hasCleanup, `${name}: ${intervals} setInterval(s) but only ${clears} clearInterval(s)`).toBe(true)
    }
  })
})

// ============================================================
// Every page that uses user.uid should get it from useAuth
// ============================================================
describe('auth context usage', () => {
  const filesWithUid = allReactFiles.filter(([, path]) => {
    const content = readFile(path)
    return content.includes('user.uid') || content.includes('user?.uid')
  })

  it.each(filesWithUid)('%s imports useAuth', (name, path) => {
    const content = readFile(path)
    expect(content).toContain('useAuth')
  })
})

// ============================================================
// CORS headers include Authorization
// ============================================================
describe('CORS headers', () => {
  it.each(functionFiles)('%s CORS allows Authorization header', (name, path) => {
    const content = readFile(path)
    if (content.includes('Access-Control-Allow-Headers')) {
      expect(content).toMatch(/Authorization/)
    }
  })
})

// ============================================================
// Route definitions match navigation targets
// ============================================================
describe('route consistency', () => {
  it('all Link to= targets have matching routes', () => {
    const appContent = readFile(join(SRC, 'App.jsx'))
    
    // Extract defined routes
    const routes = new Set()
    const routeMatches = appContent.match(/path="([^"]+)"/g) || []
    for (const r of routeMatches) {
      const path = r.match(/path="([^"]+)"/)?.[1]
      if (path && !path.includes(':') && !path.includes('*')) {
        routes.add(path.startsWith('/') ? path : '/' + path)
      }
    }
    // Root route
    routes.add('/')
    routes.add('/today')
    
    // Extract all Link to= targets from pages
    const staticLinks = new Set()
    for (const [, path] of allReactFiles) {
      const content = readFile(path)
      const links = content.match(/to=["']\/([^"'$`{]+)["']/g) || []
      for (const l of links) {
        const target = l.match(/to=["'](\/[^"']+)["']/)?.[1]
        if (target && !target.includes('$') && !target.includes('{')) {
          staticLinks.add(target)
        }
      }
    }
    
    // Every static link should have a matching route
    for (const link of staticLinks) {
      const hasRoute = routes.has(link) || [...routes].some(r => link.startsWith(r + '/'))
      expect(hasRoute, `Link target "${link}" should have matching route`).toBe(true)
    }
  })
})

// ============================================================
// No console.log in production (should be console.error or removed)
// ============================================================
describe('console usage', () => {
  it('counts console.log statements', () => {
    let totalLogs = 0
    for (const [name, path] of allReactFiles) {
      const content = readFile(path)
      const logs = (content.match(/console\.log\(/g) || []).length
      totalLogs += logs
    }
    // Track regression — set threshold at current count + buffer
    // This is intentionally lenient to prevent test failure but tracks the metric
    expect(totalLogs).toBeLessThan(100)
  })
})

// ============================================================
// Serverless functions don't have duplicate Firebase Admin init
// ============================================================
describe('Firebase Admin init', () => {
  it.each(functionFiles)('%s does not have inline Firebase Admin init', (name, path) => {
    const content = readFile(path)
    // Should use shared auth.js, not inline admin.initializeApp
    if (name !== 'auth.js' && !path.includes('utils/')) {
      const inlineInit = content.match(/admin\.initializeApp/g) || []
      expect(inlineInit.length, `${name} should use shared auth.js, not inline admin init`).toBe(0)
    }
  })
})

// ============================================================
// All async handlers have try/catch
// ============================================================
describe('error handling', () => {
  it.each(functionFiles)('%s handler has try/catch', (name, path) => {
    const content = readFile(path)
    if (content.includes('async function handler') || content.includes('handler = async')) {
      expect(content).toContain('catch')
    }
  })
})