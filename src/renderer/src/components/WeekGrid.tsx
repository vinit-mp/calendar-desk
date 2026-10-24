import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { CalendarEvent, DayNote, EventInput } from '../../../shared/types'
import { addDays, dateKey, fmtDayName, fmtTime, isSameDay, startOfDay } from '../lib/dates'
import { STATUS_LABEL, eventStatus, statusColor } from '../lib/colors'
import { useNow } from '../lib/useNow'
import DoneCheck from './DoneCheck'

export const HOUR_PX = 48
const SNAP = 15
const DAY_MIN = 24 * 60
const GUTTER = 56
const DRAG_THRESHOLD_PX = 4
const DEFAULT_DURATION = 60

interface Props {
  weekStart: Date
  events: CalendarEvent[]
  notes: Record<string, DayNote>
  loading: boolean
  selectedId?: string
  openDay?: string
  /** A create draft open in the editor; drawn as a dashed block so you can see where it will land. */
  draft?: EventInput
  onSelect: (event: CalendarEvent) => void
  onCreate: (day: Date) => void
  onCreateRange: (start: Date, end: Date, allDay: boolean) => void
  onMove: (event: CalendarEvent, start: string, end: string) => void
  onToggleDone: (event: CalendarEvent) => void
  onOpenDay: (day: Date) => void
}

// ---------- geometry ----------

interface Seg {
  event: CalendarEvent
  startMin: number
  endMin: number
}
interface Placed extends Seg {
  col: number
  cols: number
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const snapDown = (m: number): number => Math.floor(m / SNAP) * SNAP
const snapNear = (m: number): number => Math.round(m / SNAP) * SNAP
const minuteOfDay = (d: Date): number => d.getHours() * 60 + d.getMinutes()

function atMinutes(day: Date, min: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min)
}

/** Where a timed event sits on one particular day, clipped to that day. */
function timedSegments(events: CalendarEvent[], day: Date): Seg[] {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  const key = dateKey(dayStart)
  const out: Seg[] = []
  for (const event of events) {
    if (event.allDay) continue
    const s = new Date(event.start)
    const e = new Date(event.end)
    if (e <= dayStart || s >= dayEnd) continue
    const startMin = dateKey(s) === key ? minuteOfDay(s) : 0
    let endMin = dateKey(e) === key ? minuteOfDay(e) : DAY_MIN
    if (endMin < startMin + SNAP) endMin = Math.min(DAY_MIN, startMin + SNAP)
    out.push({ event, startMin, endMin })
  }
  return out
}

function allDayOn(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const key = dateKey(day)
  return events.filter((e) => e.allDay && e.start <= key && key < e.end)
}

/** Side-by-side columns for overlapping events, the way calendar apps do it. */
function layoutDay(segs: Seg[]): Placed[] {
  const sorted = [...segs].sort((a, b) => a.startMin - b.startMin || b.endMin - b.startMin - (a.endMin - a.startMin))
  const placed: Placed[] = []
  let group: Seg[] = []
  let groupEnd = -1
  const flush = (): void => {
    const colEnds: number[] = []
    const assigned = group.map((seg) => {
      let col = colEnds.findIndex((end) => end <= seg.startMin)
      if (col === -1) {
        col = colEnds.length
        colEnds.push(seg.endMin)
      } else {
        colEnds[col] = seg.endMin
      }
      return { seg, col }
    })
    for (const { seg, col } of assigned) placed.push({ ...seg, col, cols: colEnds.length })
    group = []
    groupEnd = -1
  }
  for (const seg of sorted) {
    if (group.length && seg.startMin >= groupEnd) flush()
    group.push(seg)
    groupEnd = Math.max(groupEnd, seg.endMin)
  }
  if (group.length) flush()
  return placed
}

// ---------- drag state ----------

type Drag =
  | { kind: 'create'; day: number; anchor: number; cur: number; moved: boolean }
  | { kind: 'move'; event: CalendarEvent; day0: number; min0: number; segStart: number; segEnd: number; day: number; min: number; moved: boolean }
  | { kind: 'resize'; event: CalendarEvent; day: number; startMin: number; endMin: number; moved: boolean }

interface Ghost {
  day: number
  start: number
  end: number
}

const hourFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })

export default function WeekGrid({ weekStart, events, notes, loading, selectedId, openDay, draft, onSelect, onCreate, onCreateRange, onMove, onToggleDone, onOpenDay }: Props): React.JSX.Element {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const columns = useMemo(() => days.map((day) => ({ day, placed: layoutDay(timedSegments(events, day)), allDay: allDayOn(events, day) })), [days, events])
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const downAt = useRef({ x: 0, y: 0 })
  const [drag, setDrag] = useState<Drag | null>(null)
  const now = useNow()

  // First paint: scroll to a sensible hour instead of midnight.
  const scrolled = useRef(false)
  useLayoutEffect(() => {
    if (scrolled.current || !scrollRef.current) return
    scrolled.current = true
    const today = days.some((d) => isSameDay(d, now))
    const targetMin = today ? minuteOfDay(now) - 90 : 7 * 60
    scrollRef.current.scrollTop = Math.max(0, (targetMin / 60) * HOUR_PX)
  }, [days, now])

  const locate = (e: { clientX: number; clientY: number }): { day: number; min: number } => {
    const r = gridRef.current!.getBoundingClientRect()
    const colWidth = (r.width - GUTTER) / 7
    return {
      day: clamp(Math.floor((e.clientX - r.left - GUTTER) / colWidth), 0, 6),
      min: clamp(((e.clientY - r.top) / HOUR_PX) * 60, 0, DAY_MIN)
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const col = target.closest<HTMLElement>('.tcol')
    if (!col) return
    const { day, min } = locate(e)
    downAt.current = { x: e.clientX, y: e.clientY }
    const evEl = target.closest<HTMLElement>('.tev')
    if (evEl) {
      const event = eventById.get(evEl.dataset.id ?? '')
      if (!event) return
      const segStart = Number(evEl.dataset.start)
      const segEnd = Number(evEl.dataset.end)
      if (target.closest('.tev__resize')) {
        setDrag({ kind: 'resize', event, day, startMin: segStart, endMin: segEnd, moved: false })
      } else {
        setDrag({ kind: 'move', event, day0: day, min0: min, segStart, segEnd, day, min, moved: false })
      }
    } else {
      setDrag({ kind: 'create', day, anchor: snapDown(min), cur: min, moved: false })
    }
    gridRef.current?.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drag) return
    const { day, min } = locate(e)
    const moved = drag.moved || Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y) > DRAG_THRESHOLD_PX
    setDrag((d) => {
      if (!d) return d
      if (d.kind === 'create') return { ...d, cur: min, moved }
      if (d.kind === 'move') return { ...d, day, min, moved }
      return { ...d, endMin: min, moved }
    })
  }

  const finish = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag
    setDrag(null)
    gridRef.current?.releasePointerCapture(e.pointerId)
    if (!d) return

    if (d.kind === 'create') {
      const a = d.anchor
      let b = d.moved ? snapNear(d.cur) : a + DEFAULT_DURATION
      if (b === a) b = a + DEFAULT_DURATION
      const start = Math.min(a, b)
      const end = Math.min(DAY_MIN, Math.max(a, b))
      onCreateRange(atMinutes(days[d.day], start), atMinutes(days[d.day], end), false)
      return
    }

    if (d.kind === 'move') {
      if (!d.moved) {
        onSelect(d.event)
        return
      }
      const dMin = snapNear(d.min - d.min0)
      const dDays = d.day - d.day0
      if (dMin === 0 && dDays === 0) return
      const shift = (iso: string): string => {
        const x = addDays(new Date(iso), dDays)
        x.setMinutes(x.getMinutes() + dMin)
        return x.toISOString()
      }
      onMove(d.event, shift(d.event.start), shift(d.event.end))
      return
    }

    if (!d.moved) {
      onSelect(d.event)
      return
    }
    const endMin = clamp(snapNear(d.endMin), d.startMin + SNAP, DAY_MIN)
    const end = atMinutes(days[d.day], endMin)
    if (end.getTime() === new Date(d.event.end).getTime()) return
    onMove(d.event, d.event.start, end.toISOString())
  }

  const cancel = (e: ReactPointerEvent<HTMLDivElement>): void => {
    setDrag(null)
    gridRef.current?.releasePointerCapture(e.pointerId)
  }

  // What to draw while dragging.
  const ghost = useMemo<Ghost | null>(() => {
    if (!drag) return null
    if (drag.kind === 'create') {
      const a = drag.anchor
      const b = drag.moved ? snapNear(drag.cur) : a + DEFAULT_DURATION
      const start = Math.min(a, b)
      return { day: drag.day, start, end: clamp(Math.max(a, b, start + SNAP), 0, DAY_MIN) }
    }
    if (!drag.moved) return null
    if (drag.kind === 'move') {
      const dMin = snapNear(drag.min - drag.min0)
      return { day: clamp(drag.day0 + (drag.day - drag.day0), 0, 6), start: drag.segStart + dMin, end: drag.segEnd + dMin }
    }
    return { day: drag.day, start: drag.startMin, end: clamp(snapNear(drag.endMin), drag.startMin + SNAP, DAY_MIN) }
  }, [drag])

  const pending = useMemo<Ghost | null>(() => {
    if (!draft || draft.allDay) return null
    const s = new Date(draft.start)
    const day = days.findIndex((d) => isSameDay(d, s))
    if (day === -1) return null
    const e = new Date(draft.end)
    return { day, start: minuteOfDay(s), end: isSameDay(e, s) ? minuteOfDay(e) : DAY_MIN }
  }, [draft, days])

  const draggingId = drag && drag.kind !== 'create' && drag.moved ? drag.event.id : undefined
  const ghostLabel = (g: Ghost): string => `${fmtTime(atMinutes(days[g.day], g.start).toISOString())} – ${fmtTime(atMinutes(days[g.day], Math.min(g.end, DAY_MIN)).toISOString())}`

  const onEventKey = (e: ReactKeyboardEvent, event: CalendarEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(event)
    }
  }

  return (
    <main className={`week${drag?.moved ? ' is-dragging' : ''}`} aria-busy={loading} style={{ '--gutter': `${GUTTER}px` } as CSSProperties}>
      <div className="week__head">
        <div className="week__corner" />
        {days.map((day) => {
          const key = dateKey(day)
          const isToday = isSameDay(day, now)
          const cls = ['dayhead', isToday && 'is-today', day < now && !isToday && 'is-past', key === openDay && 'is-open'].filter(Boolean).join(' ')
          return (
            <div key={key} className={cls}>
              <button type="button" className="day__open" onClick={() => onOpenDay(day)} title="Open day">
                <span className="day__name">{fmtDayName(day)}</span>
                <span className="day__num">{day.getDate()}</span>
              </button>
              <button type="button" className="day__add" onClick={() => onCreate(day)} aria-label={`New event on ${day.toDateString()}`} title="New event">
                +
              </button>
            </div>
          )
        })}
      </div>

      <div className="week__allday">
        <div className="week__corner">All day</div>
        {columns.map(({ day, allDay }) => (
          <div
            key={dateKey(day)}
            className={`tallday${isSameDay(day, now) ? ' is-today' : ''}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) onCreateRange(startOfDay(day), addDays(startOfDay(day), 1), true)
            }}
            title="Click to add an all-day event"
          >
            {allDay.map((event) => (
              <div
                key={event.id}
                className={`chip${event.id === selectedId ? ' is-selected' : ''}${event.done ? ' is-done' : ''}`}
                style={{ '--c': statusColor(event, now) } as CSSProperties}
                title={`${event.summary} (${STATUS_LABEL[eventStatus(event, now)]})`}
              >
                <DoneCheck event={event} onToggle={onToggleDone} />
                <button type="button" className="chip__title" onClick={() => onSelect(event)}>
                  {event.summary}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="week__scroll" ref={scrollRef}>
        <div
          className="tgrid"
          ref={gridRef}
          style={{ height: 24 * HOUR_PX }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={cancel}
        >
          <div className="tgutter" aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span key={h} style={{ top: h * HOUR_PX }}>
                {hourFmt.format(new Date(2000, 0, 1, h))}
              </span>
            ))}
          </div>

          {columns.map(({ day, placed }, i) => {
            const isToday = isSameDay(day, now)
            return (
              <div key={dateKey(day)} className={`tcol${isToday ? ' is-today' : ''}`} data-day={i} aria-label={day.toDateString()}>
                {placed.map((p) => {
                  const height = ((p.endMin - p.startMin) / 60) * HOUR_PX
                  const cls = ['tev', height < 34 && 'tev--short', p.event.done && 'is-done', p.event.id === selectedId && 'is-selected', p.event.id === draggingId && 'is-ghosted'].filter(Boolean).join(' ')
                  return (
                    <div
                      key={`${p.event.id}-${p.startMin}`}
                      className={cls}
                      role="button"
                      tabIndex={0}
                      data-id={p.event.id}
                      data-start={p.startMin}
                      data-end={p.endMin}
                      onKeyDown={(e) => onEventKey(e, p.event)}
                      style={{
                        top: (p.startMin / 60) * HOUR_PX,
                        height,
                        left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                        width: `calc(${100 / p.cols}% - 4px)`,
                        '--c': statusColor(p.event, now)
                      } as CSSProperties}
                      title={`${p.event.summary}\n${fmtTime(p.event.start)} – ${fmtTime(p.event.end)}\n${STATUS_LABEL[eventStatus(p.event, now)]}`}
                    >
                      <span className="tev__top">
                        <DoneCheck event={p.event} onToggle={onToggleDone} />
                        <span className="tev__title">{p.event.summary}</span>
                      </span>
                      <span className="tev__time">
                        {fmtTime(p.event.start)} – {fmtTime(p.event.end)}
                      </span>
                      <span className="tev__resize" aria-hidden="true" />
                    </div>
                  )
                })}

                {pending && pending.day === i && (
                  <div className="tghost tghost--pending" style={{ top: (pending.start / 60) * HOUR_PX, height: ((pending.end - pending.start) / 60) * HOUR_PX }}>
                    <span>{ghostLabel(pending)}</span>
                  </div>
                )}
                {ghost && ghost.day === i && (
                  <div className="tghost" style={{ top: (ghost.start / 60) * HOUR_PX, height: ((ghost.end - ghost.start) / 60) * HOUR_PX }}>
                    <span>{ghostLabel(ghost)}</span>
                  </div>
                )}
                {isToday && <div className="tnow" style={{ top: (minuteOfDay(now) / 60) * HOUR_PX }} />}
              </div>
            )
          })}
        </div>
      </div>

      <div className="week__notes">
        <div className="week__corner" />
        {days.map((day) => {
          const key = dateKey(day)
          const note = notes[key]
          return (
            <button key={key} type="button" className={`day__note${note ? ' has-note' : ''}${isSameDay(day, now) ? ' is-today' : ''}`} onClick={() => onOpenDay(day)} title={note ? 'Open summary' : 'Add a summary for this day'}>
              <span>{note ? note.text : 'Add summary'}</span>
            </button>
          )
        })}
      </div>
    </main>
  )
}
