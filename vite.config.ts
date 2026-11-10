import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'path'
import fs from 'node:fs'
import { createBuildId } from './build/buildId.ts'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const isElectron = process.env.ELECTRON === 'true'
const buildId = createBuildId()

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // YYYYMMDDHHMMSS-<git commit>, fixed once per build (see build/buildId.ts).
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    {
      // Version and Build ID in the static splash of index.html (same sources as the app).
      name: 'trace-html-version',
      transformIndexHtml: (html: string) => html.replace(/%TRACE_APP_VERSION%/g, pkg.version).replace(/%TRACE_BUILD_ID%/g, buildId),
    },
    ...(isElectron
      ? [
          electron([
            {
              entry: 'electron/main.ts',
              vite: {
                build: {
                  outDir: 'dist-electron',
                  rollupOptions: {
                    external: ['electron'],
                  },
                },
              },
            },
            {
              entry: 'electron/preload.ts',
              onstart(args) {
                args.reload()
              },
              vite: {
                build: {
                  lib: {
                    entry: 'electron/preload.ts',
                    formats: ['cjs'],
                    fileName: () => 'preload.cjs',
                  },
                  outDir: 'dist-electron',
                  rollupOptions: {
                    external: ['electron'],
                  },
                },
              },
            },
          ]),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
