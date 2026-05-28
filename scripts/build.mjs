import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { ensure_file, load_plugin_registry, parse_plugin_args, plugin_usage, select_plugins } from './plugin-registry.mjs'

export const strip_region_comments = () => ({
  name: 'grayjay-strip-region-comments',
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk') continue
      chunk.code = chunk.code
        .replace(/^\s*\/\/#region .*$/gm, '')
        .replace(/^\s*\/\/#endregion\s*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
    }
  }
})

export const build_plugin = async (plugin) => {
  await ensure_file(plugin.entry_path)

  return build({
    configFile: false,
    logLevel: 'warn',
    plugins: [strip_region_comments()],
    build: {
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      lib: {
        entry: plugin.entry_path,
        name: `${plugin.stem}Plugin`,
        formats: ['iife']
      },
      rollupOptions: {
        output: {
          dir: dirname(plugin.script_path),
          entryFileNames: `${plugin.stem}Script.js`,
          extend: true
        }
      }
    }
  })
}

export const main = async (args = process.argv.slice(2)) => {
  const options = parse_plugin_args(args)
  const plugins = await load_plugin_registry()

  if (options.help) {
    console.log(plugin_usage('build', plugins))
    return
  }

  const selected_plugins = select_plugins(plugins, options.plugins) ?? plugins

  for (const plugin of selected_plugins) {
    await build_plugin(plugin)
    console.log(`Built ${plugin.label}: ${plugin.script_path}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
