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
 * TIMEZONE FIX: For dates at midnight UTC, use UTC components
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
  
  // Handle raw Firestore timestamp
  if (date?.seconds) {
    date = new Date(date.seconds * 1000)
  }
  
  // Check if midnight UTC - use UTC date components
  if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0) {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
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
 * 
 * TIMEZONE FIX: Dates stored at midnight UTC should display as that UTC date,
 * not shifted to local timezone. We detect midnight UTC and use UTC date components.
 */
export function getDisplayDate(date) {
  if (!date) return new Date()
  
  let dateObj
  
  if (date?.toDate) {
    dateObj = date.toDate()
  } else if (typeof date === 'string') {
    return parseLocalDate(date)
  } else if (date instanceof Date) {
    dateObj = date
  } else if (date?.seconds) {
    dateObj = new Date(date.seconds * 1000)
  } else {
    return new Date()
  }
  
  // Check if time is near midnight UTC (within a few hours)
  // This indicates it was likely stored as a date without time consideration
  const hours = dateObj.getUTCHours()
  const minutes = dateObj.getUTCMinutes()
  
  if (hours === 0 && minutes === 0) {
    // Use UTC date components for dates stored at midnight UTC
    const year = dateObj.getUTCFullYear()
    const month = dateObj.getUTCMonth()
    const day = dateObj.getUTCDate()
    return new Date(year, month, day, 12, 0, 0)
  }
  
  // For dates with time component, use local date
  const year = dateObj.getFullYear()
  const month = dateObj.getMonth()
  const day = dateObj.getDate()
  return new Date(year, month, day, 12, 0, 0)
}