import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthState, CalendarEvent, DayNote, EventInput, ViewMode } from '../../shared/types'
import { addDays, addMonths, dateKey, fmtQuarterRange, fmtWeekRange, isSameDay, nextHalfHour, parseDateKey, startOfDay, startOfQuarter, startOfWeek } from './lib/dates'
import { eventsOnDay } from './lib/events'
import SignIn from './components/SignIn'
import TopBar from './components/TopBar'
import WeekGrid from './components/WeekGrid'
import QuarterGrid from './components/QuarterGrid'
import DayPanel from './components/DayPanel'
import EventEditor, { type EditorState } from './components/EventEditor'

const HOUR = 60 * 60 * 1000

/** What the right-hand panel is showing. An event editor remembers the day
 *  panel it was opened from so closing it returns there. */
type Panel = { mode: 'day'; day: string } | (EditorState & { returnTo?: string })

function draftFor(day: Date): EventInput {
  const now = new Date()
  const start = isSameDay(day, now) ? nextHalfHour(now) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0)
  return { summary: '', allDay: false, start: start.toISOString(), end: new Date(start.getTime() + HOUR).toISOString() }
}

function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
}

export default function App(): React.JSX.Element {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [view, setView] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [notes, setNotes] = useState<Record<string, DayNote>>({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const requestId = useRef(0)

  /** Visible date range, [from, to). */
  const range = useMemo(() => {
    if (view === 'week') {
      const from = startOfWeek(anchor)
      return { from, to: addDays(from, 7) }
    }
    const from = startOfQuarter(anchor)
    return { from, to: addMonths(from, 3) }
  }, [view, anchor])

  /** Run an API call, surface its error, and notice if the session was dropped. */
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      setError(null)
      return await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      const state = await window.api.getAuthState().catch(() => null)
      if (state && !state.signedIn) {
        setAuth(state)
        setEvents([])
        setPanel(null)
      }
      return undefined
    }
  }, [])

  useEffect(() => {
    window.api
      .getAuthState()
      .then(setAuth)
      .catch((err: Error) => {
        setAuth({ signedIn: false })
        setError(err.message)
      })
  }, [])

  const load = useCallback(
    async (silent = false) => {
      const id = ++requestId.current
      if (!silent) setLoading(true)
      const [eventList, noteMap] = await Promise.all([
        run(() => window.api.listEvents(range.from.toISOString(), range.to.toISOString())),
        run(() => window.api.getNotes(dateKey(range.from), dateKey(addDays(range.to, -1))))
      ])
      if (id !== requestId.current) return
      if (eventList) setEvents(eventList)
      if (noteMap) setNotes(noteMap)
      setLoading(false)
    },
    [range, run]
  )

  useEffect(() => {
    if (auth?.signedIn) void load()
  }, [auth?.signedIn, load])

  // ---------- navigation ----------

  const navigate = (next: (d: Date) => Date): void => {
    setAnchor(next)
    setPanel((p) => (p?.mode === 'day' ? null : p))
  }
  const goPrev = (): void => navigate((d) => (view === 'week' ? addDays(startOfWeek(d), -7) : addMonths(startOfQuarter(d), -3)))
  const goNext = (): void => navigate((d) => (view === 'week' ? addDays(startOfWeek(d), 7) : addMonths(startOfQuarter(d), 3)))
  const goToday = (): void => navigate(() => startOfDay(new Date()))

  const switchView = (next: ViewMode): void => {
    // Keep an open day in view when the range changes shape.
    if (panel?.mode === 'day') setAnchor(parseDateKey(panel.day))
    setView(next)
  }

  const openDay = (day: Date): void => {
    setAnchor(startOfDay(day))
    setPanel({ mode: 'day', day: dateKey(day) })
  }
  const openWeekAt = (day: Date): void => {
    setAnchor(startOfDay(day))
    setView('week')
  }

  const closePanel = (): void => {
    setPanel((p) => (p && p.mode !== 'day' && p.returnTo ? { mode: 'day', day: p.returnTo } : null))
  }

  // Keyboard: ← → move, T today, W/Q switch view, Esc closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && panel && !busy) {
        closePanel()
        return
      }
      if ((panel && panel.mode !== 'day') || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      switch (e.key) {
        case 'ArrowLeft':
          goPrev()
          break
        case 'ArrowRight':
          goNext()
          break
        case 't':
        case 'T':
          goToday()
          break
        case 'w':
        case 'W':
          switchView('week')
          break
        case 'q':
        case 'Q':
          switchView('quarter')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---------- auth ----------

  const signIn = async (): Promise<void> => {
    setBusy(true)
    const state = await run(() => window.api.signIn())
    if (state) setAuth(state)
    setBusy(false)
  }

  const signOut = async (): Promise<void> => {
    setBusy(true)
    await run(() => window.api.signOut())
    setAuth({ signedIn: false })
    setEvents([])
    setPanel(null)
    setBusy(false)
  }

  // ---------- events ----------

  const save = async (input: EventInput): Promise<void> => {
    if (!panel || panel.mode === 'day') return
    setBusy(true)
    const saved = await run(() => (panel.mode === 'create' ? window.api.createEvent(input) : window.api.updateEvent(panel.event.id, input)))
    setBusy(false)
    if (!saved) return
    setEvents((list) => [...list.filter((e) => e.id !== saved.id), saved])
    closePanel()
    void load(true)
  }

  /** A click or drag on empty grid space opens the editor on that range. */
  const createRange = (start: Date, end: Date, allDay: boolean): void => {
    const draft: EventInput = allDay
      ? { summary: '', allDay, start: dateKey(start), end: dateKey(end) }
      : { summary: '', allDay, start: start.toISOString(), end: end.toISOString() }
    setPanel((p) => ({ mode: 'create', draft, returnTo: p?.mode === 'day' ? p.day : p?.returnTo }))
  }

  /** Drag-to-move and drag-to-resize: show the new times at once, roll back if Google refuses. */
  const move = async (event: CalendarEvent, start: string, end: string): Promise<void> => {
    const moved = { ...event, start, end }
    setEvents((list) => list.map((e) => (e.id === event.id ? moved : e)))
    setPanel((p) => (p?.mode === 'edit' && p.event.id === event.id ? { ...p, event: moved } : p))
    const saved = await run(() =>
      window.api.updateEvent(event.id, {
        summary: event.summary === '(No title)' ? '' : event.summary,
        description: event.description,
        location: event.location,
        allDay: event.allDay,
        start,
        end,
        colorId: event.colorId,
        done: event.done
      })
    )
    const result = saved ?? event
    setEvents((list) => list.map((e) => (e.id === event.id ? result : e)))
    setPanel((p) => (p?.mode === 'edit' && p.event.id === event.id ? { ...p, event: result } : p))
  }

  /** Tick or untick from the grid or day panel: flip at once, roll back if Google refuses. */
  const toggleDone = async (event: CalendarEvent): Promise<void> => {
    const flip = (done: boolean): void => {
      setEvents((list) => list.map((e) => (e.id === event.id ? { ...e, done } : e)))
      setPanel((p) => (p?.mode === 'edit' && p.event.id === event.id ? { ...p, event: { ...p.event, done } } : p))
    }
    flip(!event.done)
    const saved = await run(() => window.api.setEventDone(event.id, !event.done))
    flip(saved ? saved.done : event.done)
  }

  const remove = async (): Promise<void> => {
    if (!panel || panel.mode !== 'edit') return
    const { id } = panel.event
    setBusy(true)
    const ok = await run(async () => {
      await window.api.deleteEvent(id)
      return true
    })
    setBusy(false)
    if (!ok) return
    setEvents((list) => list.filter((e) => e.id !== id))
    closePanel()
  }

  // ---------- local day summaries ----------

  const saveNote = useCallback(
    async (day: string, text: string): Promise<DayNote | null | undefined> => {
      const saved = await run(() => window.api.saveNote(day, text))
      if (saved === undefined) return undefined
      setNotes((map) => {
        const next = { ...map }
        if (saved) next[day] = saved
        else delete next[day]
        return next
      })
      return saved
    },
    [run]
  )

  // ---------- render ----------

  if (auth === null) return <div className="boot" aria-busy="true" />
  if (!auth.signedIn) return <SignIn onSignIn={signIn} busy={busy} error={error} />

  const openDayKey = panel?.mode === 'day' ? panel.day : panel?.returnTo
  const selectedId = panel?.mode === 'edit' ? panel.event.id : undefined

  return (
    <div className={`app${panel ? ' app--panel' : ''}`}>
      <TopBar
        view={view}
        rangeLabel={view === 'week' ? fmtWeekRange(range.from) : fmtQuarterRange(range.from)}
        loading={loading}
        email={auth.email}
        onView={switchView}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        onNew={() => setPanel({ mode: 'create', draft: draftFor(new Date()) })}
        onSignOut={signOut}
      />

      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button type="button" className="banner__retry" onClick={() => void load()}>
            Try again
          </button>
          <button type="button" className="banner__close" aria-label="Dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {view === 'week' ? (
        <WeekGrid
          weekStart={range.from}
          events={events}
          notes={notes}
          loading={loading && events.length === 0}
          selectedId={selectedId}
          openDay={openDayKey}
          onSelect={(event) => setPanel({ mode: 'edit', event })}
          draft={panel?.mode === 'create' ? panel.draft : undefined}
          onCreate={(day) => setPanel({ mode: 'create', draft: draftFor(day) })}
          onCreateRange={createRange}
          onMove={(event, start, end) => void move(event, start, end)}
          onToggleDone={(event) => void toggleDone(event)}
          onOpenDay={openDay}
        />
      ) : (
        <QuarterGrid quarterStart={range.from} events={events} notes={notes} loading={loading} openDay={openDayKey} onOpenDay={openDay} />
      )}

      {panel?.mode === 'day' && (
        <DayPanel
          key={panel.day}
          day={parseDateKey(panel.day)}
          events={eventsOnDay(events, parseDateKey(panel.day))}
          note={notes[panel.day]}
          onSaveNote={saveNote}
          onSelect={(event) => setPanel({ mode: 'edit', event, returnTo: panel.day })}
          onToggleDone={(event) => void toggleDone(event)}
          onCreate={(day) => setPanel({ mode: 'create', draft: draftFor(day), returnTo: panel.day })}
          onOpenWeek={view === 'quarter' ? openWeekAt : undefined}
          onClose={() => setPanel(null)}
          onReveal={() => void run(() => window.api.revealNotesFile())}
        />
      )}

      {panel && panel.mode !== 'day' && (
        <EventEditor
          key={panel.mode === 'edit' ? `${panel.event.id}-${panel.event.start}-${panel.event.end}-${panel.event.done}` : `new-${panel.draft.start}-${panel.draft.end}`}
          state={panel}
          busy={busy}
          onClose={closePanel}
          onSave={save}
          onDelete={remove}
          onOpenExternal={(url) => void run(() => window.api.openExternal(url))}
        />
      )}
    </div>
  )
}
