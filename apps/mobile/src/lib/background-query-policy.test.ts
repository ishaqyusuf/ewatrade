import { expect, test } from "bun:test"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import {
  canReadBusinessInForeground,
  orderVisibilityPollInterval,
  qaContextPollInterval,
} from "./background-query-policy"

test("business requests stop while backgrounded, signed out, unscoped or offline", () => {
  const valid = {
    active: true,
    authenticated: true,
    businessId: "business",
    offline: false,
  }
  expect(canReadBusinessInForeground(valid)).toBe(true)
  for (const change of [
    { active: false },
    { authenticated: false },
    { businessId: null },
    { offline: true },
  ])
    expect(canReadBusinessInForeground({ ...valid, ...change })).toBe(false)
})

test("QA discovery is one shot when access is absent; active authorized sessions keep revocation checks", () => {
  expect(qaContextPollInterval(true, false)).toBe(false)
  expect(qaContextPollInterval(true, true)).toBe(45_000)
  expect(qaContextPollInterval(false, true)).toBe(false)
})

test("staff retain bounded privacy checks while managers need no visibility timer", () => {
  expect(orderVisibilityPollInterval(true, false)).toBe(30_000)
  expect(orderVisibilityPollInterval(true, true)).toBe(false)
  expect(orderVisibilityPollInterval(false, false)).toBe(false)
})

test("React Query performs a fresh discovery on resume without a direct refetch that bypasses scope", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  let reads = 0
  const options = (
    active: boolean,
    businessId: string | null = "business",
  ) => ({
    queryKey: ["qa-context", businessId],
    queryFn: async () => {
      reads++
      return null
    },
    enabled: canReadBusinessInForeground({
      active,
      businessId,
      authenticated: true,
      offline: false,
    }),
    staleTime: 0,
  })
  const observer = new QueryObserver(client, options(false))
  const unsubscribe = observer.subscribe(() => {})
  try {
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(0)
    observer.setOptions(options(true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(1)
    observer.setOptions(options(false))
    observer.setOptions(options(true))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(2)
    observer.setOptions(options(true, null))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reads).toBe(2)
  } finally {
    unsubscribe()
    client.clear()
  }
})
