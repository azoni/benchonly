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
    .filter(f => f.endsWith(ext) && !f.endsWith('.test.js') && !f.endsWith('.test.jsx'))
    .map(f => [f, join(dir, f)])
}

const pageFiles = getFiles(PAGES_DIR)
const componentFiles = getFiles(COMPONENTS_DIR)
const allReactFiles = [...pageFiles, ...componentFiles]
const functionFiles = getFiles(FUNCTIONS_DIR, '.js').filter(([n]) => !n.endsWith('.bak'))

// ============================================================
// Every JSON.parse of localStorage must be wrapped in try/catch
// ============================================================
describe('JSON.parse safety', () => {
  it.each(allReactFiles)('%s wraps localStorage JSON.parse in try/catch', (name, path) => {
    const content = readFile(path)
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Find lines with JSON.parse that also reference localStorage
      if (line.includes('JSON.parse') && !line.includes('//')) {
        // Check if this JSON.parse involves localStorage data
        // Look at the surrounding context (5 lines before) for localStorage.getItem
        const context = lines.slice(Math.max(0, i - 5), i + 1).join('\n')
        if (context.includes('localStorage.getItem') || context.includes('stored') || context.includes('saved')) {
          // Check if we're inside a try block by scanning backwards for 'try {'
          let inTry = false
          for (let j = i; j >= Math.max(0, i - 40); j--) {
            const checkLine = lines[j].trim()
            if (checkLine.match(/\btry\s*\{/) || checkLine === 'try {') {
              inTry = true
              break
            }
            // If we hit a top-level function/component boundary, stop
            if (checkLine.match(/^(export\s+)?(default\s+)?function\s/) || checkLine.match(/^(const|let)\s+\w+\s*=\s*\(.*\)\s*=>\s*\{$/)) {
              break
            }
          }
          expect(inTry, `${name} line ${i + 1}: JSON.parse of localStorage data must be wrapped in try/catch`).toBe(true)
        }
      }
    }
  })
})

// ============================================================
// Serverless functions: JSON.parse(event.body) should be in try/catch  
// ============================================================
describe('serverless body parsing safety', () => {
  it.each(functionFiles)('%s has JSON.parse(event.body) within try/catch', (name, path) => {
    const content = readFile(path)
    if (!content.includes('JSON.parse(event.body)')) return

    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('JSON.parse(event.body)')) {
        // Walk backwards to find try block
        let inTry = false
        for (let j = i; j >= Math.max(0, i - 20); j--) {
          if (lines[j].includes('try')) {
            inTry = true
            break
          }
        }
        expect(inTry, `${name} line ${i + 1}: JSON.parse(event.body) should be within try/catch`).toBe(true)
      }
    }
  })
})

// ============================================================
// No unhandled .toDate() calls (Firestore timestamp)
// ============================================================
describe('safe Firestore timestamp access', () => {
  it.each(allReactFiles)('%s uses safe .toDate() patterns', (name, path) => {
    const content = readFile(path)
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.includes('.toDate()') && !line.includes('//')) {
        // Should use optional chaining: ?.toDate?.() or ?.toDate()
        // Or be preceded by a null check
        const hasSafeAccess = 
          line.includes('?.toDate') ||       // optional chaining
          line.includes('&& ') ||            // null check inline
          line.includes('.toDate ?') ||       // ternary check
          line.includes('toDate :')           // ternary check
        
        // Check surrounding lines for guards (if check, optional chaining, ternary)
        const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n')
        const hasContextGuard = 
          context.includes('if (') || context.includes('if(') ||
          context.includes('?.toDate?.()') ||  // guarded by optional chaining on prior line
          context.includes('?.toDate()')       // guarded variant
        
        expect(
          hasSafeAccess || hasContextGuard,
          `${name} line ${i + 1}: .toDate() should use optional chaining or null check: "${line.trim()}"`
        ).toBe(true)
      }
    }
  })
})

// ============================================================
// No alert() in production — should use toast/proper error UI
// ============================================================
describe('alert usage tracking', () => {
  it('counts total alert() calls (regression check)', () => {
    let total = 0
    const alertFiles = []
    for (const [name, path] of allReactFiles) {
      const content = readFile(path)
      const count = (content.match(/\balert\s*\(/g) || []).length
      if (count > 0) {
        total += count
        alertFiles.push(`${name}: ${count}`)
      }
    }
    // Track regression — currently have some alerts, should decrease over time
    // Fail if alert count grows beyond current baseline
    expect(total).toBeLessThan(45)
  })
})