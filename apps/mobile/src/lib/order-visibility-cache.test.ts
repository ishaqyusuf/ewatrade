import { expect, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"
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
