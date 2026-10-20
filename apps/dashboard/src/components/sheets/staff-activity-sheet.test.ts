import { expect, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { staffActivityOriginalParams } from "./staff-activity-sheet"

test("each activity event opens its exact original object", () => {
  expect(
    staffActivityOriginalParams({ kind: "order", id: "o-1", label: "ORD-1" }),
  ).toEqual({
    orderSheet: "details",
    orderId: "o-1",
  })
  expect(
    staffActivityOriginalParams({
      kind: "payment",
      id: "p-1",
      orderId: "o-1",
      label: "ORD-1",
    }),
  ).toEqual({ orderSheet: "details", orderId: "o-1" })
  expect(
    staffActivityOriginalParams({
      kind: "product",
      id: "item-1",
      offeringId: "off-1",
      label: "Rice",
    }),
  ).toEqual({ catalogDetail: "item-1" })
  expect(
    staffActivityOriginalParams({
      kind: "stock_operation",
      id: "s-1",
      label: "x",
    }),
  ).toEqual({
    inventoryOperation: "s-1",
  })
  expect(
    staffActivityOriginalParams({ kind: "stock_count", id: "c-1", label: "x" }),
  ).toEqual({
    inventoryCount: "c-1",
  })
  expect(
    staffActivityOriginalParams({
      kind: "service_job",
      id: "j-1",
      orderId: "o-1",
      label: "x",
    }),
  ).toEqual({ serviceSheet: "job", jobId: "j-1" })
  // No journal-entry sheet exists; never open a guessed finance object.
  expect(
    staffActivityOriginalParams({
      kind: "finance_entry",
      id: "f-1",
      bookId: "b-1",
      label: "x",
    }),
  ).toBeNull()
})

test("Store originals open only in their own Store and with access", async () => {
  const { staffActivityOpen } = await import("./staff-activity-sheet")
  const context = {
    activeStoreId: "store-a",
    opens: { order: true, product: true, serviceJob: true },
  }
  const garki = { id: "store-b", name: "Garki" }
  const wuse = { id: "store-a", name: "Wuse" }
  for (const record of [
    { kind: "stock_operation" as const, id: "s-1", label: "x" },
    { kind: "stock_count" as const, id: "c-1", label: "x" },
    { kind: "order" as const, id: "o-1", label: "x" },
    { kind: "service_job" as const, id: "j-1", orderId: "o-1", label: "x" },
  ]) {
    // An Owner reading business-wide activity from Store A: Store B stays shut.
    expect(staffActivityOpen({ record, store: garki }, context)).toEqual({
      unavailable: "Switch to Garki to open",
    })
    expect(staffActivityOpen({ record, store: wuse }, context)).toEqual({
      params: staffActivityOriginalParams(record),
    })
  }
  // Products are business-wide and open from any Store.
  const product = {
    kind: "product" as const,
    id: "i-1",
    offeringId: "f-1",
    label: "x",
  }
  expect(staffActivityOpen({ record: product, store: null }, context)).toEqual({
    params: { catalogDetail: "i-1" },
  })
  expect(
    staffActivityOpen(
      {
        record: { kind: "payment", id: "p-1", orderId: "o-1", label: "x" },
        store: wuse,
      },
      { ...context, opens: { ...context.opens, order: false } },
    ),
  ).toEqual({ unavailable: "You can’t open this" })
  expect(
    staffActivityOpen(
      {
        record: { kind: "finance_entry", id: "f-1", bookId: "b-1", label: "x" },
        store: null,
      },
      context,
    ),
  ).toEqual({ unavailable: "Open it in Finance" })
})

test("closing during a pending read never lets the reopened view show it", async () => {
  const { QueryClient, QueryObserver } = await import("@tanstack/react-query")
  const { freshShownRead, mountOwnedRead, nextReadMount } = await import(
    "@ewatrade/assistant/general/staff-activity-target"
  )
  const client = new QueryClient()
  let authority = "earlier"
  const requests: string[] = []
  const pending: Array<() => void> = []
  const read = (mount: string) =>
    mountOwnedRead(
      {
        queryKey: ["retailOps", "staffActivityShown", { events: ["p-1"] }],
        queryFn: async () => {
          const scope = authority
          requests.push(scope)
          await new Promise<void>((resolve) => pending.push(resolve))
          return { scope }
        },
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always" as const,
      },
      mount,
    )
  // Open, and close while the first read is still in flight.
  const first = new QueryObserver(client, read(nextReadMount()))
  const closeFirst = first.subscribe(() => {})
  await Promise.resolve()
  closeFirst()
  // Access changes; the same target reopens.
  authority = "changed"
  const reopened = new QueryObserver(client, read(nextReadMount()))
  const closeReopened = reopened.subscribe(() => {})
  await Promise.resolve()
  expect(freshShownRead(reopened.getCurrentResult())).toEqual({
    state: "checking",
  })
  for (const resolve of pending) resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  // The reopened view started its own read and shows only that result.
  expect(requests).toEqual(["earlier", "changed"])
  expect(freshShownRead(reopened.getCurrentResult())).toEqual({
    state: "ready",
    data: { scope: "changed" },
  })
  closeReopened()
  client.clear()
})

test("mounted reads call the exact procedure through tRPC, abort on close and reread on reopen", async () => {
  const { QueryClient, QueryObserver } = await import("@tanstack/react-query")
  const { createTRPCClient } = await import("@trpc/client")
  const { observable } = await import("@trpc/server/observable")
  const { createTRPCOptionsProxy } = await import("@trpc/tanstack-react-query")
  const { freshShownRead, mountOwnedRead, nextReadMount } = await import(
    "@ewatrade/assistant/general/staff-activity-target"
  )
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
  let authority = "earlier"
  const calls: Array<{
    path: string
    input: unknown
    signal: AbortSignal | null | undefined
    scope: string
  }> = []
  const pending: Array<() => void> = []
  const queryClient = new QueryClient()
  // A local link stands in for the API: no HTTP, server or database.
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: createTRPCClient<AppRouter>({
      links: [
        () =>
          ({ op }) =>
            observable((observer) => {
              const scope = authority
              calls.push({
                path: op.path,
                input: op.input,
                signal: op.signal,
                scope,
              })
              pending.push(() => {
                observer.next({
                  result: {
                    type: "data",
                    data: { data: [], withheld: [], asOf: scope },
                  },
                })
                observer.complete()
              })
            }),
      ],
    }),
    queryClient,
  })
  const input = {
    from: "2026-10-12T00:00:00+01:00",
    to: "2026-10-13T00:00:00+01:00",
    events: [{ stream: "PAYMENT" as const, id: "p-1" }],
  }
  const read = () =>
    mountOwnedRead(
      trpc.retailOps.staffActivityShown.queryOptions(input, {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
        trpc: { abortOnUnmount: true },
      }),
      nextReadMount(),
    )
  const first = new QueryObserver(queryClient, read())
  const closeFirst = first.subscribe(() => {})
  await tick()
  expect(calls).toHaveLength(1)
  expect(calls[0]).toMatchObject({
    path: "retailOps.staffActivityShown",
    input,
  })
  // Closing while pending aborts the request this mount started.
  closeFirst()
  expect(calls[0]?.signal?.aborted).toBe(true)
  authority = "changed"
  const reopened = new QueryObserver(queryClient, read())
  const closeReopened = reopened.subscribe(() => {})
  await tick()
  expect(freshShownRead(reopened.getCurrentResult())).toEqual({
    state: "checking",
  })
  for (const resolve of pending) resolve()
  await tick()
  expect(calls.map((call) => call.scope)).toEqual(["earlier", "changed"])
  expect(calls[1]).toMatchObject({
    path: "retailOps.staffActivityShown",
    input,
  })
  expect(freshShownRead(reopened.getCurrentResult())).toMatchObject({
    state: "ready",
    data: { asOf: "changed" },
  })
  closeReopened()
  queryClient.clear()
})
