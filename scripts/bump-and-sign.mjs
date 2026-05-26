#!/usr/bin/env zx

import { promises as node_fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { $ } from 'zx'
import { intro, outro, cancel, isCancel, multiselect, text, confirm, spinner } from '@clack/prompts'

$.verbose = false

const plugins = [
  {
    label: 'MP3Quran',
    value: 'mp3quran',
    config_path: 'plugins/mp3quran/Mp3QuranConfig.json',
    script_path: 'plugins/mp3quran/Mp3QuranScript.js'
  },
  {
    label: 'tvQuran',
    value: 'tvquran',
    config_path: 'plugins/tvquran/TvQuranConfig.json',
    script_path: 'plugins/tvquran/TvQuranScript.js'
  }
]

const modes = new Set(['bump', 'sign', 'sign-bump', 'both'])
const raw_args = process.argv.slice(2).filter((arg) => !arg.endsWith('.mjs'))

const usage = `Usage:
  pnpm run bump -- [options]
  pnpm run sign -- [options]
  pnpm run sign-bump -- [options]

Modes:
  bump       update selected plugin config versions and changelog entries
  sign       sign selected plugin scripts without changing versions
  sign-bump  bump selected plugin configs, then sign their scripts

Options:
  -p, --plugin <name>       plugin to process: mp3quran, tvquran, or all (repeatable, comma-separated)
  -k, --key <path>          signing private key path (default: $GRAYJAY_SIGN_KEY)
  -m, --message <text>      changelog entry for all selected plugins
  --message-file <path>     read changelog entry from file
  --message-mp3quran <text> changelog entry for MP3Quran
  --message-tvquran <text>  changelog entry for tvQuran
  --version <number>        set next version for all selected plugins
  --version-mp3quran <n>    set MP3Quran version
  --version-tvquran <n>     set tvQuran version
  -y, --yes                 skip confirmation prompt
  --dry-run                 print planned changes without writing files
  --no-input                fail instead of prompting for missing values
  -h, --help                show this help`

const parse_args = (args) => {
  const options = {
    plugins: [],
    messages: {},
    versions: {},
    yes: false,
    dry_run: false,
    no_input: false
  }
  let mode = null

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg === '--') continue

    if (!arg.startsWith('-') && !mode) {
      mode = arg
      continue
    }

    const read_value = () => {
      const value = args[i + 1]
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${arg}`)
      i += 1
      return value
    }

    if (arg === '-h' || arg === '--help') options.help = true
    else if (arg === '-p' || arg === '--plugin') options.plugins.push(...read_value().split(','))
    else if (arg.startsWith('--plugin=')) options.plugins.push(...arg.slice('--plugin='.length).split(','))
    else if (arg === '-k' || arg === '--key') options.key = read_value()
    else if (arg.startsWith('--key=')) options.key = arg.slice('--key='.length)
    else if (arg === '-m' || arg === '--message') options.message = read_value()
    else if (arg.startsWith('--message=')) options.message = arg.slice('--message='.length)
    else if (arg === '--message-file') options.message_file = read_value()
    else if (arg.startsWith('--message-file=')) options.message_file = arg.slice('--message-file='.length)
    else if (arg === '--message-mp3quran') options.messages.mp3quran = read_value()
    else if (arg.startsWith('--message-mp3quran=')) options.messages.mp3quran = arg.slice('--message-mp3quran='.length)
    else if (arg === '--message-tvquran') options.messages.tvquran = read_value()
    else if (arg.startsWith('--message-tvquran=')) options.messages.tvquran = arg.slice('--message-tvquran='.length)
    else if (arg === '--version') options.version = read_value()
    else if (arg.startsWith('--version=')) options.version = arg.slice('--version='.length)
    else if (arg === '--version-mp3quran') options.versions.mp3quran = read_value()
    else if (arg.startsWith('--version-mp3quran=')) options.versions.mp3quran = arg.slice('--version-mp3quran='.length)
    else if (arg === '--version-tvquran') options.versions.tvquran = read_value()
    else if (arg.startsWith('--version-tvquran=')) options.versions.tvquran = arg.slice('--version-tvquran='.length)
    else if (arg === '-y' || arg === '--yes') options.yes = true
    else if (arg === '--dry-run') options.dry_run = true
    else if (arg === '--no-input') options.no_input = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return { mode: mode || 'sign-bump', options }
}

const { mode: raw_mode, options } = parse_args(raw_args)
const mode = raw_mode === 'both' ? 'sign-bump' : raw_mode
const should_bump = ['bump', 'sign-bump'].includes(mode)
const should_sign = ['sign', 'sign-bump'].includes(mode)

if (options.help) {
  console.log(usage)
  process.exit(0)
}

if (!modes.has(raw_mode)) {
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
const mode_label = mode === 'sign-bump' ? 'sign-bump' : mode

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

const ensure_file = async (file_path) => {
  try {
    await node_fs.access(file_path)
  } catch {
    throw new Error(`Missing file: ${file_path}`)
  }
}

const parse_version = (value, label) => {
  const version = Number(value)
  if (!Number.isInteger(version) || version < 1) throw new Error(`${label} must be a positive integer`)
  return version
}

const selected_from_cli = () => {
  const values = options.plugins.map((value) => value.trim()).filter(Boolean)
  if (!values.length) return null
  if (values.includes('all')) return plugins

  const selected = []
  for (const value of values) {
    const plugin = plugins.find((item) => item.value === value)
    if (!plugin) throw new Error(`Unknown plugin: ${value}`)
    if (!selected.includes(plugin)) selected.push(plugin)
  }
  return selected
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
  intro(mode === 'sign-bump' ? 'Bump and sign Grayjay plugins' : `${mode[0].toUpperCase()}${mode.slice(1)} Grayjay plugins`)
}

const selected_plugins = selected_from_cli() ?? (options.no_input ? fail_or_prompt('Missing plugin selection') : null)

const prompt_plugins = async () => plugins.filter((plugin) => selected_values.includes(plugin.value))

let selected_values = null
let resolved_plugins = selected_plugins

if (!resolved_plugins) {
  selected_values = stop_if_cancelled(
    await multiselect({
      message: `Select plugins to ${mode === 'sign-bump' ? 'bump and sign' : mode}`,
      required: true,
      options: plugins.map((plugin) => ({ label: plugin.label, value: plugin.value }))
    })
  )
  resolved_plugins = await prompt_plugins()
}

const key_path = should_sign ? await resolve_key_path() : null
const public_key_path = key_path ? `${key_path}.pub` : null

if (should_sign) {
  await ensure_file(key_path)
  await ensure_file(public_key_path)
}

const changes = []

for (const plugin of resolved_plugins) {
  const config = await read_config(plugin.config_path)
  const version = Number(config.version)

  if (!Number.isInteger(version)) throw new Error(`${plugin.config_path} has a non-integer version`)

  const next_version = parse_version(options.versions[plugin.value] ?? options.version ?? version + 1, `${plugin.label} version`)
  if (should_bump && next_version <= version)
    throw new Error(`${plugin.label} next version (${next_version}) must be greater than current version (${version})`)

  const changelog = should_bump ? await resolve_message(plugin, next_version) : null
  changes.push({ plugin, config, current_version: version, next_version, changelog })
}

const summary = changes
  .map((change) => (should_bump ? `${change.plugin.label} v${change.current_version} -> v${change.next_version}` : change.plugin.label))
  .join(', ')

if (options.dry_run) {
  console.log(`${mode_label}: ${summary}`)
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
      message: `${mode === 'sign-bump' ? 'Bump and sign' : mode[0].toUpperCase() + mode.slice(1)} ${summary}?`,
      initialValue: true
    })
  )

  if (!confirmed) {
    cancel('No files changed')
    process.exit(0)
  }
}

const spin = options.no_input ? null : spinner()
spin?.start(mode === 'sign-bump' ? 'Bumping and signing plugins' : `${mode[0].toUpperCase()}${mode.slice(1)}ing plugins`)

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
