import type { CalendarEvent } from '../../../shared/types'

const pad = (n: number): string => String(n).padStart(2, '0')

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Monday-first week. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  return addDays(x, -((x.getDay() + 6) % 7))
}

export function startOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)
}

/** Month arithmetic on a first-of-month date (no day overflow to worry about). */
export function addMonths(firstOfMonth: Date, n: number): Date {
  return new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + n, 1)
}

export function daysInMonth(firstOfMonth: Date): number {
  return new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate()
}

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b)
}

/** ISO datetime -> value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** <input type="datetime-local"> value (local) -> ISO datetime. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

/** Local date of an event's first day, whichever form the start takes. */
export function eventStartDate(e: Pick<CalendarEvent, 'allDay' | 'start'>): Date {
  return e.allDay ? parseDateKey(e.start) : startOfDay(new Date(e.start))
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayNameFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long' })
const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

const dayLongFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const savedAtFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export const fmtTime = (iso: string): string => timeFmt.format(new Date(iso))
export const fmtDayName = (d: Date): string => dayNameFmt.format(d)
export const fmtMonthName = (d: Date): string => monthFmt.format(d)
export const fmtDayLong = (d: Date): string => dayLongFmt.format(d)
export const fmtSavedAt = (iso: string): string => savedAtFmt.format(new Date(iso))

/** "October – December 2026" (quarters never straddle a year). */
export function fmtQuarterRange(quarterStart: Date): string {
  return `${monthFmt.format(quarterStart)} – ${monthYearFmt.format(addMonths(quarterStart, 2))}`
}

/** "20 – 26 October 2026" or "27 October – 2 November 2026". */
export function fmtWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  if (weekStart.getMonth() === end.getMonth()) {
    return `${weekStart.getDate()} – ${end.getDate()} ${monthYearFmt.format(end)}`
  }
  const left = `${weekStart.getDate()} ${monthFmt.format(weekStart)}`
  const right = `${end.getDate()} ${monthYearFmt.format(end)}`
  return `${left} – ${right}`
}

export function fmtEventTime(e: CalendarEvent): string {
  if (e.allDay) return 'All day'
  const start = new Date(e.start)
  const end = new Date(e.end)
  const sameDay = isSameDay(start, end)
  return sameDay ? `${timeFmt.format(start)} – ${timeFmt.format(end)}` : `${timeFmt.format(start)} – ${dayNameFmt.format(end)} ${timeFmt.format(end)}`
}

/** Round up to the next half hour, used as the default start for a new event. */
export function nextHalfHour(from = new Date()): Date {
  const d = new Date(from)
  d.setSeconds(0, 0)
  d.setMinutes(Math.ceil(d.getMinutes() / 30) * 30)
  return d
}
