import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
  QueryObserver,
  focusManager,
} from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { renderToString } from "react-dom/server"

let client: QueryClient
const rpc = createTRPCClient<AppRouter>({
  links: [
    () => () => {
      throw Error("No API operation or business command permitted")
    },
  ],
})
let trpc = createTRPCOptionsProxy<AppRouter>({
  client: rpc,
  queryClient: () => client,
})
const events: string[] = []
const reads: string[] = []
const stops: Array<() => void> = []
let held = Promise.withResolvers<void>()
mock.module(
  new URL("../../../../apps/dashboard/src/trpc/client", import.meta.url)
    .pathname,
  () => ({ useTRPC: () => trpc }),
)
mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {
      events.push("router refresh")
    },
  }),
}))
const { useOrderRefresh } = await import(
  "../../../../apps/dashboard/src/components/orders/overview/use-order-refresh"
)
let refresh: (() => Promise<void>) | undefined
function Harness() {
  refresh = useOrderRefresh("changed")
  return null
}
function mount() {
  renderToString(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  )
  if (!refresh) throw Error("Missing actual refresh owner")
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
function watch(
  label: string,
  queryKey: QueryKey,
  options: { hold?: boolean; fail?: boolean } = {},
) {
  client.setQueryData([...queryKey], 1)
  const observer = new QueryObserver(client, {
    queryKey: [...queryKey],
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      reads.push(label)
      if (options.hold) await held.promise
      if (options.fail) throw Error("Inert fresh refusal")
      return 2
    },
  })
  stops.push(observer.subscribe(() => {}))
  return observer
}
function critical(hold = false, fail = false) {
  const input = { orderId: "changed" }
  return (
    [
      ["Order", trpc.orders.get.queryKey(input)],
      ["timeline", trpc.orders.timeline.queryKey(input)],
      ["change controls", trpc.orders.changeOptions.queryKey(input)],
      ["Activity", trpc.orders.activity.list.queryKey(input)],
      [
        "current message",
        trpc.customerMessages.preview.queryKey({
          ...input,
          eventKey: "payment.recorded",
        }),
      ],
    ] as const
  ).map(([label, key]) =>
    watch(String(label), key, {
      hold: hold && label === "Order",
      fail: fail && label === "Order",
    }),
  )
}
beforeEach(() => {
  events.length = 0
  reads.length = 0
  held = Promise.withResolvers<void>()
  refresh = undefined
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.mount()
  trpc = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: () => client,
  })
  focusManager.setFocused(true)
})
afterEach(async () => {
  held.resolve()
  await tick()
  for (const stop of stops.splice(0)) stop()
  client.unmount()
  client.clear()
  focusManager.setFocused(undefined)
})

test("the changed Order remains the required completion barrier before list refresh", async () => {
  mount()
  const current = critical(true)
  watch(
    "Order list",
    trpc.orders.listPage.infiniteQueryKey({ storeId: "store", limit: 25 }),
  )
  let done = false
  const pending = refresh?.().then(() => {
    done = true
  })
  try {
    await tick()
    expect(done).toBe(false)
    expect(reads).not.toContain("Order list")
    expect(events).toEqual([])
  } finally {
    held.resolve()
    await pending
    await tick()
  }
  expect(done).toBe(true)
  expect(reads.filter((name) => name === "Order list")).toHaveLength(1)
  for (const observer of current)
    expect(observer.getCurrentResult().data).toBe(2)
  expect(events).toEqual(["router refresh"])
})

test("an unrelated held message preview cannot delay the changed Order completion", async () => {
  mount()
  critical()
  const unrelated = watch(
    "another message",
    trpc.customerMessages.preview.queryKey({ orderId: "unrelated" }),
    { hold: true },
  )
  let done = false
  const pending = refresh?.().then(() => {
    done = true
  })
  try {
    await tick()
    expect(done).toBe(true)
    expect(reads).not.toContain("another message")
    expect(unrelated.getCurrentResult().data).toBe(1)
  } finally {
    held.resolve()
    await pending
  }
})

test("deferred namespace invalidation cannot make the just-refreshed Order stale again", async () => {
  mount()
  const current = critical()
  const retainedOther = trpc.orders.get.queryKey({
    orderId: "related-or-other",
  })
  client.setQueryData([...retainedOther], 1)
  await refresh?.()
  await tick()
  for (const observer of current)
    expect(observer.getCurrentResult().isStale).toBe(false)
  expect(client.getQueryState(retainedOther)?.isInvalidated).toBe(true)
  const before = reads.length
  focusManager.setFocused(false)
  focusManager.setFocused(true)
  await tick()
  expect(reads).toHaveLength(before)
})

test("active financial and Service dependencies refresh behind completion while loaded snapshots stay pinned", async () => {
  mount()
  critical()
  const live = [
    ["balance", trpc.finance.balances.queryKey({ bookId: "book" })],
    ["owed", trpc.finance.owedSummary.queryKey({ bookId: "book" })],
    [
      "live ledger",
      trpc.customerLedger.accountDetail.queryKey({ accountId: "ledger" }),
    ],
    ["sources", trpc.customerLedger.sources.queryKey()],
    ["refunds", trpc.customerLedger.refundRequests.queryKey()],
    [
      "Customer history",
      trpc.customers.getById.queryKey({ customerId: "customer" }),
    ],
    ["Service job", trpc.services.getJob.queryKey({ jobId: "job" })],
    [
      "Service queue",
      trpc.services.queuePage.infiniteQueryKey({ storeId: "store", limit: 25 }),
    ],
    [
      "scoped Catalog detail",
      [
        ...trpc.catalog.detail.orders.queryKey({
          itemId: "item",
          storeId: "store",
          limit: 20,
        }),
        "catalog-read-scope",
        "inert-current-reader",
      ],
    ],
  ] as const
  const observers = live.map(([name, key]) =>
    watch(name, key, { hold: name === "balance" }),
  )
  const pinned = watch(
    "pinned Customer statement",
    trpc.customerLedger.statement.queryKey({
      accountId: "ledger",
      snapshotSequence: "7",
      limit: 30,
    }),
  )
  const finance = watch(
    "pinned Finance statement",
    trpc.finance.accountActivity.queryKey({
      bookId: "book",
      accountId: "money",
      from: new Date("2026-10-01Z"),
      through: new Date("2026-10-30Z"),
      snapshotSequence: "7",
      limit: 30,
    }),
  )
  const contacts = watch(
    "contact directory",
    trpc.customers.listPage.infiniteQueryKey({ limit: 25 }),
  )
  try {
    await refresh?.()
    await tick()
    for (const [name] of live)
      expect(reads.filter((read) => read === name)).toHaveLength(1)
    expect(events).toEqual([])
    for (const observer of observers.slice(1))
      expect(observer.getCurrentResult().data).toBe(2)
    for (const observer of [pinned, finance, contacts])
      expect(observer.getCurrentResult().data).toBe(1)
    expect(client.getQueryState(pinned.options.queryKey)?.isInvalidated).toBe(
      false,
    )
    expect(client.getQueryState(finance.options.queryKey)?.isInvalidated).toBe(
      false,
    )
    expect(client.getQueryState(contacts.options.queryKey)?.isInvalidated).toBe(
      true,
    )
  } finally {
    held.resolve()
    await tick()
  }
  expect(observers[0]?.getCurrentResult().data).toBe(2)
  expect(events).toEqual(["router refresh"])
})

test("fresh current Order failure stays failed while completion and background recovery settle", async () => {
  mount()
  const current = critical(false, true)
  watch(
    "Order list",
    trpc.orders.listPage.infiniteQueryKey({ storeId: "store", limit: 25 }),
  )
  await refresh?.()
  await tick()
  expect(current[0]?.getCurrentResult().isError).toBe(true)
  expect(
    client.getQueryState(trpc.orders.get.queryKey({ orderId: "changed" }))
      ?.isInvalidated,
  ).toBe(true)
  expect(reads.filter((name) => name === "Order")).toHaveLength(1)
  expect(reads.filter((name) => name === "Order list")).toHaveLength(1)
  expect(events).toEqual(["router refresh"])
})
