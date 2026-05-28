import { randomUUID } from 'node:crypto'
import { constants as fs_constants, promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cancel, confirm, intro, isCancel, outro, text } from '@clack/prompts'
import { build_plugin } from './build.mjs'
import { plugin_paths } from './plugin-registry.mjs'

const registry_url = new URL('../plugins/registry.json', import.meta.url)
const template_url = new URL('./templates/scaffold/', import.meta.url)

const defaults = {
  author: 'yshalsager',
  author_url: 'https://github.com/yshalsager',
  repository_url: 'https://github.com/yshalsager/grayjay-plugins'
}

const parse_args = (args) => {
  const options = {
    ...defaults,
    dry_run: false,
    no_input: false,
    yes: false
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    const read_value = () => {
      const value = args[i + 1]
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${arg}`)
      i += 1
      return value
    }

    if (arg === '--') continue
    else if (arg === '--value') options.value = read_value()
    else if (arg.startsWith('--value=')) options.value = arg.slice('--value='.length)
    else if (arg === '--label') options.label = read_value()
    else if (arg.startsWith('--label=')) options.label = arg.slice('--label='.length)
    else if (arg === '--stem') options.stem = read_value()
    else if (arg.startsWith('--stem=')) options.stem = arg.slice('--stem='.length)
    else if (arg === '--platform-url') options.platform_url = read_value()
    else if (arg.startsWith('--platform-url=')) options.platform_url = arg.slice('--platform-url='.length)
    else if (arg === '--icon-url') options.icon_url = read_value()
    else if (arg.startsWith('--icon-url=')) options.icon_url = arg.slice('--icon-url='.length)
    else if (arg === '--description') options.description = read_value()
    else if (arg.startsWith('--description=')) options.description = arg.slice('--description='.length)
    else if (arg === '--author') options.author = read_value()
    else if (arg.startsWith('--author=')) options.author = arg.slice('--author='.length)
    else if (arg === '--author-url') options.author_url = read_value()
    else if (arg.startsWith('--author-url=')) options.author_url = arg.slice('--author-url='.length)
    else if (arg === '--repository-url') options.repository_url = read_value()
    else if (arg.startsWith('--repository-url=')) options.repository_url = arg.slice('--repository-url='.length)
    else if (arg === '--dry-run') options.dry_run = true
    else if (arg === '--no-input') options.no_input = true
    else if (arg === '-y' || arg === '--yes') options.yes = true
    else if (arg === '-h' || arg === '--help') options.help = true
    else if (!options.value) options.value = arg
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

const usage = `Usage:
  pnpm run scaffold
  pnpm run scaffold -- --value <name> --label <label> --stem <FileStem> --platform-url <url> [options]

Options:
  --description <text>     plugin description
  --icon-url <url>         config iconUrl (default: <platform origin>/favicon.ico)
  --author <name>          config author (default: yshalsager)
  --author-url <url>       config authorUrl
  --repository-url <url>   config repositoryUrl
  --dry-run                print planned files without writing
  --no-input               fail instead of prompting for missing values
  -y, --yes                skip confirmation prompt
  -h, --help               show this help`

const validate_value = (value) => (/^[a-z0-9][a-z0-9-]*$/.test(value) ? undefined : 'Use lowercase kebab-case with a-z, 0-9, and hyphen')

const validate_stem = (value) => (/^[A-Z][A-Za-z0-9]*$/.test(value) ? undefined : 'Use PascalCase, for example Midad or IslamWay')

const validate_url = (value) => {
  try {
    new URL(value)
    return undefined
  } catch {
    return 'Enter a valid URL'
  }
}

const stop_if_cancelled = (value) => {
  if (!isCancel(value)) return value
  cancel('Cancelled')
  process.exit(0)
}

const prompt_value = async (options, key, prompt_options) => {
  const existing = options[key]?.trim()
  if (existing) return existing
  if (options.no_input) throw new Error(`Missing required option: --${key.replace(/_/g, '-')}`)
  return stop_if_cancelled(await text(prompt_options)).trim()
}

const optional_prompt_value = async (options, key, prompt_options) => {
  const existing = options[key]?.trim()
  if (existing || options.no_input) return existing ?? ''
  const value = stop_if_cancelled(await text(prompt_options)).trim()
  return value
}

const file_exists = async (file_path) => {
  try {
    await fs.access(file_path, fs_constants.F_OK)
    return true
  } catch {
    return false
  }
}

const write_file = async (file_path, content, options) => {
  if (options.dry_run) {
    console.log(`create ${file_path}`)
    return
  }

  if (await file_exists(file_path)) {
    throw new Error(`Refusing to overwrite existing file: ${file_path}`)
  }

  await fs.mkdir(dirname(file_path), { recursive: true })
  await fs.writeFile(file_path, content)
}

const read_template = async (name) => fs.readFile(new URL(name, template_url), 'utf8')

const render_template = async (name, values) => {
  let output = await read_template(name)
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`__${key}__`, value)
  }
  return output
}

const json_value = (value) => JSON.stringify(value)

const template_values = (plugin) => ({
  ALLOW_HOST_JSON: json_value(new URL(plugin.platform_url).hostname),
  AUTHOR_JSON: json_value(plugin.author),
  AUTHOR_URL_JSON: json_value(plugin.author_url),
  CHANGELOG_ENTRY_JSON: json_value(`Initial ${plugin.label} scaffold.`),
  DEFAULT_ICON_JSON: json_value(plugin.icon_url.startsWith('http') ? plugin.icon_url : `./${plugin.stem}Icon.png`),
  DESCRIPTION_JSON: json_value(plugin.description),
  ICON_URL_JSON: json_value(plugin.icon_url),
  ID_JSON: json_value(randomUUID()),
  LABEL: plugin.label,
  LABEL_JSON: json_value(plugin.label),
  PLATFORM_URL_JSON: json_value(plugin.platform_url),
  REPOSITORY_URL_JSON: json_value(plugin.repository_url),
  SCRIPT_URL_JSON: json_value(`./${plugin.stem}Script.js`),
  SOURCE_URL_JSON: json_value(
    `https://raw.githubusercontent.com/yshalsager/grayjay-plugins/master/plugins/${plugin.value}/${plugin.stem}Config.json`
  ),
  VALUE: plugin.value,
  VALUE_JSON: json_value(plugin.value)
})

const resolve_plugin = async (options) => {
  const value = await prompt_value(options, 'value', {
    message: 'Plugin value',
    placeholder: 'midad',
    validate: validate_value
  })

  const label = await prompt_value(options, 'label', {
    message: 'Plugin label',
    placeholder: 'Midad',
    initialValue: value
      .split('-')
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' '),
    validate: (input) => (input.trim() ? undefined : 'Enter a label')
  })

  const stem = await prompt_value(options, 'stem', {
    message: 'File stem',
    placeholder: 'Midad',
    initialValue: label.replace(/[^A-Za-z0-9]+/g, ''),
    validate: validate_stem
  })

  const platform_url = await prompt_value(options, 'platform_url', {
    message: 'Platform URL',
    placeholder: 'https://midad.com',
    validate: validate_url
  })

  const platform_origin = new URL(platform_url).origin
  const description = await optional_prompt_value(options, 'description', {
    message: 'Description',
    initialValue: `${label} Grayjay plugin.`
  })

  const icon_url = await optional_prompt_value(options, 'icon_url', {
    message: 'Icon URL',
    initialValue: `${platform_origin}/favicon.ico`,
    validate: (input) => (input.trim() ? validate_url(input) : undefined)
  })

  return {
    value,
    label,
    stem,
    platform_url,
    description: description || `${label} Grayjay plugin.`,
    icon_url: icon_url || `${platform_origin}/favicon.ico`,
    author: options.author,
    author_url: options.author_url,
    repository_url: options.repository_url
  }
}

export const main = async (args = process.argv.slice(2)) => {
  const options = parse_args(args)
  if (options.help) {
    console.log(usage)
    return
  }

  if (!options.no_input) {
    intro('Scaffold Grayjay plugin')
  }

  const plugin = await resolve_plugin(options)
  const registry = JSON.parse(await fs.readFile(registry_url, 'utf8'))
  if (registry.some((item) => item.value === plugin.value || item.stem === plugin.stem)) {
    throw new Error(`Plugin already exists in registry: ${plugin.value} / ${plugin.stem}`)
  }

  const paths = plugin_paths(plugin)
  const values = template_values(plugin)
  const files = [
    [paths.config_path, await render_template('config.json.tpl', values)],
    [paths.entry_path, await render_template('source-index.js.tpl', values)],
    [`tests/live/${plugin.value}.live.test.js`, await render_template('live-test.js.tpl', values)]
  ]

  if (!options.yes && !options.dry_run) {
    if (options.no_input) throw new Error('Missing --yes for non-interactive scaffold')
    const confirmed = stop_if_cancelled(
      await confirm({
        message: `Create ${plugin.label} plugin scaffold?`,
        initialValue: true
      })
    )
    if (!confirmed) {
      cancel('No files changed')
      return
    }
  }

  for (const [file_path, content] of files) {
    await write_file(file_path, content, options)
  }

  const next_registry = [...registry, { value: plugin.value, label: plugin.label, stem: plugin.stem }]
  if (options.dry_run) {
    console.log(`build ${paths.script_path}`)
    console.log(`update ${registry_url.pathname}`)
  } else {
    await build_plugin({ ...plugin, ...paths })
    await fs.writeFile(registry_url, `${JSON.stringify(next_registry, null, 2)}\n`)
  }

  if (options.no_input) {
    console.log(`Scaffolded ${plugin.label}`)
  } else {
    outro(`Scaffolded ${plugin.label}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
