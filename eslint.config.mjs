import js from '@eslint/js'
import globals from 'globals'

const readonly = (names) => Object.fromEntries(names.map((name) => [name, 'readonly']))

const grayjay_platform_globals = readonly([
  'PlatformAuthorLink',
  'PlatformChannel',
  'PlatformID',
  'PlatformNestedMediaContent',
  'PlatformPlaylist',
  'PlatformPlaylistDetails',
  'PlatformVideo',
  'PlatformVideoDetails',
  'PlatformWebDetails'
])

const grayjay_media_globals = readonly([
  'AudioUrlSource',
  'HLSSource',
  'Thumbnail',
  'Thumbnails',
  'UnMuxVideoSourceDescriptor',
  'VideoSourceDescriptor',
  'VideoUrlSource'
])

const grayjay_plugin_globals = readonly([
  'ChannelPager',
  'PlaylistPager',
  'ScriptException',
  'UnavailableException',
  'Type',
  'VideoPager',
  '__GRAYJAY_DEBUG_TESTS__',
  'IS_TESTING',
  'bridge',
  'http',
  'log',
  'source'
])

const grayjay_http_globals = readonly(['ScriptException', 'http'])

export default [
  {
    ignores: ['node_modules/**', 'tmp/**']
  },
  js.configs.recommended,
  {
    files: ['*.config.js', '*.config.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'tests/**/*.js'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['plugins/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...grayjay_platform_globals,
        ...grayjay_media_globals,
        ...grayjay_http_globals,
        ...grayjay_plugin_globals
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/plugins/**/*.js'],
    languageOptions: {
      globals: {
        ...grayjay_media_globals,
        ...grayjay_plugin_globals
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/lib/grayjay.js'],
    languageOptions: {
      globals: grayjay_platform_globals
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/lib/media.js'],
    languageOptions: {
      globals: grayjay_media_globals
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/lib/http.js'],
    languageOptions: {
      globals: grayjay_http_globals
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/lib/debug.js'],
    languageOptions: {
      globals: {
        IS_TESTING: 'readonly',
        log: 'readonly'
      }
    }
  },
  {
    files: ['src/lib/grayjay-tests.js'],
    languageOptions: {
      globals: {
        globalThis: 'readonly'
      }
    }
  }
]
