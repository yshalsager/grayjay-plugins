import { promises as fs } from 'node:fs'
import { parseArgs } from 'node:util'

const registry_url = new URL('../plugins/registry.json', import.meta.url)

export const plugin_paths = (plugin) => ({
  entry_path: `src/plugins/${plugin.value}/index.js`,
  config_path: `plugins/${plugin.value}/${plugin.stem}Config.json`,
  script_path: `plugins/${plugin.value}/${plugin.stem}Script.js`,
  icon_path: `plugins/${plugin.value}/${plugin.stem}Icon.png`
})

export async function load_plugin_registry() {
  const plugins = JSON.parse(await fs.readFile(registry_url, 'utf8'))
  return plugins.map((plugin) => ({ ...plugin, ...plugin_paths(plugin) }))
}

export function select_plugins(plugins, values) {
  const selected_values = values.map((value) => value.trim()).filter(Boolean)
  if (!selected_values.length) return null
  if (selected_values.includes('all')) return plugins

  const selected = []
  for (const value of selected_values) {
    const plugin = plugins.find((item) => item.value === value)
    if (!plugin) throw new Error(`Unknown plugin: ${value}`)
    if (!selected.includes(plugin)) selected.push(plugin)
  }
  return selected
}

export function parse_plugin_args(args) {
  const { values } = parseArgs({
    args: args.filter((arg) => arg !== '--'),
    options: {
      plugin: { type: 'string', short: 'p', multiple: true },
      help: { type: 'boolean', short: 'h' }
    }
  })

  return {
    plugins: values.plugin?.flatMap((value) => value.split(',')) ?? [],
    help: values.help
  }
}

export const plugin_usage = (command, plugins) =>
  `Usage: pnpm run ${command} -- [--plugin ${plugins.map((plugin) => plugin.value).join('|')}|all]`

export const ensure_file = async (file_path) => {
  try {
    await fs.access(file_path)
  } catch {
    throw new Error(`Missing file: ${file_path}`)
  }
}

export const assert_fresh_script = async (plugin, suffix = '.') => {
  await Promise.all([ensure_file(plugin.entry_path), ensure_file(plugin.script_path)])
  const [source, script] = await Promise.all([fs.stat(plugin.entry_path), fs.stat(plugin.script_path)])
  if (source.mtimeMs > script.mtimeMs + 1000) {
    throw new Error(`${plugin.label} source is newer than generated script. Run pnpm run build -- --plugin ${plugin.value}${suffix}`)
  }
}
