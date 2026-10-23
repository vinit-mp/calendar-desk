import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { CalendarEvent, DayNote } from '../../../shared/types'
import { dateKey, fmtDayLong, fmtEventTime, fmtSavedAt, isSameDay } from '../lib/dates'
import { eventColor } from '../lib/colors'
import DoneCheck from './DoneCheck'

interface Props {
  day: Date
  events: CalendarEvent[]
  note?: DayNote
  onSaveNote: (day: string, text: string) => Promise<DayNote | null | undefined>
  onSelect: (event: CalendarEvent) => void
  onToggleDone: (event: CalendarEvent) => void
  onCreate: (day: Date) => void
  onOpenWeek?: (day: Date) => void
  onClose: () => void
  onReveal: () => void
}

type Status = 'idle' | 'dirty' | 'saving' | 'saved'
const SAVE_DELAY = 700

export default function DayPanel({ day, events, note, onSaveNote, onSelect, onToggleDone, onCreate, onOpenWeek, onClose, onReveal }: Props): React.JSX.Element {
  const key = dateKey(day)
  const [text, setText] = useState(note?.text ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [savedAt, setSavedAt] = useState<string | undefined>(note?.updatedAt)
  const latest = useRef({ text, dirty: false })
  latest.current.text = text

  const flush = useCallback(async (): Promise<void> => {
    if (!latest.current.dirty) return
    latest.current.dirty = false
    setStatus('saving')
    const saved = await onSaveNote(key, latest.current.text)
    if (saved === undefined) {
      // The save failed; keep the text marked dirty so the next edit retries.
      latest.current.dirty = true
      setStatus('dirty')
      return
    }
    setSavedAt(saved?.updatedAt)
    setStatus(latest.current.dirty ? 'dirty' : 'saved')
  }, [key, onSaveNote])

  // Autosave shortly after typing stops, and on the way out.
  useEffect(() => {
    if (status !== 'dirty') return
    const timer = setTimeout(() => void flush(), SAVE_DELAY)
    return () => clearTimeout(timer)
  }, [text, status, flush])
  useEffect(() => () => void flush(), [flush])

  const onChange = (value: string): void => {
    setText(value)
    latest.current.dirty = true
    setStatus('dirty')
  }

  const statusText =
    status === 'saving'
      ? 'Saving…'
      : status === 'dirty'
        ? 'Unsaved changes'
        : savedAt
          ? `Saved on this PC, ${fmtSavedAt(savedAt)}`
          : 'Kept on this PC only. Nothing is sent to Google.'

  return (
    <aside className="panel" aria-label={fmtDayLong(day)}>
      <div className="panel__head">
        <h2>
          {fmtDayLong(day)}
          {isSameDay(day, new Date()) && <span className="panel__today">Today</span>}
        </h2>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Close" title="Close (Esc)">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="panel__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onCreate(day)}>
          New event
        </button>
        {onOpenWeek && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onOpenWeek(day)}>
            Open week
          </button>
        )}
      </div>

      <section className="panel__summary">
        <label htmlFor="day-summary">Summary</label>
        <textarea
          id="day-summary"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => void flush()}
          placeholder="Write a summary for this day."
          rows={8}
          spellCheck
        />
        <p className="panel__status">
          <span aria-live="polite">{statusText}</span>
          <button type="button" className="linkbtn" onClick={onReveal} title="Open the folder holding the local summaries file">
            Show file
          </button>
        </p>
      </section>

      <section className="panel__events">
        <h3>
          {events.length === 0 ? 'No events' : events.length === 1 ? '1 event' : `${events.length} events`}
          {events.length > 0 && `, ${events.filter((e) => e.done).length} done`}
        </h3>
        {events.map((e) => (
          <div key={e.id} className={`event${e.allDay ? ' event--allday' : ''}${e.done ? ' is-done' : ''}`} style={{ '--c': eventColor(e.colorId) } as CSSProperties}>
            <DoneCheck event={e} onToggle={onToggleDone} />
            <button type="button" className="event__body" onClick={() => onSelect(e)}>
              <span className="event__time">{fmtEventTime(e)}</span>
              <span className="event__title">{e.summary}</span>
              {e.location && <span className="event__where">{e.location}</span>}
            </button>
          </div>
        ))}
      </section>
    </aside>
  )
}
