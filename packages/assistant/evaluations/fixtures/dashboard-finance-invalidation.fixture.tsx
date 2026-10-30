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
  const pending = complete?.()
  try {
    await settle()
    expect(events).toEqual(["close", "toast"])
    expect(calls.sort()).toEqual([
      "balances",
      "latest statement",
      "report metadata",
    ])
    expect(live.getCurrentResult().data).toBe(2)
    expect(latest.getCurrentResult().data).toBe(2)
    expect(pinned.getCurrentResult().data).toBe(1)
    expect(ledger.getCurrentResult().data).toBe(1)
    expect(zero.getCurrentResult().data).toBe(1)
    expect(report.getCurrentResult().data).toBe(2)
  } finally {
    snapshots.resolve()
    await pending
  }
})

for (const kind of ["account", "category", "setup"] as const) {
  test(`actual ${kind} completion updates its cross-domain dependencies only`, async () => {
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
    const choices = watch("choices", trpc.orders.paymentAccounts.queryKey())
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
        ? ["Customer account", "balances", "choices"]
        : kind === "account"
          ? ["balances", "choices"]
          : ["balances"],
    )
    expect(live.getCurrentResult().data).toBe(2)
    expect(choices.getCurrentResult().data).toBe(kind === "category" ? 1 : 2)
    expect(detail.getCurrentResult().data).toBe(kind === "setup" ? 2 : 1)
    expect(client.getQueryState(retained)?.isInvalidated).toBe(false)
    expect(events).toEqual(["close"])
  })
}

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
