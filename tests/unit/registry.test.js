import { describe, expect, it } from 'vitest'
import { load_plugin_registry, plugin_paths, select_plugins } from '@scripts/plugin-registry.mjs'

describe('plugin registry', () => {
  it('derives conventional paths from registry identity', async () => {
    const plugins = await load_plugin_registry()
    expect(plugins.map((plugin) => plugin.value)).toEqual(['mp3quran', 'tvquran', 'archiveorg', 'mixlr', 'albadr'])
    expect(plugin_paths(plugins[0])).toEqual({
      entry_path: 'src/plugins/mp3quran/index.js',
      config_path: 'plugins/mp3quran/Mp3QuranConfig.json',
      script_path: 'plugins/mp3quran/Mp3QuranScript.js',
      icon_path: 'plugins/mp3quran/Mp3QuranIcon.png'
    })
  })

  it('selects plugins by name or all', async () => {
    const plugins = await load_plugin_registry()
    expect(select_plugins(plugins, ['tvquran'])?.map((plugin) => plugin.value)).toEqual(['tvquran'])
    expect(select_plugins(plugins, ['all'])).toEqual(plugins)
    expect(select_plugins(plugins, [])).toBeNull()
    expect(() => select_plugins(plugins, ['missing'])).toThrow(/Unknown plugin/)
  })
})
