/**
 * Builds the read-only MCP server into a single Node ESM file:
 *   dist-mcp/trace-mcp.mjs
 * Version comes from package.json, like the app itself.
 */
import { defineConfig } from 'vite'
import path from 'path'
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    ssr: 'src/mcp/cli.ts',
    outDir: 'dist-mcp',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: {
      output: { entryFileNames: 'trace-mcp.mjs', format: 'es' },
    },
  },
  ssr: {
    // Bundle runtime deps (js-yaml, zod) so the file runs without node_modules.
    noExternal: true,
  },
})
