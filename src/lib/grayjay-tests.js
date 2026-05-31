export function define_grayjay_tests(scope, tests) {
  globalThis.GrayjayTests = Object.assign(
    {},
    globalThis.GrayjayTests || {},
    Object.fromEntries(Object.entries(tests).map(([key, test]) => [`${safe_key(scope)}_${key}`, test]))
  )
}

export function home_first_detail_test(name) {
  return {
    name,
    description: 'Fetches the home pager and resolves the first content item through getContentDetails.',
    test(testContext) {
      const home = testContext.runSourceMethod('getHome', [])
      const item = first_content(home?.results)
      if (!item?.url) throw 'No home content item with URL'
      return testContext.runSourceMethod('getContentDetails', [item.url])
    }
  }
}

export function search_first_detail_test(name, query) {
  return {
    name,
    description: 'Runs a source search and resolves the first content item through getContentDetails.',
    test(testContext) {
      const pager = testContext.runSourceMethod('search', [query, null, null, {}])
      const item = first_content(pager?.results)
      if (!item?.url) throw `No search result content item with URL for query: ${query}`
      return testContext.runSourceMethod('getContentDetails', [item.url])
    }
  }
}

function first_content(results) {
  for (const item of results ?? []) {
    if (item?.url) return item
  }
  return null
}

function safe_key(value) {
  return String(value ?? 'plugin').replace(/[^A-Za-z0-9]+/g, '_')
}
