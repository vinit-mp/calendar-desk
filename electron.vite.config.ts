import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Vite's React Fast Refresh injects an inline preamble in dev, which a strict
// CSP blocks. Relax script-src only while developing; production stays strict.
function devCsp(isDev: boolean): Plugin {
  return {
    name: 'dev-csp',
    transformIndexHtml(html: string) {
      return isDev ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") : html
    }
  }
}

export default defineConfig(({ command }) => ({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
    plugins: [react(), devCsp(command === 'serve')]
  }
}))
