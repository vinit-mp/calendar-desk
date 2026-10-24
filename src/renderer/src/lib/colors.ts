import type { CalendarEvent } from '../../../shared/types'
import { parseDateKey } from './dates'

export type EventStatus = 'upcoming' | 'overdue' | 'done'

/** Done wins; otherwise an event is overdue once its end has passed. All-day
 *  ends are exclusive dates, so a one-day event lapses at the next midnight. */
export function eventStatus(e: CalendarEvent, now: Date): EventStatus {
  if (e.done) return 'done'
  const end = e.allDay ? parseDateKey(e.end) : new Date(e.end)
  return end <= now ? 'overdue' : 'upcoming'
}

/** Status colours are worked out in the app only; Google's own colorId is
 *  left alone. Values are theme tokens defined in styles.css. */
export function statusColor(e: CalendarEvent, now: Date): string {
  return `var(--status-${eventStatus(e, now)})`
}

export const STATUS_LABEL: Record<EventStatus, string> = {
  upcoming: 'Not done',
  overdue: 'Overdue',
  done: 'Done'
}
