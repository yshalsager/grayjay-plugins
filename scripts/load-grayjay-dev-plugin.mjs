import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { load_plugin_registry, select_plugins } from './plugin-registry.mjs'

const usage =
  'Usage: node scripts/load-grayjay-dev-plugin.mjs --plugin archiveorg [--dev-url http://127.0.0.1:3000] [--server-url http://127.0.0.1:11338]'

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

  return text
}

async function get_ok(url) {
  const response = await fetch(url)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${url} failed ${response.status}: ${text}`)
  }

  return text
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: args.filter((arg) => arg !== '--'),
    options: {
      plugin: { type: 'string', short: 'p', multiple: true },
      'dev-url': { type: 'string', default: 'http://127.0.0.1:3000' },
      'server-url': { type: 'string', default: 'http://127.0.0.1:11338' },
      help: { type: 'boolean', short: 'h' }
    }
  })

  if (values.help) {
    console.log(usage)
    return
  }

  const plugins = select_plugins(await load_plugin_registry(), values.plugin?.flatMap((value) => value.split(',')) ?? ['archiveorg'])
  const dev_base = values['dev-url'].replace(/\/$/, '')
  const server_base = values['server-url'].replace(/\/$/, '')

  for (const plugin of plugins) {
    const config = JSON.parse(await readFile(plugin.config_path, 'utf8'))
    const source_url = `${dev_base}/${plugin.config_path}`
    config.sourceUrl = source_url
    const script_url = new URL(config.scriptUrl, source_url)
    script_url.searchParams.set('x', String(Date.now()))
    config.scriptUrl = script_url.href

    const dev_id = await post_json(`${server_base}/Developer/LoadDevPlugin`, config)
    await get_ok(`${server_base}/Sources/SourceEnable?id=DEV`)
    console.log(`Loaded ${plugin.label} as DEV (${dev_id}) into ${server_base}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
