import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { load_plugin_registry, select_plugins } from './plugin-registry.mjs'

const usage = `Usage:
  node scripts/grayjay-dev-api.mjs logs [--target android|desktop] [--server-url URL] [--follow] [--index 0]
  node scripts/grayjay-dev-api.mjs http [--target android] [--server-url URL]
  node scripts/grayjay-dev-api.mjs remote-test --method getContentDetails --args '["url"]' [--server-url URL]
  node scripts/grayjay-dev-api.mjs load --plugin mp3quran [--target android|desktop] [--dev-url URL] [--server-url URL] [--follow]

Defaults:
  android URL: http://127.0.0.1:11337
  dev URL: http://127.0.0.1:3000
  desktop URL: read from Grayjay Desktop port file`

const endpoint_paths = {
  android: {
    logs: '/plugin/getDevLogs',
    http: '/plugin/getDevHttpExchanges',
    remote_test: '/plugin/remoteTest',
    load: '/plugin/loadDevPlugin'
  },
  desktop: {
    logs: '/Developer/getDevLogs',
    load: '/Developer/LoadDevPlugin',
    enable_dev: '/Sources/SourceEnable?id=DEV'
  }
}

async function get_json(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${url} failed ${response.status}: ${text}`)
  }

  return text ? JSON.parse(text) : null
}

async function post_json(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${url} failed ${response.status}: ${text}`)
  }

  try {
    return text ? JSON.parse(text) : null
  } catch {
    return text
  }
}

async function get_ok(url) {
  const response = await fetch(url)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${url} failed ${response.status}: ${text}`)
  }
  return text
}

async function desktop_server_url() {
  const port_file = join(homedir(), 'Library/Application Support/Grayjay/port')
  const port = (await readFile(port_file, 'utf8')).trim()
  return `http://127.0.0.1:${port}`
}

async function server_url(target, value) {
  if (value) return value.replace(/\/$/, '')
  if (target === 'desktop') return desktop_server_url()
  return 'http://127.0.0.1:11337'
}

function endpoint(target, name, base) {
  const path = endpoint_paths[target]?.[name]
  if (!path) throw new Error(`${name} is not supported for ${target}`)
  return `${base}${path}`
}

function parse_cli(args) {
  const { positionals, values } = parseArgs({
    args: args.filter((arg) => arg !== '--'),
    allowPositionals: true,
    options: {
      target: { type: 'string', short: 't', default: 'android' },
      'server-url': { type: 'string' },
      'dev-url': { type: 'string', default: 'http://127.0.0.1:3000' },
      plugin: { type: 'string', short: 'p', multiple: true },
      follow: { type: 'boolean', short: 'f' },
      'interval-ms': { type: 'string', default: '1000' },
      index: { type: 'string', default: '0' },
      method: { type: 'string' },
      args: { type: 'string', default: '[]' },
      help: { type: 'boolean', short: 'h' }
    }
  })

  return { command: positionals[0], values }
}

function require_target(target) {
  if (!['android', 'desktop'].includes(target)) {
    throw new Error(`Unsupported target: ${target}`)
  }
}

function print_logs(logs) {
  for (const entry of logs ?? []) {
    console.log(`[${entry.id}] ${entry.type} ${entry.log}`)
  }
}

async function logs(values) {
  const target = values.target
  require_target(target)
  const base = await server_url(target, values['server-url'])
  return follow_logs(target, base, Number(values.index), values.follow, Number(values['interval-ms']))
}

async function follow_logs(target, base, index, follow, interval) {
  do {
    const rows = await get_json(`${endpoint(target, 'logs', base)}?index=${index}`)
    print_logs(rows)
    if (rows?.length) index = Math.max(...rows.map((entry) => entry.id))
    if (follow) await sleep(interval)
  } while (follow)
}

async function http_exchanges(values) {
  const target = values.target
  require_target(target)
  if (target !== 'android') {
    throw new Error('http is only available on Android DevServer in the inspected Grayjay sources')
  }

  const base = await server_url(target, values['server-url'])
  const exchanges = await get_json(endpoint(target, 'http', base))
  console.log(JSON.stringify(exchanges, null, 2))
}

async function remote_test(values) {
  const target = values.target
  require_target(target)
  if (target !== 'android') {
    throw new Error('remote-test is only available on Android DevServer in the inspected Grayjay sources')
  }
  if (!values.method) {
    throw new Error('Missing --method')
  }

  const parameters = JSON.parse(values.args)
  if (!Array.isArray(parameters)) {
    throw new Error('--args must be a JSON array')
  }

  const base = await server_url(target, values['server-url'])
  const result = await get_json(`${endpoint(target, 'remote_test', base)}?method=${encodeURIComponent(values.method)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parameters)
  })
  console.log(JSON.stringify(result, null, 2))
}

async function load(values) {
  const target = values.target
  require_target(target)
  const base = await server_url(target, values['server-url'])
  const start_index = values.follow ? await latest_log_index(target, base) : Number(values.index)
  const plugins = select_plugins(await load_plugin_registry(), values.plugin?.flatMap((value) => value.split(',')) ?? ['mp3quran'])
  const dev_base = values['dev-url'].replace(/\/$/, '')

  for (const plugin of plugins) {
    const config = await dev_config(plugin, dev_base)
    const dev_id = await post_json(endpoint(target, 'load', base), config)
    if (target === 'desktop') {
      await get_ok(endpoint(target, 'enable_dev', base))
    }
    console.log(`Loaded ${plugin.label} as DEV (${dev_id}) into ${base}`)
  }

  if (values.follow) {
    await follow_logs(target, base, start_index, true, Number(values['interval-ms']))
  }
}

async function dev_config(plugin, dev_base) {
  const config = JSON.parse(await readFile(plugin.config_path, 'utf8'))
  const source_url = `${dev_base}/${plugin.config_path}`
  const script_url = new URL(config.scriptUrl, source_url)
  script_url.searchParams.set('x', String(Date.now()))

  config.sourceUrl = source_url
  config.scriptUrl = script_url.href
  delete config.scriptSignature
  delete config.scriptPublicKey
  return config
}

async function latest_log_index(target, base) {
  const rows = await get_json(`${endpoint(target, 'logs', base)}?index=0`)
  return rows?.length ? Math.max(...rows.map((entry) => entry.id)) : 0
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function main(args = process.argv.slice(2)) {
  const { command, values } = parse_cli(args)
  if (values.help || !command) {
    console.log(usage)
    return
  }

  if (command === 'logs') return logs(values)
  if (command === 'http') return http_exchanges(values)
  if (command === 'remote-test') return remote_test(values)
  if (command === 'load') return load(values)
  throw new Error(`Unknown command: ${command}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main()
  } catch (e) {
    console.error(`Error: ${e.message}`)
    process.exitCode = 1
  }
}
