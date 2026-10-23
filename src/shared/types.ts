/** A calendar event normalised for the UI. Dates are ISO datetimes for timed
 *  events and YYYY-MM-DD for all-day events (end is exclusive, as in Google). */
export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  location?: string
  allDay: boolean
  start: string
  end: string
  htmlLink?: string
  colorId?: string
  /** Ticked off. Kept on the event itself as a private extended property. */
  done: boolean
}

export interface EventInput {
  summary: string
  description?: string
  location?: string
  allDay: boolean
  start: string
  end: string
  /** Google colour id ('1'–'11'); undefined uses the calendar's default. */
  colorId?: string
  done?: boolean
}

export interface AuthState {
  signedIn: boolean
  email?: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export type ViewMode = 'week' | 'quarter'

/** A summary the user writes for one day. Stored only on this machine. */
export interface DayNote {
  text: string
  updatedAt: string
}

/** The bridge the preload script exposes as window.api. */
export interface Api {
  getAuthState(): Promise<AuthState>
  signIn(): Promise<AuthState>
  signOut(): Promise<void>
  listEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]>
  createEvent(input: EventInput): Promise<CalendarEvent>
  updateEvent(id: string, input: EventInput): Promise<CalendarEvent>
  deleteEvent(id: string): Promise<void>
  /** Tick an event off, or untick it, without touching anything else. */
  setEventDone(id: string, done: boolean): Promise<CalendarEvent>
  openExternal(url: string): Promise<void>
  /** Day summaries, keyed by YYYY-MM-DD, for an inclusive range. Local only. */
  getNotes(fromDay: string, toDay: string): Promise<Record<string, DayNote>>
  /** Save a day summary locally. Blank text removes it; returns null then. */
  saveNote(day: string, text: string): Promise<DayNote | null>
  /** Show the local summaries file in Explorer, for backups. */
  revealNotesFile(): Promise<void>
}
