export function resolveOrderDetailCurrentQaPath(
  path: string,
  development: boolean,
) {
  if (!development) return null
  try {
    const url = new URL(path)
    const theme = url.searchParams.get("theme") ?? "light"
    const state = url.searchParams.get("state") ?? "populated"
    if (
      url.protocol !== "ewatrade-dev:" ||
      url.hostname !== "order-detail-current" ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.searchParams.getAll("theme").length > 1 ||
      url.searchParams.getAll("state").length > 1 ||
      [...url.searchParams.keys()].some(
        (key) => key !== "theme" && key !== "state",
      ) ||
      (theme !== "light" && theme !== "dark") ||
      !["offline", "paid", "populated", "scheduled"].includes(state)
    ) {
      return null
    }
    return `/design-system/order-detail-current?theme=${theme}&state=${state}`
  } catch {
    return null
  }
}
