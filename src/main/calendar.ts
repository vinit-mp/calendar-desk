import { calendar, type calendar_v3 } from '@googleapis/calendar'
import type { OAuth2Client } from 'google-auth-library'
import type { CalendarEvent, EventInput } from '../shared/types'

/** Change this to a specific calendar id to target a calendar other than the
 *  account's primary one. Listing calendars needs an extra scope, so the app
 *  keeps to one calendar on purpose. */
const CALENDAR_ID = 'primary'

/** Private extended properties are visible only to this OAuth client, so the
 *  tick travels with the event without showing up in Google's own UI. */
const DONE_KEY = 'calendarDeskDone'

const doneProps = (done: boolean): calendar_v3.Schema$Event['extendedProperties'] => ({
  private: { [DONE_KEY]: done ? 'true' : 'false' }
})

function api(auth: OAuth2Client): calendar_v3.Calendar {
  return calendar({ version: 'v3', auth })
}

function toEvent(e: calendar_v3.Schema$Event): CalendarEvent | null {
  if (!e.id) return null
  const start = e.start?.dateTime ?? e.start?.date
  const end = e.end?.dateTime ?? e.end?.date
  if (!start || !end) return null
  return {
    id: e.id,
    summary: e.summary?.trim() || '(No title)',
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    allDay: Boolean(e.start?.date),
    start,
    end,
    htmlLink: e.htmlLink ?? undefined,
    colorId: e.colorId ?? undefined,
    done: e.extendedProperties?.private?.[DONE_KEY] === 'true'
  }
}

/** Build a request body that works for both insert and patch. Explicit nulls
 *  matter for patch: they clear the other date form when an event switches
 *  between timed and all-day, and clear emptied text fields. */
function toBody(input: EventInput): calendar_v3.Schema$Event {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const when = (value: string): calendar_v3.Schema$EventDateTime =>
    input.allDay ? { date: value, dateTime: null, timeZone: null } : { dateTime: value, timeZone, date: null }
  return {
    summary: input.summary.trim(),
    description: input.description?.trim() || null,
    location: input.location?.trim() || null,
    start: when(input.start),
    end: when(input.end),
    // null on patch resets the event to the calendar's default colour.
    colorId: input.colorId || null,
    extendedProperties: doneProps(Boolean(input.done))
  }
}

/** Lists every event in [timeMin, timeMax), following pagination so a whole
 *  quarter comes back in one call from the renderer's point of view. */
export async function listEvents(auth: OAuth2Client, timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
  const items: calendar_v3.Schema$Event[] = []
  let pageToken: string | undefined
  do {
    const res = await api(auth).events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken
    })
    items.push(...(res.data.items ?? []))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken && items.length < 10_000)
  return items.map(toEvent).filter((e): e is CalendarEvent => e !== null)
}

/** Insert does not need the clearing nulls that patch does; drop them. */
function withoutNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutNulls) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, withoutNulls(v)])
    ) as T
  }
  return value
}

export async function createEvent(auth: OAuth2Client, input: EventInput): Promise<CalendarEvent> {
  const res = await api(auth).events.insert({ calendarId: CALENDAR_ID, requestBody: withoutNulls(toBody(input)) })
  const event = toEvent(res.data)
  if (!event) throw new Error('Google returned an incomplete event.')
  return event
}

export async function updateEvent(auth: OAuth2Client, id: string, input: EventInput): Promise<CalendarEvent> {
  const res = await api(auth).events.patch({ calendarId: CALENDAR_ID, eventId: id, requestBody: toBody(input) })
  const event = toEvent(res.data)
  if (!event) throw new Error('Google returned an incomplete event.')
  return event
}

/** Patch only the done flag; other private properties on the event are merged, not replaced. */
export async function setDone(auth: OAuth2Client, id: string, done: boolean): Promise<CalendarEvent> {
  const res = await api(auth).events.patch({ calendarId: CALENDAR_ID, eventId: id, requestBody: { extendedProperties: doneProps(done) } })
  const event = toEvent(res.data)
  if (!event) throw new Error('Google returned an incomplete event.')
  return event
}

export async function deleteEvent(auth: OAuth2Client, id: string): Promise<void> {
  await api(auth).events.delete({ calendarId: CALENDAR_ID, eventId: id })
}
