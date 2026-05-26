import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'

const plugins = [
  {
    label: 'MP3Quran',
    config_path: 'plugins/mp3quran/Mp3QuranConfig.json',
    script_path: 'plugins/mp3quran/Mp3QuranScript.js'
  },
  {
    label: 'tvQuran',
    config_path: 'plugins/tvquran/TvQuranConfig.json',
    script_path: 'plugins/tvquran/TvQuranScript.js'
  }
]

const check_script = (script_path) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', script_path], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`node --check failed: ${script_path}`))))
  })

for (const plugin of plugins) {
  await check_script(plugin.script_path)
  JSON.parse(await fs.readFile(plugin.config_path, 'utf8'))
  console.log(`Validated ${plugin.label}`)
}
