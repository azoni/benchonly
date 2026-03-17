/**
 * Holiday Themes System
 *
 * Each holiday defines a date range and a CSS class that gets applied to <html>.
 * The corresponding CSS in index.css overrides the accent colors site-wide.
 *
 * To add a new holiday:
 * 1. Add an entry here with the date range and cssClass
 * 2. Add the matching CSS block in index.css (copy the st-patricks block as a template)
 */

/**
 * Compute Easter Sunday for a given year (Anonymous Gregorian algorithm).
 * Returns { month, day } with 0-indexed month.
 */
function getEasterDate(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1 // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

/**
 * Compute the Nth occurrence of a weekday in a given month/year.
 * weekday: 0=Sun, 1=Mon, ..., 4=Thu, etc.  n: 1-based.
 * Returns the day-of-month.
 */
function getNthWeekday(year, month, weekday, n) {
  const first = new Date(year, month, 1).getDay()
  let day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
  return day
}

/**
 * Build the full holiday list for the current year.
 * Dynamic holidays (Easter, Thanksgiving, Memorial Day, Labor Day) are computed.
 */
function buildHolidayThemes() {
  const year = new Date().getFullYear()
  const easter = getEasterDate(year)
  const thanksgiving = getNthWeekday(year, 10, 4, 4) // 4th Thursday of November
  const memorialDay = (() => {
    // Last Monday of May: find the last day, walk back to Monday
    const lastDay = new Date(year, 5, 0).getDate() // last day of May
    const lastDow = new Date(year, 4, lastDay).getDay()
    return lastDay - ((lastDow - 1 + 7) % 7)
  })()
  const laborDay = getNthWeekday(year, 8, 1, 1) // 1st Monday of September

  return [
    {
      id: 'new-years',
      name: "New Year's Day",
      greeting: 'Happy New Year!',
      emoji: '\uD83C\uDF89',
      cssClass: 'holiday-new-years',
      dates: [{ month: 0, day: 1 }],
    },
    {
      id: 'valentines',
      name: "Valentine's Day",
      greeting: "Happy Valentine's Day!",
      emoji: '\u2764\uFE0F',
      cssClass: 'holiday-valentines',
      dates: [{ month: 1, day: 14 }],
    },
    {
      id: 'st-patricks',
      name: "St. Patrick's Day",
      greeting: "Happy St. Patrick's Day!",
      emoji: '\u2618\uFE0F',
      cssClass: 'holiday-st-patricks',
      dates: [{ month: 2, day: 17 }],
    },
    {
      id: 'april-fools',
      name: "April Fools' Day",
      greeting: "We moved leg day to today. Just kidding... or did we?",
      emoji: '\uD83E\uDD21',
      cssClass: 'holiday-april-fools',
      dates: [{ month: 3, day: 1 }],
    },
    {
      id: 'easter',
      name: 'Easter',
      greeting: 'Happy Easter!',
      emoji: '\uD83D\uDC30',
      cssClass: 'holiday-easter',
      dates: [easter],
    },
    {
      id: 'cinco-de-mayo',
      name: 'Cinco de Mayo',
      greeting: 'Feliz Cinco de Mayo!',
      emoji: '\uD83C\uDF89',
      cssClass: 'holiday-cinco',
      dates: [{ month: 4, day: 5 }],
    },
    {
      id: 'memorial-day',
      name: 'Memorial Day',
      greeting: 'Honoring those who served.',
      emoji: '\uD83C\uDDFA\uD83C\uDDF8',
      cssClass: 'holiday-july4th', // reuses patriotic blue theme
      dates: [{ month: 4, day: memorialDay }],
    },
    {
      id: 'independence-day',
      name: 'Independence Day',
      greeting: 'Happy 4th of July!',
      emoji: '\uD83C\uDDFA\uD83C\uDDF8',
      cssClass: 'holiday-july4th',
      dates: [{ month: 6, day: 4 }],
    },
    {
      id: 'labor-day',
      name: 'Labor Day',
      greeting: 'Happy Labor Day!',
      emoji: '\uD83D\uDCAA',
      cssClass: 'holiday-july4th', // reuses patriotic blue theme
      dates: [{ month: 8, day: laborDay }],
    },
    {
      id: 'halloween',
      name: 'Halloween',
      greeting: 'Happy Halloween!',
      emoji: '\uD83C\uDF83',
      cssClass: 'holiday-halloween',
      dates: [{ month: 9, day: 31 }],
    },
    {
      id: 'thanksgiving',
      name: 'Thanksgiving',
      greeting: 'Happy Thanksgiving!',
      emoji: '\uD83E\uDD83',
      cssClass: 'holiday-thanksgiving',
      dates: [{ month: 10, day: thanksgiving }],
    },
    {
      id: 'christmas',
      name: 'Christmas',
      greeting: 'Merry Christmas!',
      emoji: '\uD83C\uDF84',
      cssClass: 'holiday-christmas',
      dates: [{ month: 11, day: 24 }, { month: 11, day: 25 }],
    },
  ]
}

const HOLIDAY_THEMES = buildHolidayThemes()

/**
 * Returns the active holiday theme for today, or null.
 */
export function getActiveHolidayTheme() {
  const now = new Date()
  const month = now.getMonth()
  const day = now.getDate()

  return HOLIDAY_THEMES.find(h =>
    h.dates.some(d => d.month === month && d.day === day)
  ) || null
}
