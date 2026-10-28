/** Small per-visit budget; only exact public item links can spend it. */
export function createStorefrontItemPrefetchBudget(limit = 2) {
  const visited = new Set<string>()
  return (href: string) => {
    if (!href.startsWith("/") || href.startsWith("//")) return false
    let url: URL
    try {
      url = new URL(href, "https://storefront.invalid")
    } catch {
      return false
    }
    const item = url.searchParams.get("item")
    if (
      url.origin !== "https://storefront.invalid" ||
      url.hash ||
      !["/", "/shop", "/services"].includes(url.pathname) ||
      url.searchParams.size !== 1 ||
      !item ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(item) ||
      visited.has(url.pathname + url.search) ||
      visited.size >= limit
    )
      return false
    visited.add(url.pathname + url.search)
    return true
  }
}
