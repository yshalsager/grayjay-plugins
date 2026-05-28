import { defineConfig } from 'vitest/config'
import { vite_aliases } from './scripts/vite-aliases.mjs'

export default defineConfig({
  resolve: {
    alias: vite_aliases
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.js'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    pool: 'forks',
    fileParallelism: false
  }
})
