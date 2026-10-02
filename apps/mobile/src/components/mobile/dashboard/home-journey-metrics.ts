import type { HomeOrdersState } from "./home-journey-presentation"

type HomeQuerySnapshot = {
  resolved: boolean
  unavailable: boolean
  stale: boolean
}

function countValue(
  query: HomeQuerySnapshot,
  loaded: number,
  queued: number,
  isOffline: boolean,
) {
  if (query.resolved) return String(loaded + queued)
  if (queued > 0) return `${queued} queued`
  return isOffline
    ? "Not loaded"
    : query.unavailable
      ? "Unavailable"
      : "Loading…"
}

export function getHomeJourneyMetrics(input: {
  isOffline: boolean
  catalogReady: boolean
  hasProducts: boolean
  hasServiceWork: boolean
  orderQuery: HomeQuerySnapshot
  stockQuery: HomeQuerySnapshot
  workQuery: HomeQuerySnapshot
  loadedOrderCount: number
  queuedOrders: number
  loadedStockCount: number
  queuedStockOperations: number
  loadedWorkCount: number
  queuedWorkOperations: number
  loadedOrderValue: string
}) {
  const prefix = input.isOffline ? "Cached · " : ""
  const primaryMetric = input.hasProducts
    ? {
        label: "Stock balances",
        value: countValue(
          input.stockQuery,
          input.loadedStockCount,
          input.queuedStockOperations,
          input.isOffline,
        ),
        detail: `${prefix}Inventory ledger${input.queuedStockOperations > 0 ? ` · ${input.queuedStockOperations} queued operations included` : ""}${input.stockQuery.stale ? " · refresh unavailable" : ""}`,
      }
    : input.hasServiceWork
      ? {
          label: "Active work",
          value: countValue(
            input.workQuery,
            input.loadedWorkCount,
            input.queuedWorkOperations,
            input.isOffline,
          ),
          detail: `${prefix}Loaded service queue${input.queuedWorkOperations > 0 ? ` · ${input.queuedWorkOperations} queued operations included` : ""}${input.workQuery.stale ? " · refresh unavailable" : ""}`,
        }
      : {
          label: "Catalog",
          value: input.catalogReady ? "Ready" : "Not ready",
          detail: `${prefix}Sellable item readiness`,
        }
  const recentOrderMetric = {
    label: "Recent orders",
    value: countValue(
      input.orderQuery,
      input.loadedOrderCount,
      input.queuedOrders,
      input.isOffline,
    ),
    detail: `${prefix}Latest loaded orders${input.queuedOrders > 0 ? ` · ${input.queuedOrders} queued included` : ""}${input.orderQuery.stale ? " · refresh unavailable" : ""}`,
  }
  const revenueMetric = {
    label: "Recent revenue",
    value: input.orderQuery.resolved
      ? input.loadedOrderValue
      : input.isOffline
        ? "Not loaded"
        : input.orderQuery.unavailable
          ? "Unavailable"
          : "Loading…",
    detail: input.orderQuery.resolved
      ? `${prefix}Across ${input.loadedOrderCount} loaded ${input.loadedOrderCount === 1 ? "order" : "orders"}${input.queuedOrders > 0 ? " · queued value excluded" : ""}${input.orderQuery.stale ? " · refresh unavailable" : ""}`
      : "Loaded-order value is not available yet.",
  }
  const ordersState: HomeOrdersState =
    input.loadedOrderCount > 0
      ? "loaded"
      : input.queuedOrders > 0
        ? "queued"
        : input.orderQuery.resolved
          ? "empty"
          : input.isOffline
            ? "offline-empty"
            : input.orderQuery.unavailable
              ? "unavailable"
              : "loading"
  return { primaryMetric, recentOrderMetric, revenueMetric, ordersState }
}
