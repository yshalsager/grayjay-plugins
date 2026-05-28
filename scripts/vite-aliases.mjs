import { fileURLToPath } from 'node:url'

export const vite_aliases = {
  '@lib': fileURLToPath(new URL('../src/lib', import.meta.url)),
  '@scripts': fileURLToPath(new URL('../scripts', import.meta.url)),
  '@tests': fileURLToPath(new URL('../tests', import.meta.url))
}
