export function resolveOrderDetailCurrentQaPath(
  path: string,
  development: boolean,
) {
  if (!development) return null
  try {
    const url = new URL(path)
    const theme = url.searchParams.get("theme") ?? "light"
    const state = url.searchParams.get("state") ?? "populated"
    const action = url.searchParams.get("action")
    if (
      url.protocol !== "ewatrade-dev:" ||
      url.hostname !== "order-detail-current" ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.searchParams.getAll("theme").length > 1 ||
      url.searchParams.getAll("state").length > 1 ||
      url.searchParams.getAll("action").length > 1 ||
      [...url.searchParams.keys()].some(
        (key) => key !== "theme" && key !== "state" && key !== "action",
      ) ||
      (theme !== "light" && theme !== "dark") ||
      !["offline", "paid", "populated", "scheduled"].includes(state) ||
      (action !== null &&
        !["customer", "fulfil-all", "fulfil-line", "payment"].includes(action))
    ) {
      return null
    }
    return `/design-system/order-detail-current?theme=${theme}&state=${state}${action ? `&action=${action}` : ""}`
  } catch {
    return null
  }
}
