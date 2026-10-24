import { useState, type FormEvent } from 'react'
import type { CalendarEvent, EventInput } from '../../../shared/types'
import { addDays, dateKey, fromLocalInput, parseDateKey, toLocalInput } from '../lib/dates'

export type EditorState = { mode: 'create'; draft: EventInput } | { mode: 'edit'; event: CalendarEvent }

interface Props {
  state: EditorState
  busy: boolean
  onClose: () => void
  onSave: (input: EventInput) => void
  onDelete: () => void
  onOpenExternal: (url: string) => void
}

/** Form values. For timed events start/end are datetime-local strings; for
 *  all-day events they are YYYY-MM-DD with an inclusive end (what people
 *  expect to see), converted to Google's exclusive end on save. */
interface Form {
  summary: string
  allDay: boolean
  start: string
  end: string
  location: string
  description: string
  /** Google's own colour, not editable here (the app colours by status);
   *  carried through so saving doesn't wipe a colour set in Google Calendar. */
  colorId: string
  done: boolean
}

function initialForm(state: EditorState): Form {
  if (state.mode === 'create') {
    const d = state.draft
    return {
      summary: d.summary,
      allDay: d.allDay,
      start: d.allDay ? d.start : toLocalInput(d.start),
      end: d.allDay ? dateKey(addDays(parseDateKey(d.end), -1)) : toLocalInput(d.end),
      location: d.location ?? '',
      description: d.description ?? '',
      colorId: d.colorId ?? '',
      done: d.done ?? false
    }
  }
  const e = state.event
  return {
    summary: e.summary === '(No title)' ? '' : e.summary,
    allDay: e.allDay,
    start: e.allDay ? e.start : toLocalInput(e.start),
    end: e.allDay ? dateKey(addDays(parseDateKey(e.end), -1)) : toLocalInput(e.end),
    location: e.location ?? '',
    description: e.description ?? '',
    colorId: e.colorId ?? '',
    done: e.done
  }
}

function validate(f: Form): string | null {
  if (!f.summary.trim()) return 'Give the event a title.'
  if (!f.start || !f.end) return 'Set both a start and an end.'
  if (f.allDay ? f.end < f.start : new Date(f.end) <= new Date(f.start)) return 'The end must come after the start.'
  return null
}

function toInput(f: Form): EventInput {
  return {
    summary: f.summary.trim(),
    location: f.location.trim() || undefined,
    description: f.description.trim() || undefined,
    allDay: f.allDay,
    start: f.allDay ? f.start : fromLocalInput(f.start),
    end: f.allDay ? dateKey(addDays(parseDateKey(f.end), 1)) : fromLocalInput(f.end),
    colorId: f.colorId || undefined,
    done: f.done
  }
}

export default function EventEditor({ state, busy, onClose, onSave, onDelete, onOpenExternal }: Props): React.JSX.Element {
  const [form, setForm] = useState<Form>(() => initialForm(state))
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editing = state.mode === 'edit'

  const patch = (p: Partial<Form>): void => {
    setProblem(null)
    setForm((f) => ({ ...f, ...p }))
  }

  const setStart = (start: string): void => {
    setProblem(null)
    setForm((f) => {
      if (f.allDay) return { ...f, start, end: f.end < start ? start : f.end }
      // Keep the duration when the start moves.
      const duration = new Date(f.end).getTime() - new Date(f.start).getTime()
      const next = new Date(start)
      if (Number.isNaN(next.getTime()) || Number.isNaN(duration)) return { ...f, start }
      return { ...f, start, end: toLocalInput(new Date(next.getTime() + Math.max(duration, 0)).toISOString()) }
    })
  }

  const toggleAllDay = (allDay: boolean): void => {
    setProblem(null)
    setForm((f) => {
      if (allDay) {
        const start = f.start.slice(0, 10)
        const end = f.end.slice(0, 10)
        return { ...f, allDay, start, end: end < start ? start : end }
      }
      return { ...f, allDay, start: `${f.start.slice(0, 10)}T09:00`, end: `${f.end.slice(0, 10)}T10:00` }
    })
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const issue = validate(form)
    if (issue) {
      setProblem(issue)
      return
    }
    onSave(toInput(form))
  }

  const inputType = form.allDay ? 'date' : 'datetime-local'

  return (
    <aside className="editor" aria-label={editing ? 'Edit event' : 'New event'}>
      <form className="editor__form" onSubmit={submit}>
        <div className="editor__head">
          <h2>{editing ? 'Edit event' : 'New event'}</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close" title="Close (Esc)" disabled={busy}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <input
          className="editor__title"
          type="text"
          placeholder="Title"
          value={form.summary}
          onChange={(e) => patch({ summary: e.target.value })}
          autoFocus
          disabled={busy}
          aria-label="Title"
        />

        <div className="editor__toggles">
          <label className="switch">
            <input type="checkbox" checked={form.done} onChange={(e) => patch({ done: e.target.checked })} disabled={busy} />
            <span>Done</span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={form.allDay} onChange={(e) => toggleAllDay(e.target.checked)} disabled={busy} />
            <span>All day</span>
          </label>
        </div>

        <div className="field">
          <label htmlFor="ev-start">Starts</label>
          <input id="ev-start" type={inputType} value={form.start} onChange={(e) => setStart(e.target.value)} disabled={busy} required />
        </div>
        <div className="field">
          <label htmlFor="ev-end">Ends</label>
          <input id="ev-end" type={inputType} value={form.end} onChange={(e) => patch({ end: e.target.value })} disabled={busy} required />
        </div>
        <div className="field">
          <label htmlFor="ev-where">Location</label>
          <input id="ev-where" type="text" value={form.location} onChange={(e) => patch({ location: e.target.value })} disabled={busy} placeholder="Optional" />
        </div>
        <div className="field">
          <label htmlFor="ev-notes">Notes</label>
          <textarea id="ev-notes" rows={5} value={form.description} onChange={(e) => patch({ description: e.target.value })} disabled={busy} placeholder="Optional" />
        </div>

        {problem && (
          <p className="editor__problem" role="alert">
            {problem}
          </p>
        )}

        <div className="editor__actions">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create event'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>

        {editing && (
          <div className="editor__foot">
            {state.event.htmlLink && (
              <button type="button" className="linkbtn" onClick={() => onOpenExternal(state.event.htmlLink!)}>
                Open in Google Calendar
              </button>
            )}
            {confirmDelete ? (
              <span className="editor__confirm">
                Delete this event?
                <button type="button" className="btn btn--danger btn--sm" onClick={onDelete} disabled={busy}>
                  {busy ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="linkbtn linkbtn--danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                Delete event
              </button>
            )}
          </div>
        )}
      </form>
    </aside>
  )
}
