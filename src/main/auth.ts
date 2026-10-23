import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { app, safeStorage, shell } from 'electron'
import { OAuth2Client, CodeChallengeMethod, type Credentials } from 'google-auth-library'
import type { AuthState } from '../shared/types'

const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email']

const CLIENT_ID = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID
const CLIENT_SECRET = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET

interface StoredAuth {
  tokens: Credentials
  email?: string
}

// ---------- token storage (DPAPI-encrypted on Windows via safeStorage) ----------

function tokenPath(): string {
  return path.join(app.getPath('userData'), 'google-auth.bin')
}

async function readStored(): Promise<StoredAuth | null> {
  try {
    const buf = await fs.readFile(tokenPath())
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      return JSON.parse(buf.toString('utf8')) as StoredAuth
    }
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(buf)
    const stored = JSON.parse(result) as StoredAuth
    // The OS rotated its key or offers a stronger one: re-save under the new one.
    if (shouldReEncrypt) await writeStored(stored)
    return stored
  } catch {
    return null
  }
}

async function writeStored(data: StoredAuth): Promise<void> {
  const json = JSON.stringify(data)
  const payload = (await safeStorage.isAsyncEncryptionAvailable())
    ? await safeStorage.encryptStringAsync(json)
    : Buffer.from(json, 'utf8')
  await fs.mkdir(path.dirname(tokenPath()), { recursive: true })
  await fs.writeFile(tokenPath(), payload)
}

// ---------- loopback redirect server ----------

function listenLoopback(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Could not open a local port for sign-in.'))
        return
      }
      resolve({ server, port: addr.port })
    })
  })
}

function resultPage(ok: boolean, message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Calendar Desk</title>
<body style="font:16px/1.5 'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#15181f;background:#eef0f4">
<div style="text-align:center;max-width:28rem;padding:2rem">
<p style="font-size:1.25rem;font-weight:600;margin:0 0 .5rem">${ok ? 'Signed in' : 'Sign-in did not complete'}</p>
<p style="margin:0;color:#5b5f6b">${message}</p></div>`
}

function waitForCode(server: http.Server, expectedState: string, timeoutMs = 5 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('Sign-in timed out. Try again.'))
    }, timeoutMs)

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const finish = (ok: boolean, message: string): void => {
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(resultPage(ok, message))
        clearTimeout(timer)
        server.close()
      }

      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      if (error) {
        finish(false, 'Google reported an error. Return to the app and try again.')
        reject(new Error(error === 'access_denied' ? 'Sign-in was cancelled.' : `Google returned: ${error}`))
        return
      }
      if (!code || state !== expectedState) {
        finish(false, 'The response could not be verified. Return to the app and try again.')
        reject(new Error('Sign-in response could not be verified.'))
        return
      }
      finish(true, 'You can close this tab and return to the app.')
      resolve(code)
    })
  })
}

function emailFromIdToken(idToken?: string | null): string | undefined {
  if (!idToken) return undefined
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.email === 'string' ? payload.email : undefined
  } catch {
    return undefined
  }
}

// ---------- public surface ----------

export class GoogleAuth {
  private client: OAuth2Client | null = null
  private email?: string

  private requireConfig(): { clientId: string; clientSecret: string } {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error(
        'Google OAuth client is not configured. Copy .env.example to .env, fill in MAIN_VITE_GOOGLE_CLIENT_ID and MAIN_VITE_GOOGLE_CLIENT_SECRET, then restart the app.'
      )
    }
    return { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }
  }

  private makeClient(redirectUri?: string): OAuth2Client {
    const { clientId, clientSecret } = this.requireConfig()
    const client = new OAuth2Client({ clientId, clientSecret, redirectUri })
    // Fired on the initial exchange and on every silent refresh. Google only
    // sends refresh_token once, so merge rather than replace before persisting.
    client.on('tokens', (tokens) => {
      const merged: Credentials = { ...client.credentials, ...tokens }
      void writeStored({ tokens: merged, email: this.email })
    })
    return client
  }

  /** Load a previous session from disk, if any. */
  async restore(): Promise<AuthState> {
    const stored = await readStored()
    if (!stored?.tokens?.refresh_token) return { signedIn: false }
    this.email = stored.email
    this.client = this.makeClient()
    this.client.setCredentials(stored.tokens)
    return this.getState()
  }

  getState(): AuthState {
    return { signedIn: this.client !== null, email: this.email }
  }

  getClient(): OAuth2Client {
    if (!this.client) throw new Error('Not signed in.')
    return this.client
  }

  /** Full browser sign-in: loopback redirect + PKCE, then persist the tokens. */
  async signIn(): Promise<AuthState> {
    this.requireConfig()
    const { server, port } = await listenLoopback()
    const redirectUri = `http://127.0.0.1:${port}/callback`
    const client = this.makeClient(redirectUri)
    const state = crypto.randomBytes(16).toString('hex')
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync()

    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256
    })

    await shell.openExternal(url)
    const code = await waitForCode(server, state)
    const { tokens } = await client.getToken({ code, codeVerifier })
    client.setCredentials(tokens)

    this.email = emailFromIdToken(tokens.id_token)
    this.client = client
    await writeStored({ tokens, email: this.email })
    return this.getState()
  }

  /** Forget the session locally and revoke the grant at Google (best effort). */
  async signOut(): Promise<void> {
    const client = this.client
    this.client = null
    this.email = undefined
    await fs.rm(tokenPath(), { force: true })
    if (client?.credentials.access_token) {
      try {
        await client.revokeCredentials()
      } catch {
        // Already revoked or offline. The local session is gone either way.
      }
    }
  }
}