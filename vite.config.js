import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { defineConfig } from 'vite'
import { build_plugin } from './scripts/build.mjs'
import { load_plugin_registry } from './scripts/plugin-registry.mjs'

const should_rebuild = (file) => {
  const path = relative(process.cwd(), file).replaceAll('\\', '/')
  return path === 'plugins/registry.json' || path.startsWith('src/')
}

const print_plugin_urls = (plugins, port) => {
  console.log('\nPlugin config URLs:')
  for (const plugin of plugins) {
    console.log(`http://127.0.0.1:${port}/plugins/${plugin.value}/${plugin.stem}Config.json`)
  }
  console.log('')
}

const dev_config_urls = (plugins) =>
  new Map(plugins.map((plugin) => [`/plugins/${plugin.value}/${plugin.stem}Config.json`, plugin.config_path]))

const serve_unsigned_configs = (server, plugins) => {
  const configs = dev_config_urls(plugins)

  server.middlewares.use(async (req, res, next) => {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const config_path = configs.get(pathname)
    if (!config_path) return next()

    const config = JSON.parse(await readFile(config_path, 'utf8'))
    delete config.scriptSignature
    delete config.scriptPublicKey

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(`${JSON.stringify(config, null, 2)}\n`)
  })
}

const grayjay_rebuild = () => {
  return {
    name: 'grayjay-rebuild',
    apply: 'serve',
    async configureServer(server) {
      const plugins = await load_plugin_registry()
      serve_unsigned_configs(server, plugins)
      let timer
      let pending = Promise.resolve()

      const rebuild_all = async () => {
        for (const plugin of plugins) {
          await build_plugin(plugin)
          console.log(`Built ${plugin.label}: ${plugin.script_path}`)
        }
      }

      const queue_rebuild = () => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          pending = pending.then(rebuild_all).catch((error) => console.error(error.message))
        }, 100)
      }

      await rebuild_all()
      server.httpServer?.once('listening', () => print_plugin_urls(plugins, server.config.server.port))
      server.watcher.on('change', (file) => {
        if (should_rebuild(file)) queue_rebuild()
      })
    }
  }
}

export default defineConfig({
  plugins: [grayjay_rebuild()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
    cors: true,
    hmr: false,
    watch: {
      usePolling: true,
      interval: 250
    }
  },
  build: {
    emptyOutDir: false,
    minify: false,
    sourcemap: false
  }
})
