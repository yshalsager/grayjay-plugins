export function apply_pager_state(target, next) {
  target.results = next.results
  target.hasMore = next.hasMore
  target.context = next.context
  return target
}

export function array_pager_class(BasePager) {
  return class ArrayPager extends BasePager {
    constructor(items, limit, offset = 0) {
      const results = items.slice(offset, offset + limit)
      super(results, offset + limit < items.length, { items, limit, offset: offset + limit })
    }

    nextPage() {
      return apply_pager_state(this, new this.constructor(this.context.items, this.context.limit, this.context.offset))
    }
  }
}

export function empty_pager_class(BasePager) {
  return class EmptyPager extends BasePager {
    constructor() {
      super([], false, {})
    }

    nextPage() {
      return this
    }
  }
}
