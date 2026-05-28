import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, basename } from 'node:path'
import {
  assert_fresh_script,
  ensure_file,
  load_plugin_registry,
  parse_plugin_args,
  plugin_usage,
  select_plugins
} from './plugin-registry.mjs'

const check_script = (script_path) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', script_path], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`node --check failed: ${script_path}`))))
  })

const relative_asset_path = (config_path, asset_url) => join(dirname(config_path), asset_url.replace(/^\.\//, ''))

const validate_config = async (plugin, config) => {
  if (config.scriptUrl && basename(config.scriptUrl) !== basename(plugin.script_path)) {
    throw new Error(`${plugin.config_path} scriptUrl does not match ${basename(plugin.script_path)}`)
  }

  if (config.iconUrl && !/^https?:\/\//.test(config.iconUrl)) {
    await ensure_file(relative_asset_path(plugin.config_path, config.iconUrl))
  }

  if (config.packages?.includes('Http') && !config.allowUrls?.length) {
    throw new Error(`${plugin.config_path} uses Http but has no allowUrls`)
  }
}

const validate_script_output = async (plugin) => {
  const script = await fs.readFile(plugin.script_path, 'utf8')
  if (/\bimport\s+/.test(script) || /\brequire\s*\(/.test(script)) {
    throw new Error(`${plugin.script_path} must not contain runtime import/require`)
  }
}

const options = parse_plugin_args(process.argv.slice(2))
const plugins = await load_plugin_registry()

if (options.help) {
  console.log(plugin_usage('validate', plugins))
  process.exit(0)
}

const selected_plugins = select_plugins(plugins, options.plugins) ?? plugins

for (const plugin of selected_plugins) {
  await ensure_file(plugin.config_path)
  await ensure_file(plugin.entry_path)
  await ensure_file(plugin.script_path)
  await check_script(plugin.entry_path)
  await check_script(plugin.script_path)
  await assert_fresh_script(plugin)
  const config = JSON.parse(await fs.readFile(plugin.config_path, 'utf8'))
  await validate_config(plugin, config)
  await validate_script_output(plugin)
  console.log(`Validated ${plugin.label}`)
}
