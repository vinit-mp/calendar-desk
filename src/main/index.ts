/// <reference types="electron-vite/node" />
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { GoogleAuth } from './auth'
import * as cal from './calendar'
import * as notes from './notes'
import type { EventInput, IpcResult } from '../shared/types'

const googleAuth = new GoogleAuth()

// Matches the --bg and --ink tokens in the renderer so the native caption
// buttons blend into the custom title bar.
const TITLE_BAR = {
  light: { color: '#eef0f4', symbolColor: '#15181f' },
  dark: { color: '#15171c', symbolColor: '#e8eaef' }
} as const

function titleBarColors(): { color: string; symbolColor: string; height: number } {
  return { ...(nativeTheme.shouldUseDarkColors ? TITLE_BAR.dark : TITLE_BAR.light), height: 44 }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: titleBarColors().color,
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarColors(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  const onTheme = (): void => {
    if (!win.isDestroyed()) win.setTitleBarOverlay(titleBarColors())
  }
  nativeTheme.on('updated', onTheme)
  win.on('closed', () => nativeTheme.off('updated', onTheme))

  // Anything that tries to open a new window goes to the system browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

// ---------- IPC ----------

function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; errors?: { message?: string }[]; response?: { data?: { error?: { message?: string } | string } } }
    const fromApi = e.errors?.[0]?.message
    if (fromApi) return fromApi
    const data = e.response?.data?.error
    if (typeof data === 'string') return data
    if (data?.message) return data.message
    if (e.message) return e.message
  }
  return 'Something went wrong.'
}

function isRevokedGrant(err: unknown): boolean {
  const msg = describeError(err)
  return /invalid_grant|invalid_rapt|Token has been expired or revoked/i.test(msg)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handle<T>(channel: string, fn: (...args: any[]) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      if (isRevokedGrant(err)) {
        await googleAuth.signOut()
        return { ok: false, error: 'Your Google sign-in has expired. Sign in again to continue.' }
      }
      return { ok: false, error: describeError(err) }
    }
  })
}

function registerIpc(): void {
  handle('auth:state', async () => googleAuth.getState())
  handle('auth:signIn', () => googleAuth.signIn())
  handle('auth:signOut', () => googleAuth.signOut())

  handle('events:list', (timeMin: string, timeMax: string) => cal.listEvents(googleAuth.getClient(), timeMin, timeMax))
  handle('events:create', (input: EventInput) => cal.createEvent(googleAuth.getClient(), input))
  handle('events:update', (id: string, input: EventInput) => cal.updateEvent(googleAuth.getClient(), id, input))
  handle('events:delete', (id: string) => cal.deleteEvent(googleAuth.getClient(), id))
  handle('events:setDone', (id: string, done: boolean) => cal.setDone(googleAuth.getClient(), id, done))

  // Day summaries never touch the network: plain JSON in the app's user-data folder.
  handle('notes:range', (fromDay: string, toDay: string) => notes.getRange(fromDay, toDay))
  handle('notes:save', (day: string, text: string) => notes.save(day, text))
  handle('notes:reveal', () => notes.reveal())

  handle('shell:openExternal', async (url: string) => {
    if (!/^https:\/\//i.test(url)) throw new Error('Only https links can be opened.')
    await shell.openExternal(url)
  })
}

// ---------- lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(async () => {
    registerIpc()
    await googleAuth.restore()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
