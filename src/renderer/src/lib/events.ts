import type { CalendarEvent } from '../../../shared/types'
import { addDays, dateKey, parseDateKey } from './dates'

/** Bucket events by local day for `dayCount` days starting at `from`.
 *  All-day events land on every day they cover (end is exclusive); timed
 *  events land on the day they start. All-day events sort first. */
export function groupEventsByDay(events: CalendarEvent[], from: Date, dayCount: number): Map<string, CalendarEvent[]> {
  const byDay = new Map<string, CalendarEvent[]>()
  for (let i = 0; i < dayCount; i++) byDay.set(dateKey(addDays(from, i)), [])

  for (const e of events) {
    if (e.allDay) {
      const last = parseDateKey(e.end)
      for (let d = parseDateKey(e.start); d < last; d = addDays(d, 1)) byDay.get(dateKey(d))?.push(e)
    } else {
      byDay.get(dateKey(new Date(e.start)))?.push(e)
    }
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start))
  }
  return byDay
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return groupEventsByDay(events, day, 1).get(dateKey(day)) ?? []
}
