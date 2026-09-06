export function resolveOrderDetailCurrentQaPath(
  path: string,
  development: boolean,
) {
  if (!development) return null
  try {
    const url = new URL(path)
    const theme = url.searchParams.get("theme") ?? "light"
    if (
      url.protocol !== "ewatrade-dev:" ||
      url.hostname !== "order-detail-current" ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.searchParams.getAll("theme").length > 1 ||
      [...url.searchParams.keys()].some((key) => key !== "theme") ||
      (theme !== "light" && theme !== "dark")
    ) {
      return null
    }
    return `/design-system/order-detail-current?theme=${theme}`
  } catch {
    return null
  }
}
