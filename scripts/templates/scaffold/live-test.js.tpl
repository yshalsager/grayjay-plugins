import { expect, test } from 'vitest'
import { load_plugin } from '@tests/live/harness/grayjay-runtime.js'

const runtime = await load_plugin(__VALUE_JSON__)
const { source } = runtime

test('__VALUE__ scaffold loads and exposes empty home', () => {
  expect(source.saveState()).toBe('{}')
  expect(source.getHome().results).toEqual([])
  expect(source.getChannel(__PLATFORM_URL_JSON__).name).toBe(__LABEL_JSON__)
  expect(source.getChannelPlaylists(__PLATFORM_URL_JSON__).results).toEqual([])
})
