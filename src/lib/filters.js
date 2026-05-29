export function selected_filter_values(filters, id) {
  if (!filters) return []

  if (Array.isArray(filters)) {
    return filters
      .filter((filter) => filter?.id === id || filter?.group?.id === id)
      .map(filter_value)
      .filter(Boolean)
  }

  let value = filters[id]
  if (value === undefined && typeof filters.get === 'function') {
    value = filters.get(id)
  }

  if (value === undefined || value === null) return []
  return (Array.isArray(value) ? value : [value]).map(filter_value).filter(Boolean)
}

export function filter_value(value) {
  return String(value?.value ?? value?.id ?? value ?? '')
}
