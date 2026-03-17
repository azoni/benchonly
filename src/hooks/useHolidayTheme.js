import { useEffect, useMemo } from 'react'
import { getActiveHolidayTheme } from '../config/holidayThemes'

/**
 * Checks today's date for an active holiday theme.
 * Applies the holiday's CSS class to <html> so global overrides kick in.
 * Returns the active holiday object (or null).
 */
export function useHolidayTheme() {
  const holiday = useMemo(() => getActiveHolidayTheme(), [])

  useEffect(() => {
    if (!holiday) return
    document.documentElement.classList.add(holiday.cssClass)
    return () => document.documentElement.classList.remove(holiday.cssClass)
  }, [holiday])

  return holiday
}
