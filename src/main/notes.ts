import fs from 'node:fs/promises'
import path from 'node:path'
import { app, shell } from 'electron'
import type { DayNote } from '../shared/types'

/** Day summaries are deliberately local: one JSON file in the user-data
 *  folder, nothing synced, nothing sent to Google. Readable by hand, easy to
 *  back up, and written atomically (temp file + rename). */

interface NotesFile {
  version: 1
  notes: Record<string, DayNote>
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

export function notesPath(): string {
  return path.join(app.getPath('userData'), 'day-notes.json')
}

let cache: NotesFile | null = null
let queue: Promise<void> = Promise.resolve()

function assertDay(day: string): void {
  if (!DAY_KEY.test(day)) throw new Error(`Not a day key: ${day}`)
}

async function load(): Promise<NotesFile> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await fs.readFile(notesPath(), 'utf8')) as Partial<NotesFile>
    const notes = parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {}
    cache = { version: 1, notes }
  } catch {
    cache = { version: 1, notes: {} }
  }
  return cache
}

/** Serialise writes so two quick saves can never interleave on disk. */
function persist(data: NotesFile): Promise<void> {
  const snapshot = JSON.stringify(data, null, 2)
  const write = queue.then(async () => {
    const target = notesPath()
    const tmp = `${target}.tmp`
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(tmp, snapshot, 'utf8')
    await fs.rename(tmp, target)
  })
  queue = write.catch(() => undefined)
  return write
}

export async function getRange(fromDay: string, toDay: string): Promise<Record<string, DayNote>> {
  assertDay(fromDay)
  assertDay(toDay)
  const { notes } = await load()
  const out: Record<string, DayNote> = {}
  for (const [day, note] of Object.entries(notes)) {
    if (day >= fromDay && day <= toDay) out[day] = note
  }
  return out
}

export async function save(day: string, text: string): Promise<DayNote | null> {
  assertDay(day)
  const data = await load()
  if (!text.trim()) {
    if (!(day in data.notes)) return null
    delete data.notes[day]
    await persist(data)
    return null
  }
  const note: DayNote = { text, updatedAt: new Date().toISOString() }
  data.notes[day] = note
  await persist(data)
  return note
}

export async function reveal(): Promise<void> {
  const target = notesPath()
  try {
    await fs.access(target)
    shell.showItemInFolder(target)
  } catch {
    await shell.openPath(path.dirname(target))
  }
}
