import { expect, test } from "bun:test"
import { getHomeJourneyMetrics } from "./home-journey-metrics"

const loaded = { resolved: true, unavailable: false, stale: false }
const base = {
  isOffline: false,
  catalogReady: true,
  hasProducts: false,
  hasServiceWork: false,
  orderQuery: loaded,
  stockQuery: loaded,
  workQuery: loaded,
  loadedOrderCount: 2,
  queuedOrders: 0,
  loadedStockCount: 0,
  queuedStockOperations: 0,
  loadedWorkCount: 0,
  queuedWorkOperations: 0,
  loadedOrderValue: "₦700.00",
}
test("queued counts never add provisional value to loaded revenue", () => {
  const result = getHomeJourneyMetrics({ ...base, queuedOrders: 3 })
  expect(result.recentOrderMetric.value).toBe("5")
  expect(result.recentOrderMetric.detail).toContain("3 queued included")
  expect(result.revenueMetric.value).toBe("₦700.00")
  expect(result.revenueMetric.detail).toContain("Across 2 loaded orders")
  expect(result.revenueMetric.detail).toContain("queued value excluded")
})
test("unknown query data is not represented as zero money or empty records", () => {
  const unresolved = { resolved: false, unavailable: false, stale: false }
  expect(
    getHomeJourneyMetrics({
      ...base,
      loadedOrderCount: 0,
      orderQuery: unresolved,
    }).ordersState,
  ).toBe("loading")
  const failed = getHomeJourneyMetrics({
    ...base,
    loadedOrderCount: 0,
    orderQuery: { ...unresolved, unavailable: true },
  })
  expect(failed.revenueMetric.value).toBe("Unavailable")
  expect(failed.recentOrderMetric.value).toBe("Unavailable")
  expect(failed.ordersState).toBe("unavailable")
  const offline = getHomeJourneyMetrics({
    ...base,
    loadedOrderCount: 0,
    isOffline: true,
    orderQuery: unresolved,
  })
  expect(offline.ordersState).toBe("offline-empty")
  expect(offline.revenueMetric.value).toBe("Not loaded")
})
test("an empty loaded slice stays distinct from provisional and missing records", () => {
  expect(
    getHomeJourneyMetrics({ ...base, loadedOrderCount: 0 }).ordersState,
  ).toBe("empty")
  expect(
    getHomeJourneyMetrics({ ...base, loadedOrderCount: 0, queuedOrders: 1 })
      .ordersState,
  ).toBe("queued")
})
test("retain conditional stock/work facts and label cached or failed refreshes", () => {
  expect(
    getHomeJourneyMetrics({ ...base, hasProducts: true, loadedStockCount: 4 })
      .primaryMetric,
  ).toMatchObject({ label: "Stock balances", value: "4" })
  expect(
    getHomeJourneyMetrics({
      ...base,
      hasServiceWork: true,
      loadedWorkCount: 2,
      queuedWorkOperations: 1,
    }).primaryMetric,
  ).toMatchObject({ label: "Active work", value: "3" })
  const unresolved = { resolved: false, unavailable: true, stale: false }
  expect(
    getHomeJourneyMetrics({
      ...base,
      hasProducts: true,
      stockQuery: unresolved,
    }).primaryMetric.value,
  ).toBe("Unavailable")
  const cached = getHomeJourneyMetrics({
    ...base,
    isOffline: true,
    orderQuery: { ...loaded, stale: true },
  })
  expect(cached.revenueMetric.detail).toContain("Cached")
  expect(cached.revenueMetric.detail).toContain("refresh unavailable")
})
