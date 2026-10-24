import { useMemo, type CSSProperties } from 'react'
import type { CalendarEvent, DayNote } from '../../../shared/types'
import { addDays, addMonths, dateKey, daysInMonth, fmtMonthName, isSameDay } from '../lib/dates'
import { groupEventsByDay } from '../lib/events'
import { STATUS_LABEL, eventStatus, statusColor } from '../lib/colors'
import { useNow } from '../lib/useNow'

interface Props {
  quarterStart: Date
  events: CalendarEvent[]
  notes: Record<string, DayNote>
  loading: boolean
  openDay?: string
  onOpenDay: (day: Date) => void
}

const MAX_BARS = 3
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function QuarterGrid({ quarterStart, events, notes, loading, openDay, onOpenDay }: Props): React.JSX.Element {
  const today = useNow()
  const months = useMemo(() => [0, 1, 2].map((i) => addMonths(quarterStart, i)), [quarterStart])
  const byDay = useMemo(() => {
    const end = addMonths(quarterStart, 3)
    const dayCount = Math.round((end.getTime() - quarterStart.getTime()) / 86_400_000)
    return groupEventsByDay(events, quarterStart, dayCount)
  }, [quarterStart, events])

  return (
    <main className="quarter" aria-busy={loading}>
      {months.map((month) => {
        const leading = (month.getDay() + 6) % 7
        const count = daysInMonth(month)
        const cells = Array.from({ length: 42 }, (_, i) => i - leading + 1)
        return (
          <section key={dateKey(month)} className="month" aria-label={fmtMonthName(month)}>
            <h2 className="month__head">{fmtMonthName(month)}</h2>
            <div className="month__dow" aria-hidden="true">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="month__grid">
              {cells.map((n, i) => {
                if (n < 1 || n > count) return <span key={i} className="cell cell--blank" aria-hidden="true" />
                const day = addDays(month, n - 1)
                const key = dateKey(day)
                const list = byDay.get(key) ?? []
                const isToday = isSameDay(day, today)
                const classes = [
                  'cell',
                  isToday && 'cell--today',
                  day < today && !isToday && 'cell--past',
                  i % 7 >= 5 && 'cell--weekend',
                  key === openDay && 'cell--open',
                  notes[key] && 'cell--noted'
                ]
                  .filter(Boolean)
                  .join(' ')
                const extra = list.length - MAX_BARS
                return (
                  <button key={key} type="button" className={classes} onClick={() => onOpenDay(day)} aria-label={`${day.toDateString()}, ${list.length} event${list.length === 1 ? '' : 's'}${notes[key] ? ', has summary' : ''}`}>
                    <span className="cell__num">{n}</span>
                    {list.length > 0 && (
                      <span className="cell__bars">
                        {list.slice(0, MAX_BARS).map((e) => (
                          <i key={e.id} className={e.done ? 'is-done' : undefined} style={{ '--c': statusColor(e, today) } as CSSProperties} title={`${e.summary} (${STATUS_LABEL[eventStatus(e, today)]})`} />
                        ))}
                      </span>
                    )}
                    {extra > 0 && <span className="cell__more">+{extra}</span>}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </main>
  )
}
