import js from '@eslint/js'
import globals from 'globals'

const readonly = (names) => Object.fromEntries(names.map((name) => [name, 'readonly']))

const grayjay_globals = readonly([
  'AudioUrlSource',
  'ChannelPager',
  'HLSSource',
  'PlatformAuthorLink',
  'PlatformChannel',
  'PlatformID',
  'PlatformNestedMediaContent',
  'PlatformPlaylist',
  'PlatformPlaylistDetails',
  'PlatformVideo',
  'PlatformVideoDetails',
  'PlaylistPager',
  'ScriptException',
  'Thumbnail',
  'Thumbnails',
  'Type',
  'UnMuxVideoSourceDescriptor',
  'VideoPager',
  'VideoSourceDescriptor',
  'VideoUrlSource',
  'IS_TESTING',
  'bridge',
  'http',
  'log',
  'source'
])

export default [
  {
    ignores: ['node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['*.config.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['plugins/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: grayjay_globals
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
]
