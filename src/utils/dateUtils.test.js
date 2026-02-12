import { describe, it, expect } from 'vitest'
import { getTodayString, parseLocalDate, toDateString, isSameDay, getDisplayDate } from './dateUtils'

describe('dateUtils', () => {
  // ============================================================
  // getTodayString
  // ============================================================
  describe('getTodayString', () => {
    it('returns YYYY-MM-DD format', () => {
      const result = getTodayString()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  // ============================================================
  // parseLocalDate
  // ============================================================
  describe('parseLocalDate', () => {
    it('parses YYYY-MM-DD string at noon', () => {
      const d = parseLocalDate('2025-03-15')
      expect(d.getFullYear()).toBe(2025)
      expect(d.getMonth()).toBe(2) // March = 2
      expect(d.getDate()).toBe(15)
      expect(d.getHours()).toBe(12)
    })

    it('handles ISO string with T', () => {
      const d = parseLocalDate('2025-06-01T00:00:00.000Z')
      expect(d instanceof Date).toBe(true)
      expect(isNaN(d.getTime())).toBe(false)
      // parseLocalDate forces noon local to avoid timezone-boundary shifts
      expect(d.getHours()).toBe(12)
    })

    it('handles Date object passthrough', () => {
      const input = new Date(2025, 0, 1, 15, 30)
      const result = parseLocalDate(input)
      expect(result).toBe(input) // same reference
    })

    it('handles Firestore Timestamp', () => {
      const fakeTimestamp = { toDate: () => new Date(2025, 5, 15, 10, 0) }
      const result = parseLocalDate(fakeTimestamp)
      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(5)
    })

    it('returns current date for null/undefined', () => {
      const result = parseLocalDate(null)
      expect(result).toBeInstanceOf(Date)
      expect(isNaN(result.getTime())).toBe(false)
    })

    it('returns current date for empty string', () => {
      const result = parseLocalDate('')
      expect(result).toBeInstanceOf(Date)
      expect(isNaN(result.getTime())).toBe(false)
    })

    it('handles garbage input without crashing', () => {
      expect(() => parseLocalDate('not-a-date')).not.toThrow()
      expect(() => parseLocalDate(42)).not.toThrow()
      expect(() => parseLocalDate({})).not.toThrow()
      expect(() => parseLocalDate(true)).not.toThrow()
    })

    it('never returns Invalid Date', () => {
      const inputs = [null, undefined, '', 'garbage', 42, {}, true, 'Invalid Date', NaN]
      for (const input of inputs) {
        const result = parseLocalDate(input)
        expect(isNaN(result.getTime())).toBe(false)
      }
    })
  })

  // ============================================================
  // toDateString
  // ============================================================
  describe('toDateString', () => {
    it('formats Date object to YYYY-MM-DD', () => {
      const d = new Date(2025, 2, 15, 14, 30)
      expect(toDateString(d)).toBe('2025-03-15')
    })

    it('passes through YYYY-MM-DD string unchanged', () => {
      expect(toDateString('2025-03-15')).toBe('2025-03-15')
    })

    it('handles midnight UTC correctly (timezone fix)', () => {
      // This is the key timezone bug scenario:
      // Date stored as 2025-03-15T00:00:00.000Z would show as 2025-03-14 in PST
      const d = new Date('2025-03-15T00:00:00.000Z')
      expect(toDateString(d)).toBe('2025-03-15')
    })

    it('handles Firestore Timestamp', () => {
      const ts = { toDate: () => new Date(2025, 5, 15, 12, 0) }
      expect(toDateString(ts)).toBe('2025-06-15')
    })

    it('handles raw Firestore timestamp with seconds', () => {
      const ts = { seconds: new Date(2025, 0, 1, 12, 0).getTime() / 1000 }
      expect(toDateString(ts)).toBe('2025-01-01')
    })

    it('returns today for null/undefined', () => {
      const today = getTodayString()
      expect(toDateString(null)).toBe(today)
      expect(toDateString(undefined)).toBe(today)
    })
  })

  // ============================================================
  // isSameDay
  // ============================================================
  describe('isSameDay', () => {
    it('same date strings match', () => {
      expect(isSameDay('2025-03-15', '2025-03-15')).toBe(true)
    })

    it('different dates do not match', () => {
      expect(isSameDay('2025-03-15', '2025-03-16')).toBe(false)
    })

    it('Date object and string for same day match', () => {
      const d = new Date(2025, 2, 15, 14, 30) // March 15, 2:30pm
      expect(isSameDay(d, '2025-03-15')).toBe(true)
    })

    it('midnight UTC and local date for same day match', () => {
      const d = new Date('2025-03-15T00:00:00.000Z')
      expect(isSameDay(d, '2025-03-15')).toBe(true)
    })
  })

  // ============================================================
  // getDisplayDate
  // ============================================================
  describe('getDisplayDate', () => {
    it('returns Date for null', () => {
      const result = getDisplayDate(null)
      expect(result).toBeInstanceOf(Date)
      expect(isNaN(result.getTime())).toBe(false)
    })

    it('handles YYYY-MM-DD string', () => {
      const result = getDisplayDate('2025-06-15')
      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(5)
      expect(result.getDate()).toBe(15)
    })

    it('handles midnight UTC Date (timezone fix)', () => {
      const d = new Date('2025-03-15T00:00:00.000Z')
      const result = getDisplayDate(d)
      // Should show as March 15 regardless of local timezone
      expect(result.getDate()).toBe(15)
      expect(result.getMonth()).toBe(2)
    })

    it('handles Firestore Timestamp', () => {
      const ts = { toDate: () => new Date(2025, 5, 15, 12, 0) }
      const result = getDisplayDate(ts)
      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(5)
      expect(result.getDate()).toBe(15)
    })

    it('handles raw Firestore timestamp with seconds', () => {
      const ts = { seconds: new Date(2025, 0, 1, 12, 0).getTime() / 1000 }
      const result = getDisplayDate(ts)
      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(0)
      expect(result.getDate()).toBe(1)
    })

    it('never returns Invalid Date', () => {
      const inputs = [null, undefined, '', 'garbage', 42, {}, true]
      for (const input of inputs) {
        const result = getDisplayDate(input)
        expect(isNaN(result.getTime())).toBe(false)
      }
    })
  })
})