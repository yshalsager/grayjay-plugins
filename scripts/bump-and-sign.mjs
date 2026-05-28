#!/usr/bin/env zx

import { promises as node_fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { $ } from 'zx'
import { intro, outro, cancel, isCancel, multiselect, text, confirm, spinner } from '@clack/prompts'
import { assert_fresh_script, ensure_file, load_plugin_registry, select_plugins } from './plugin-registry.mjs'
import { build_plugin } from './build.mjs'

$.verbose = false

const mode_actions = {
  bump: [true, false],
  sign: [false, true],
  'sign-bump': [true, true],
  both: [true, true]
}
const raw_args = process.argv.slice(2).filter((arg) => arg !== '--' && !arg.endsWith('.mjs'))
const plugins = await load_plugin_registry()
const plugin_values = plugins.map((plugin) => plugin.value)
const plugin_choices = `${plugin_values.join(', ')}, or all`
const plugin_option_help = plugins
  .flatMap((plugin) => [
    `  --message-${plugin.value} <text> changelog entry for ${plugin.label}`,
    `  --version-${plugin.value} <n>    set ${plugin.label} version`
  ])
  .join('\n')

const usage = `Usage:
  pnpm run bump -- [options]
  pnpm run sign -- [options]
  pnpm run sign-bump -- [options]

Modes:
  bump       update selected plugin config versions and changelog entries
  sign       sign selected plugin scripts without changing versions
  sign-bump  bump selected plugin configs, then sign their scripts

Options:
  -p, --plugin <name>       plugin to process: ${plugin_choices} (repeatable, comma-separated)
  -k, --key <path>          signing private key path (default: $GRAYJAY_SIGN_KEY)
  -m, --message <text>      changelog entry for all selected plugins
  --message-file <path>     read changelog entry from file
  --version <number>        set next version for all selected plugins
${plugin_option_help}
  -y, --yes                 skip confirmation prompt
  --dry-run                 print planned changes without writing files
  --no-input                fail instead of prompting for missing values
  -h, --help                show this help`

const parse_args = (args) => {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      plugin: { type: 'string', short: 'p', multiple: true },
      key: { type: 'string', short: 'k' },
      message: { type: 'string', short: 'm' },
      'message-file': { type: 'string' },
      version: { type: 'string' },
      yes: { type: 'boolean', short: 'y' },
      'dry-run': { type: 'boolean' },
      'no-input': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      ...Object.fromEntries(plugin_values.map((plugin) => [`message-${plugin}`, { type: 'string' }])),
      ...Object.fromEntries(plugin_values.map((plugin) => [`version-${plugin}`, { type: 'string' }]))
    }
  })

  return {
    mode: positionals[0] ?? 'sign-bump',
    options: {
      plugins: values.plugin?.flatMap((value) => value.split(',')) ?? [],
      messages: Object.fromEntries(plugin_values.map((plugin) => [plugin, values[`message-${plugin}`]]).filter(([, value]) => value)),
      versions: Object.fromEntries(plugin_values.map((plugin) => [plugin, values[`version-${plugin}`]]).filter(([, value]) => value)),
      key: values.key,
      message: values.message,
      message_file: values['message-file'],
      version: values.version,
      yes: values.yes,
      dry_run: values['dry-run'],
      no_input: values['no-input'],
      help: values.help
    }
  }
}

const { mode: raw_mode, options } = parse_args(raw_args)
const mode = raw_mode === 'both' ? 'sign-bump' : raw_mode
const [should_bump, should_sign] = mode_actions[raw_mode] ?? []
const action_label = mode === 'sign-bump' ? 'Bump and sign' : `${mode[0].toUpperCase()}${mode.slice(1)}`
const progress_label = mode === 'sign-bump' ? 'Bumping and signing' : `${action_label}ing`

if (options.help) {
  console.log(usage)
  process.exit(0)
}

if (!mode_actions[raw_mode]) {
  console.error(`Unknown mode: ${raw_mode}\n\n${usage}`)
  process.exit(2)
}

const stop_if_cancelled = (value) => {
  if (!isCancel(value)) return value
  cancel('Cancelled')
  process.exit(0)
}

const fail_or_prompt = (message) => {
  if (options.no_input) throw new Error(`${message}. Re-run without --no-input or pass the required CLI option.`)
  return null
}

const expand_home = (value) => (value?.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value)

const read_config = async (config_path) => JSON.parse(await node_fs.readFile(config_path, 'utf8'))

const write_config = async (config_path, config) => {
  await node_fs.writeFile(config_path, `${JSON.stringify(config, null, 2)}\n`)
}

const read_public_key = async (public_key_path) => {
  const pem = await $`ssh-keygen -f ${public_key_path} -e -m pkcs8`.text()
  return pem
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('-----'))
    .join('')
}

const sign_script = async (key_path, script_path) => {
  return (await $`openssl dgst -sha512 -sign ${key_path} -binary ${script_path} | openssl base64 -A`.text()).trim()
}

const parse_version = (value, label) => {
  const version = Number(value)
  if (!Number.isInteger(version) || version < 1) throw new Error(`${label} must be a positive integer`)
  return version
}

const message_file_text = options.message_file ? (await node_fs.readFile(expand_home(options.message_file), 'utf8')).trim() : null

const resolve_message = async (plugin, next_version) => {
  const cli_message = options.messages[plugin.value] ?? options.message ?? message_file_text
  if (cli_message?.trim()) return cli_message.trim()
  fail_or_prompt(`Missing changelog message for ${plugin.value}`)
  return stop_if_cancelled(
    await text({
      message: `${plugin.label} changelog for v${next_version}`,
      placeholder: 'Describe the release in one concise line',
      validate: (value) => (value.trim() ? undefined : 'Enter a changelog entry')
    })
  ).trim()
}

const resolve_key_path = async () => {
  const cli_key = options.key ?? process.env.GRAYJAY_SIGN_KEY
  if (cli_key?.trim()) return expand_home(cli_key.trim())
  fail_or_prompt('Missing signing key path')
  return expand_home(
    stop_if_cancelled(
      await text({
        message: 'Signing private key',
        initialValue: '~/.ssh/ysh',
        validate: (value) => (value.trim() ? undefined : 'Enter a key path')
      })
    ).trim()
  )
}

if (!options.no_input) {
  intro(`${action_label} Grayjay plugins`)
}

const selected_plugins = select_plugins(plugins, options.plugins) ?? (options.no_input ? fail_or_prompt('Missing plugin selection') : null)
let resolved_plugins = selected_plugins

if (!resolved_plugins) {
  const selected_values = stop_if_cancelled(
    await multiselect({
      message: `Select plugins to ${mode === 'sign-bump' ? 'bump and sign' : mode}`,
      required: true,
      options: plugins.map((plugin) => ({ label: plugin.label, value: plugin.value }))
    })
  )
  resolved_plugins = select_plugins(plugins, selected_values)
}

const key_path = should_sign ? await resolve_key_path() : null
const public_key_path = key_path ? `${key_path}.pub` : null

if (should_sign) {
  await Promise.all([ensure_file(key_path), ensure_file(public_key_path)])
  if (!options.dry_run) for (const plugin of resolved_plugins) await build_plugin(plugin)
  await Promise.all(resolved_plugins.map((plugin) => assert_fresh_script(plugin, ' before signing.')))
}

const changes = await Promise.all(
  resolved_plugins.map(async (plugin) => {
    const config = await read_config(plugin.config_path)
    const version = Number(config.version)

    if (!Number.isInteger(version)) throw new Error(`${plugin.config_path} has a non-integer version`)

    const next_version = parse_version(options.versions[plugin.value] ?? options.version ?? version + 1, `${plugin.label} version`)
    if (should_bump && next_version <= version)
      throw new Error(`${plugin.label} next version (${next_version}) must be greater than current version (${version})`)

    const changelog = should_bump ? await resolve_message(plugin, next_version) : null
    return { plugin, config, current_version: version, next_version, changelog }
  })
)

const summary = changes
  .map((change) => (should_bump ? `${change.plugin.label} v${change.current_version} -> v${change.next_version}` : change.plugin.label))
  .join(', ')

if (options.dry_run) {
  console.log(`${mode}: ${summary}`)
  for (const change of changes) {
    if (should_bump) console.log(`${change.plugin.value}: ${change.changelog}`)
    if (should_sign) console.log(`${change.plugin.value}: sign ${change.plugin.script_path}`)
  }
  process.exit(0)
}

if (!options.yes) {
  if (options.no_input) throw new Error('Missing --yes for non-interactive write')
  const confirmed = stop_if_cancelled(
    await confirm({
      message: `${action_label} ${summary}?`,
      initialValue: true
    })
  )

  if (!confirmed) {
    cancel('No files changed')
    process.exit(0)
  }
}

const spin = options.no_input ? null : spinner()
spin?.start(`${progress_label} plugins`)

try {
  const public_key = should_sign ? await read_public_key(public_key_path) : null

  if (should_sign) {
    for (const change of changes) {
      change.signature = await sign_script(key_path, change.plugin.script_path)
    }
  }

  for (const change of changes) {
    if (should_bump) {
      change.config.version = change.next_version
      change.config.changelog ||= {}
      change.config.changelog[String(change.next_version)] = [change.changelog]
    }

    if (should_sign) {
      change.config.scriptPublicKey = public_key
      change.config.scriptSignature = change.signature
    }

    await write_config(change.plugin.config_path, change.config)
  }

  const output = changes
    .map((change) => (should_bump ? `${change.plugin.label} -> v${change.next_version}` : `${change.plugin.label} signed`))
    .join('\n')
  if (spin) {
    spin.stop('Updated plugin configs')
    outro(output)
  } else {
    console.log(output)
  }
} catch (error) {
  spin?.stop('Failed')
  throw error
}
