import { spawnSync } from 'node:child_process'

const [plugin, ...args] = process.argv.slice(2).filter((arg) => arg !== '--')
const target = plugin ? `tests/live/${plugin}.live.test.js` : 'tests/live'
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', target, ...args], { stdio: 'inherit' })

process.exitCode = result.status ?? 1
