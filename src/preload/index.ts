import { contextBridge, ipcRenderer } from 'electron'
import type { Api, IpcResult } from '../shared/types'

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!result.ok) throw new Error(result.error)
  return result.data
}

const api: Api = {
  getAuthState: () => call('auth:state'),
  signIn: () => call('auth:signIn'),
  signOut: () => call('auth:signOut'),
  listEvents: (timeMin, timeMax) => call('events:list', timeMin, timeMax),
  createEvent: (input) => call('events:create', input),
  updateEvent: (id, input) => call('events:update', id, input),
  deleteEvent: (id) => call('events:delete', id),
  setEventDone: (id, done) => call('events:setDone', id, done),
  openExternal: (url) => call('shell:openExternal', url),
  getNotes: (fromDay, toDay) => call('notes:range', fromDay, toDay),
  saveNote: (day, text) => call('notes:save', day, text),
  revealNotesFile: () => call('notes:reveal')
}

contextBridge.exposeInMainWorld('api', api)
