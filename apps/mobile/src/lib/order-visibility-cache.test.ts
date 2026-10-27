import { expect, test } from "bun:test"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import {
  purgeOrderVisibilityCache,
  visibilityTightened,
} from "./order-visibility-cache"

test("tightening or first sync on OWN_SALES clears all order-derived query data", async () => {
  expect(visibilityTightened(undefined, "OWN_SALES")).toBe(true)
  expect(visibilityTightened("ALL_STORE_ORDERS", "OWN_SALES")).toBe(true)
  expect(visibilityTightened("OWN_SALES", "OWN_SALES")).toBe(false)
  expect(visibilityTightened("OWN_SALES", "ALL_STORE_ORDERS")).toBe(false)
  const client = new QueryClient()
  for (const domain of ["orders", "search", "customers", "catalog"]) {
    client.setQueryData([[domain, "list"]], { otherRepSales: [1000] })
  }
  const queued = [{ id: "queued-order", payload: { quantity: "1" } }]
  client.setQueryData([["offline", "commands"]], queued)
  client.setQueryData([["stores", "orderVisibility"]], {
    visibility: "OWN_SALES",
  })
  await purgeOrderVisibilityCache(client)
  for (const domain of ["orders", "search", "customers", "catalog"])
    expect(client.getQueryData([[domain, "list"]])).toBeUndefined()
  expect(client.getQueryData([["offline", "commands"]])).toEqual(queued)
  expect(client.getQueryData([["stores", "orderVisibility"]])).toBeDefined()
  client.clear()
})

test("tightening cancels an in-flight broad read before resetting the cache", async () => {
  const client = new QueryClient()
  const key = [["orders", "listPage"]]
  let finish: ((data: string[]) => void) | undefined
  let aborted = false
  const pending = client
    .fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => {
        signal.addEventListener("abort", () => {
          aborted = true
        })
        return new Promise<string[]>((resolve) => {
          finish = resolve
        })
      },
    })
    .catch(() => undefined)
  await purgeOrderVisibilityCache(client)
  finish?.(["another rep's cached sale"])
  await pending
  expect(aborted).toBe(true)
  expect(client.getQueryData(key)).toBeUndefined()
  client.clear()
})

test("tightening removes populated payment pages, report details and link candidates", async () => {
  const client = new QueryClient()
  const keys = [
    [
      ["businessBanking", "pendingReports"],
      { input: { limit: 20 }, type: "query" },
    ],
    [
      ["businessBanking", "pendingReports"],
      { input: { limit: 20, beforeId: "report-boundary" }, type: "query" },
    ],
    [
      ["businessBanking", "report"],
      { input: { reportId: "foreign-report" }, type: "query" },
    ],
    [
      ["businessBanking", "linkCandidates"],
      { input: { period: "all" }, type: "query" },
    ],
  ]
  for (const key of keys) {
    client.setQueryData(key, {
      items: [
        {
          id: "foreign-report",
          payerName: "Other rep customer",
          amountMinor: 45000,
          orderId: "foreign-order",
        },
      ],
      nextCursor: "report-boundary",
    })
    expect(client.getQueryData(key)).toBeDefined()
  }
  client.setQueryData([["stores", "list"]], {
    items: [{ id: "current-store" }],
  })
  await purgeOrderVisibilityCache(client)
  for (const key of keys) expect(client.getQueryData(key)).toBeUndefined()
  expect(client.getQueryData([["stores", "list"]])).toEqual({
    items: [{ id: "current-store" }],
  })
  client.clear()
})

test("tightening cancels an in-flight payment page and rejects its late broad result", async () => {
  const client = new QueryClient()
  const key = [
    ["businessBanking", "pendingReports"],
    { input: { limit: 20, beforeId: "page-two" }, type: "query" },
  ]
  let finish:
    | ((data: { items: Array<{ payerName: string }> }) => void)
    | undefined
  let aborted = false
  const pending = client
    .fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) => {
        signal.addEventListener("abort", () => {
          aborted = true
        })
        return new Promise<{ items: Array<{ payerName: string }> }>(
          (resolve) => {
            finish = resolve
          },
        )
      },
    })
    .catch(() => undefined)
  await purgeOrderVisibilityCache(client)
  finish?.({ items: [{ payerName: "Other rep customer" }] })
  await pending
  expect(aborted).toBe(true)
  expect(client.getQueryData(key)).toBeUndefined()
  client.clear()
})

test("tightening replaces mounted payment rows with a fresh scoped read", async () => {
  const client = new QueryClient()
  const key = [
    ["businessBanking", "pendingReports"],
    { input: { limit: 20 }, type: "query" },
  ]
  const foreign = {
    items: [{ id: "foreign-report", payerName: "Other rep customer" }],
  }
  const own = { items: [{ id: "own-report", payerName: "Own customer" }] }
  client.setQueryData(key, foreign)
  let reads = 0
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      reads++
      return own
    },
  })
  const snapshots: Array<unknown> = []
  const unsubscribe = observer.subscribe((result) =>
    snapshots.push(result.data),
  )
  expect(observer.getCurrentResult().data).toEqual(foreign)
  await purgeOrderVisibilityCache(client)
  expect(reads).toBe(1)
  expect(snapshots[0]).toBeUndefined()
  expect(observer.getCurrentResult().data).toEqual(own)
  expect(client.getQueryData(key)).toEqual(own)
  unsubscribe()
  client.clear()
})
