import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
  QueryObserver,
} from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import type { ReactNode } from "react"
import { renderToString } from "react-dom/server"
import type { FinanceBook } from "../../../../apps/dashboard/src/components/finance/types"

const app = (path: string) =>
  new URL(`../../../../apps/dashboard/src/${path}`, import.meta.url).pathname
const leaf = ({ children }: { children?: ReactNode }) => <div>{children}</div>
const events: string[] = []
mock.module("@ewatrade/ui", () => ({
  FieldGroup: leaf,
  FormActions: leaf,
  SubmitButton: leaf,
  Input: leaf,
  SelectControl: leaf,
  Switch: leaf,
  toast: { success: () => events.push("toast") },
}))
mock.module(app("hooks/use-finance-params"), () => ({
  useFinanceParams: () => ({
    close: async () => {
      events.push("close")
    },
  }),
}))
mock.module(app("components/forms/form-controls"), () => ({
  FormDatePicker: leaf,
  FormSelectControl: leaf,
  FormRadioChoices: leaf,
}))
mock.module(app("components/forms/form-feedback"), () => ({
  FormFeedback: leaf,
}))
mock.module(app("components/finance/form-fields"), () => ({
  FinanceField: leaf,
  FinanceFormFooter: leaf,
}))
mock.module(app("components/finance/payment-method-checks"), () => ({
  PaymentMethodChecks: leaf,
}))
mock.module(app("components/finance/finance-accounts"), () => ({
  PaymentMethodGaps: leaf,
}))
mock.module(app("components/finance/review-changes"), () => ({
  plainDay: (value: string) => value,
  todayIn: () => "2026-10-30",
}))
let client: QueryClient
const rpc = createTRPCClient<AppRouter>({
  links: [
    () => () => {
      throw Error("No API operations or commands are permitted")
    },
  ],
})
let trpc = createTRPCOptionsProxy<AppRouter>({
  client: rpc,
  queryClient: () => client,
})
const successes = new Map<string, () => Promise<unknown>>()
mock.module(app("trpc/client"), () => ({
  useTRPC: () =>
    new Proxy(trpc, {
      get(root, property) {
        if (property !== "finance") return Reflect.get(root, property)
        return new Proxy(root.finance, {
          get(group, name) {
            const endpoint = Reflect.get(group, name)
            return new Proxy(endpoint, {
              get(target, method) {
                if (method !== "mutationOptions")
                  return Reflect.get(target, method)
                return (...args: unknown[]) => {
                  const options = Reflect.apply(
                    Reflect.get(target, method),
                    target,
                    args,
                  )
                  if (
                    options &&
                    typeof options === "object" &&
                    "onSuccess" in options &&
                    typeof options.onSuccess === "function"
                  ) {
                    const handler = options.onSuccess
                    successes.set(String(name), async () =>
                      Reflect.apply(handler, undefined, []),
                    )
                  }
                  return options
                }
              },
            })
          },
        })
      },
    }),
}))
const { useCompleteFinanceForm } = await import(
  "../../../../apps/dashboard/src/components/finance/use-complete-finance-form"
)
const { FinanceAccountForm } = await import(
  "../../../../apps/dashboard/src/components/finance/account-form"
)
const { FinanceSetupForm } = await import(
  "../../../../apps/dashboard/src/components/finance/setup-form"
)
const { FinanceAccountPaymentSettingsForm } = await import(
  "../../../../apps/dashboard/src/components/finance/account-payment-settings-form"
)
let complete: (() => Promise<void>) | undefined
function Completion() {
  complete = useCompleteFinanceForm("Saved")
  return null
}
const stops: Array<() => void> = []
const calls: string[] = []
let snapshots = Promise.withResolvers<void>()
function watch(label: string, key: QueryKey, slow = false) {
  client.setQueryData([...key], 1)
  const observer = new QueryObserver(client, {
    queryKey: [...key],
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      calls.push(label)
      if (slow) await snapshots.promise
      return 2
    },
  })
  stops.push(observer.subscribe(() => {}))
  return observer
}
function render(children: ReactNode) {
  renderToString(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  )
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
beforeEach(() => {
  events.length = 0
  calls.length = 0
  successes.clear()
  complete = undefined
  snapshots = Promise.withResolvers<void>()
  client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  })
  trpc = createTRPCOptionsProxy<AppRouter>({
    client: rpc,
    queryClient: () => client,
  })
})
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
  client.clear()
})

test("actual completion closes after live refresh without waiting for a loaded pinned statement", async () => {
  render(<Completion />)
  const live = watch(
    "balances",
    trpc.finance.balances.queryKey({ bookId: "book" }),
  )
  const input = {
    bookId: "book",
    accountId: "account",
    from: new Date("2026-10-01Z"),
    through: new Date("2026-10-30Z"),
    limit: 30,
  }
  const latest = watch(
    "latest statement",
    trpc.finance.accountActivity.queryKey(input),
  )
  const pinned = watch(
    "pinned statement",
    trpc.finance.accountActivity.queryKey({ ...input, snapshotSequence: "7" }),
    true,
  )
  const ledger = watch(
    "pinned ledger",
    trpc.finance.accountLedger.infiniteQueryKey({
      ...input,
      snapshotSequence: "7",
    }),
    true,
  )
  const zero = watch(
    "zero snapshot",
    trpc.finance.accountActivity.queryKey({ ...input, snapshotSequence: "0" }),
    true,
  )
  const report = watch(
    "report metadata",
    trpc.finance.reports.queryKey({
      bookId: input.bookId,
      from: input.from,
      through: input.through,
      snapshotSequence: "7",
    }),
  )
  const spending = watch(
    "bills",
    trpc.finance.bills.infiniteQueryKey({ bookId: "book", limit: 30 }),
  )
  const counts = watch(
    "cash counts",
    trpc.finance.cashCounts.infiniteQueryKey({ bookId: "book", limit: 20 }),
  )
  const pending = complete?.()
  try {
    await settle()
    expect(events).toEqual(["close", "toast"])
    expect(calls.sort()).toEqual([
      "balances",
      "bills",
      "cash counts",
      "latest statement",
      "report metadata",
    ])
    expect(live.getCurrentResult().data).toBe(2)
    expect(latest.getCurrentResult().data).toBe(2)
    expect(pinned.getCurrentResult().data).toBe(1)
    expect(ledger.getCurrentResult().data).toBe(1)
    expect(zero.getCurrentResult().data).toBe(1)
    expect(report.getCurrentResult().data).toBe(2)
    // A posting completion still reloads loaded record lists.
    expect(spending.getCurrentResult().data).toBe(2)
    expect(counts.getCurrentResult().data).toBe(2)
  } finally {
    snapshots.resolve()
    await pending
  }
})

for (const kind of ["account", "category", "setup"] as const) {
  test(`actual ${kind} completion refreshes its affected reads only`, async () => {
    render(
      kind === "setup" ? (
        <FinanceSetupForm />
      ) : (
        <FinanceAccountForm bookId="book" category={kind === "category"} />
      ),
    )
    const live = watch(
      "balances",
      trpc.finance.balances.queryKey({ bookId: "book" }),
    )
    const book = watch("book", trpc.finance.book.queryKey())
    const report = watch(
      "report",
      trpc.finance.reports.queryKey({
        bookId: "book",
        from: new Date("2026-10-01Z"),
        through: new Date("2026-10-30Z"),
      }),
    )
    const counts = watch(
      "cash counts",
      trpc.finance.cashCounts.infiniteQueryKey({ bookId: "book", limit: 20 }),
    )
    const spending = watch(
      "bills",
      trpc.finance.bills.infiniteQueryKey({ bookId: "book", limit: 30 }),
    )
    // A nested Finance key layout always takes the refresh path.
    const nested = watch("nested read", [
      ["finance", "bankStatements", "list"],
      { type: "query" },
    ])
    const choices = watch("choices", trpc.orders.paymentAccounts.queryKey())
    const bank = watch(
      "bank details",
      trpc.businessBanking.accounts.queryKey({ bookId: "book" }),
    )
    const detail = watch(
      "Customer account",
      trpc.customerLedger.accountDetail.queryKey({ accountId: "ledger" }),
    )
    const retained = trpc.orders.listPage.infiniteQueryKey({
      storeId: "store",
      limit: 25,
    })
    client.setQueryData([...retained], 1)
    const handler = successes.get(
      kind === "setup"
        ? "setup"
        : kind === "account"
          ? "createMoneyAccount"
          : "createExpenseCategory",
    )
    if (!handler) throw Error("Missing actual form success callback")
    await handler()
    expect(calls.sort()).toEqual(
      kind === "setup"
        ? [
            "Customer account",
            "balances",
            "bills",
            "book",
            "cash counts",
            "choices",
            "nested read",
            "report",
          ]
        : kind === "account"
          ? [
              "balances",
              "bank details",
              "book",
              "choices",
              "nested read",
              "report",
            ]
          : ["balances", "book", "nested read", "report"],
    )
    expect(live.getCurrentResult().data).toBe(2)
    expect(book.getCurrentResult().data).toBe(2)
    expect(report.getCurrentResult().data).toBe(2)
    expect(nested.getCurrentResult().data).toBe(2)
    expect(counts.getCurrentResult().data).toBe(kind === "setup" ? 2 : 1)
    expect(spending.getCurrentResult().data).toBe(kind === "setup" ? 2 : 1)
    expect(bank.getCurrentResult().data).toBe(kind === "account" ? 2 : 1)
    expect(choices.getCurrentResult().data).toBe(kind === "category" ? 1 : 2)
    expect(detail.getCurrentResult().data).toBe(kind === "setup" ? 2 : 1)
    expect(client.getQueryState(retained)?.isInvalidated).toBe(false)
    expect(events).toEqual(["close"])
  })
}

for (const kind of ["account", "category"] as const) {
  test(`actual ${kind} completion still refreshes failed, refused and unloaded record reads`, async () => {
    render(<FinanceAccountForm bookId="book" category={kind === "category"} />)
    const book = watch("book", trpc.finance.book.queryKey())
    const failedKey = trpc.finance.bills.infiniteQueryKey({
      bookId: "book",
      limit: 30,
    })
    const refusedKey = trpc.finance.cashCounts.infiniteQueryKey({
      bookId: "book",
      limit: 20,
    })
    const unloadedKey = trpc.finance.cashCount.queryKey({
      bookId: "book",
      countId: "count",
    })
    const failed = watch("failed bills", failedKey)
    const refused = watch("refused cash counts", refusedKey)
    const unloaded = watch("unloaded cash count", unloadedKey)
    const cache = client.getQueryCache()
    cache
      .find({ queryKey: failedKey })
      ?.setState({ status: "error", error: new Error("Inert failure") })
    cache
      .find({ queryKey: refusedKey })
      ?.setState({ status: "error", error: new Error("Inert refusal") })
    cache
      .find({ queryKey: unloadedKey })
      ?.setState({ status: "pending", data: undefined, dataUpdatedAt: 0 })
    const handler = successes.get(
      kind === "account" ? "createMoneyAccount" : "createExpenseCategory",
    )
    if (!handler) throw Error("Missing actual form success callback")
    await handler()
    expect(calls.sort()).toEqual([
      "book",
      "failed bills",
      "refused cash counts",
      "unloaded cash count",
    ])
    for (const observer of [book, failed, refused, unloaded]) {
      expect(observer.getCurrentResult().status).toBe("success")
      expect(observer.getCurrentResult().data).toBe(2)
    }
  })
}

test("actual payment-settings completion refreshes Finance fully plus order choices and bank-detail cards once", async () => {
  const balancesKey = trpc.finance.balances.queryKey({ bookId: "book" })
  // The form's loaded owner read; its success callback mounts with it.
  client.setQueryData([...balancesKey], {
    accounts: [
      {
        id: "bank",
        name: "Inert bank",
        purpose: "BANK",
        archivedAt: null,
        paymentMethods: [],
        paymentsPausedAt: null,
        mobileMoney: false,
      },
    ],
  })
  const book: Pick<FinanceBook, "id"> = { id: "book" }
  render(
    <FinanceAccountPaymentSettingsForm
      book={book as FinanceBook}
      accountId="bank"
    />,
  )
  const handler = successes.get("updateMoneyAccountPayments")
  if (!handler) throw Error("Missing actual payment-settings success callback")
  const live = watch("balances", balancesKey)
  const bookRead = watch("book", trpc.finance.book.queryKey())
  const counts = watch(
    "cash counts",
    trpc.finance.cashCounts.infiniteQueryKey({ bookId: "book", limit: 20 }),
  )
  const spending = watch(
    "bills",
    trpc.finance.bills.infiniteQueryKey({ bookId: "book", limit: 30 }),
  )
  const pinned = watch(
    "pinned statement",
    trpc.finance.accountActivity.queryKey({
      bookId: "book",
      accountId: "bank",
      from: new Date("2026-10-01Z"),
      through: new Date("2026-10-30Z"),
      snapshotSequence: "7",
      limit: 30,
    }),
  )
  const choices = watch("choices", trpc.orders.paymentAccounts.queryKey())
  const bank = watch(
    "bank details",
    trpc.businessBanking.accounts.queryKey({ bookId: "book" }),
  )
  await handler()
  expect(calls.sort()).toEqual([
    "balances",
    "bank details",
    "bills",
    "book",
    "cash counts",
    "choices",
  ])
  for (const observer of [live, bookRead, counts, spending, choices, bank])
    expect(observer.getCurrentResult().data).toBe(2)
  expect(pinned.getCurrentResult().data).toBe(1)
  expect(events).toEqual(["close", "toast"])
})

test("a failed pinned statement is retried by the existing completion recovery", async () => {
  render(<Completion />)
  const key = trpc.finance.accountActivity.queryKey({
    bookId: "book",
    accountId: "account",
    from: new Date("2026-10-01Z"),
    through: new Date("2026-10-30Z"),
    snapshotSequence: "7",
    limit: 30,
  })
  const observer = watch("failed statement", key)
  const query = client.getQueryCache().find({ queryKey: key })
  if (!query) throw Error("Missing existing statement")
  query.setState({
    status: "error",
    error: new Error("Inert previous failure"),
  })
  await complete?.()
  expect(calls).toEqual(["failed statement"])
  expect(observer.getCurrentResult().data).toBe(2)
  expect(events).toEqual(["close", "toast"])
})
