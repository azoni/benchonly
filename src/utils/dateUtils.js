import { format } from 'date-fns'

/**
 * Get today's date as YYYY-MM-DD string in local timezone
 */
export function getTodayString() {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Parse a YYYY-MM-DD string into a Date object at noon local time
 * Using noon avoids timezone issues that occur at midnight
 */
export function parseLocalDate(dateString) {
  if (!dateString) return new Date()
  
  // If it's already a Date object, return it
  if (dateString instanceof Date) return dateString
  
  // If it's a Firestore Timestamp
  if (dateString?.toDate) return dateString.toDate()
  
  // Parse YYYY-MM-DD string and create date at noon local time
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0)
}

/**
 * Format a date to YYYY-MM-DD string in local timezone
 */
export function toDateString(date) {
  if (!date) return getTodayString()
  
  // Handle Firestore Timestamp
  if (date?.toDate) {
    date = date.toDate()
  }
  
  // Handle string input
  if (typeof date === 'string') {
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date
    }
    date = new Date(date)
  }
  
  return format(date, 'yyyy-MM-dd')
}

/**
 * Compare two dates (ignoring time)
 * Returns true if they're the same day
 */
export function isSameDay(date1, date2) {
  return toDateString(date1) === toDateString(date2)
}

/**
 * Get the display date from a workout/entry
 * Handles Firestore Timestamp, Date object, or string
 */
export function getDisplayDate(date) {
  if (!date) return new Date()
  
  if (date?.toDate) {
    return date.toDate()
  }
  
  if (typeof date === 'string') {
    return parseLocalDate(date)
  }
  
  return date
}
