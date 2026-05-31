import { dirname } from 'node:path'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { ensure_file, load_plugin_registry, parse_plugin_args, plugin_usage, select_plugins } from './plugin-registry.mjs'
import { vite_aliases } from './vite-aliases.mjs'

const debug_tests_enabled = () => process.env.GRAYJAY_DEBUG_TESTS === '1'

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

  const result = await build({
    configFile: false,
    logLevel: 'warn',
    plugins: [strip_region_comments()],
    define: {
      __GRAYJAY_DEBUG_TESTS__: JSON.stringify(debug_tests_enabled())
    },
    resolve: {
      alias: vite_aliases
    },
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

  if (!debug_tests_enabled()) {
    const code = await readFile(plugin.script_path, 'utf8')
    if (/GrayjayTests|define_grayjay_tests|home_first_detail_test|search_first_detail_test/.test(code)) {
      throw new Error(`Debug Grayjay tests leaked into release build: ${plugin.script_path}`)
    }
  }

  return result
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
