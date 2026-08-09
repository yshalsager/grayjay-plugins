import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { load_plugin_registry, plugin_paths, select_plugins } from '@scripts/plugin-registry.mjs'

describe('plugin registry', () => {
  it('derives conventional paths from registry identity', async () => {
    const plugins = await load_plugin_registry()
    expect(plugins.map((plugin) => plugin.value)).toEqual([
      'mp3quran',
      'tvquran',
      'archiveorg',
      'mixlr',
      'albadr',
      'qurancom',
      'midad',
      'quranicaudio',
      'everyayah',
      'alquran-cloud',
      'binbaz',
      'tilawatalharamain',
      'jeman',
      'saleh-af',
      'drosq8',
      'drosuae',
      'alqasim',
      'binothaimeen',
      'shkhudheir',
      'alfiqh',
      'alukah',
      'baheth',
      'islamhouse',
      'islamweb-audio',
      'sunnahwadeha'
    ])
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

  it('documents every active plugin install URL', async () => {
    const plugins = await load_plugin_registry()
    const readme = await readFile('README.md', 'utf8')
    for (const plugin of plugins) {
      const config = JSON.parse(await readFile(plugin.config_path, 'utf8'))
      expect(readme, `${plugin.label} install URL missing`).toContain(config.sourceUrl)
    }
  })
})
