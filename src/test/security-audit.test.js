import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const FUNCTIONS_DIR = join(__dirname, '../../netlify/functions')
const PAGES_DIR = join(__dirname, '../../src/pages')
const COMPONENTS_DIR = join(__dirname, '../../src/components')

function readFile(path) {
  return readFileSync(path, 'utf-8')
}

function getFunctionFiles() {
  return readdirSync(FUNCTIONS_DIR)
    .filter(f => f.endsWith('.js') && !f.endsWith('.bak'))
    .map(f => [f, join(FUNCTIONS_DIR, f)])
}

function getPageFiles() {
  return readdirSync(PAGES_DIR)
    .filter(f => f.endsWith('.jsx'))
    .map(f => [f, join(PAGES_DIR, f)])
}

function getComponentFiles() {
  return readdirSync(COMPONENTS_DIR)
    .filter(f => f.endsWith('.jsx'))
    .map(f => [f, join(COMPONENTS_DIR, f)])
}

// ============================================================
// SERVER-SIDE: Every function must verify auth
// ============================================================
describe('serverless function auth enforcement', () => {
  const functions = getFunctionFiles()
  
  it.each(functions)('%s imports verifyAuth', (name, path) => {
    const content = readFile(path)
    expect(content).toContain('verifyAuth')
  })

  it.each(functions)('%s returns UNAUTHORIZED on failed auth', (name, path) => {
    const content = readFile(path)
    expect(content).toContain('UNAUTHORIZED')
  })

  it.each(functions)('%s handles OPTIONS preflight with Authorization header', (name, path) => {
    const content = readFile(path)
    expect(content).toContain('OPTIONS')
  })

  it.each(functions)('%s does not trust userId from request body', (name, path) => {
    const content = readFile(path)
    // userId should come from auth.uid, not destructured from body
    const bodyParse = content.match(/JSON\.parse\(event\.body\)/)
    if (bodyParse) {
      // Get the destructuring line
      const afterParse = content.slice(content.indexOf('JSON.parse(event.body)'))
      const destructLine = afterParse.split('\n').slice(0, 3).join(' ')
      // userId should NOT be in the destructuring
      expect(destructLine).not.toMatch(/{\s*[^}]*\buserId\b/)
    }
  })

  it.each(functions)('%s enforces admin-only premium model if model selection exists', (name, path) => {
    const content = readFile(path)
    if (content.includes('selectedModel') && content.includes('premium')) {
      expect(content).toMatch(/auth\.isAdmin.*premium|premium.*auth\.isAdmin/)
    }
  })
})

// ============================================================
// CLIENT-SIDE: Every fetch to /.netlify must include auth headers
// ============================================================
describe('client-side auth headers', () => {
  const allClientFiles = [...getPageFiles(), ...getComponentFiles()]
  
  // Filter to only files that make fetch calls to serverless functions
  const filesWithFetch = allClientFiles.filter(([, path]) => {
    const content = readFile(path)
    return content.includes('.netlify/functions/')
  })

  it.each(filesWithFetch)('%s imports getAuthHeaders', (name, path) => {
    const content = readFile(path)
    expect(content).toContain('getAuthHeaders')
  })

  it.each(filesWithFetch)('%s does not use hardcoded Content-Type header for API calls', (name, path) => {
    const content = readFile(path)
    // Find fetch calls to netlify functions
    const fetchCalls = content.match(/fetch\([^)]*\.netlify[^)]*\)[^;]*headers:\s*\{[^}]*\}/g) || []
    for (const call of fetchCalls) {
      // Should not have just { 'Content-Type': 'application/json' } — should use authHeaders
      expect(call).not.toMatch(/headers:\s*\{\s*['"]Content-Type/)
    }
  })

  it.each(filesWithFetch)('%s does not send userId in fetch body', (name, path) => {
    const content = readFile(path)
    // Check JSON.stringify bodies sent to netlify functions
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('.netlify/functions/')) {
        // Check the next ~10 lines for userId in the body
        const block = lines.slice(i, i + 15).join('\n')
        if (block.includes('JSON.stringify')) {
          const bodyStr = block.match(/JSON\.stringify\(\{([^}]*)\}/s)?.[1] || ''
          // userId should not be a top-level key in the body
          // Allow targetUserId (for admin impersonation)
          expect(bodyStr.replace('targetUserId', '')).not.toMatch(/\buserId\b/)
        }
      }
    }
  })
})
