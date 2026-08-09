import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves a project site from a subpath (/ClaudeCode/), so the
// built asset URLs have to be prefixed or every script 404s. Everything else
// — dev, preview, and the Tauri desktop shell, which loads from the
// filesystem root — wants the default '/'.
const base = process.env.INKWELL_BASE_PATH || '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]@tiptap[\\/]|[\\/]prosemirror-/.test(id)) return 'vendor-tiptap'
          if (/[\\/]react[\\/]|[\\/]react-dom[\\/]|[\\/]react-router/.test(id)) return 'vendor-react'
          if (/[\\/]@radix-ui[\\/]/.test(id)) return 'vendor-radix'
          if (/[\\/]@dnd-kit[\\/]/.test(id)) return 'vendor-dnd'
          if (/[\\/]dexie[\\/]/.test(id)) return 'vendor-dexie'
          if (/[\\/]firebase[\\/]|[\\/]@firebase[\\/]/.test(id)) return 'vendor-firebase'
          // three.js is only ever reached from the series screen, and it is
          // the single largest dependency in the app. Left in the catch-all
          // `vendor` chunk it would be downloaded by every visitor on first
          // paint; in its own chunk it is fetched the first time someone
          // opens a box set and never otherwise.
          if (/[\\/]three[\\/]/.test(id)) return 'vendor-three'
          // The export machinery, same reasoning as three.js: docx alone is
          // over a megabyte of source, and jszip/re2js ride with it. The
          // export dialog imports the builders dynamically; naming them here
          // keeps the catch-all `vendor` — which the entry loads at boot —
          // from swallowing them back in.
          if (/[\\/]docx[\\/]|[\\/]jszip[\\/]|[\\/]re2js[\\/]/.test(id)) return 'vendor-export'
          return 'vendor'
        },
      },
    },
  },
})
