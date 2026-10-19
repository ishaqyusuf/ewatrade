import { beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"
import type { SaleOfferingChoice } from "../sale-item-picker"

// M11: the actual sale model with the actual sale-activity observer, on a
// copy of the create-sale-account harness (that frozen fixture stays as is).
// Actual hook/React/pure models. Auth, native, operational-mode and query ports
// are controlled; no server command, DB, provider or native UI is invoked.
const source = new URL("../../../", import.meta.url)
function standIn(path: string, exports: Record<string, unknown>) {
  mock.module(new URL(path, source).pathname, () => exports)
}
const originalProfile = {
  id: "actor-a",
  businessId: "business-a",
  storeId: "store-a",
  currencyCode: "NGN",
  role: "OWNER",
  staffAccessMode: "LEGACY",
  name: "Actor A",
  email: "fixture@example.test",
}
let profile = { ...originalProfile }
let storeId = "store-a"
let generation = 0
let nonce = 0
let offlineMode = false
const secure = new Map<string, string>()
const persisted = new Map<string, string>()
mock.module("expo-secure-store", () => ({
  getItem: (key: string) => secure.get(key) ?? null,
  setItem: (key: string, value: string) => {
    secure.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    secure.delete(key)
  },
}))
mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => persisted.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      persisted.set(key, value)
    },
    removeItem: async (key: string) => {
      persisted.delete(key)
    },
  },
}))
Object.assign(globalThis, { __DEV__: false })
type Account = {
  id: string
  name: string
  purpose: string
  paymentMethods: string[]
  paused: boolean
}
const account = (
  id = "cash-a",
  name = "Till A",
  methods = ["cash"],
): Account => ({
  id,
  name,
  purpose: methods.includes("cash") ? "CASH" : "BANK",
  paymentMethods: methods,
  paused: false,
})
let accountData: {
  book: { id: string; currencyCode: string } | null
  accounts: Account[]
} = { book: { id: "book-a", currencyCode: "NGN" }, accounts: [account()] }
function accountAt(index: number) {
  const value = accountData.accounts[index]
  if (!value) throw Error(`Expected account row ${index}`)
  return value
}
let accountError: { data: { code: string } } | null = null
let accountFetching = false
let accountFetchedAfterMount = true
let accountTransport: (context: unknown) => Promise<typeof accountData> =
  async () => accountData
const queryOptions: Array<Record<string, unknown>> = []
const requests: unknown[] = []
const completed: unknown[] = []
const recorded: unknown[] = []
let mutationResult: (
  input: unknown,
) => Promise<{ id: string; orderNumber: string }> = async () => ({
  id: "order-a",
  orderNumber: "SALE-1",
})
let refreshResult: () => Promise<unknown> = async () => undefined
type DescriptionField = {
  testID: string
  value: string
  accessibilityLabel: string
  accessibilityHint?: string
  onBlur: () => void
  onChangeText: (value: string) => void
}
const descriptionFields = new Map<string, DescriptionField>()
const box = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children)
standIn("components/ui/view", { View: box })
standIn("components/ui/text", { Text: box })
standIn("components/ui/pressable", { Pressable: box })
standIn("components/ui/icon", { Icon: () => null })
standIn("components/mobile/money-field", {
  MoneyField: ({ value }: { value: string }) =>
    createElement("input", { value, readOnly: true }),
})
standIn("hooks/use-color", { useColors: () => ({}) })
standIn("hooks/use-large-text-layout", { useLargeTextLayout: () => false })
standIn("hooks/use-auth", { useAuthContext: () => ({ profile }) })
standIn("components/ui/modal", {
  useModal: () => ({ present() {}, dismiss() {} }),
})
standIn("internal-tooling/fixture-recipes", {
  createOrderFixture: () => {
    throw Error("QA fixture generation is outside account tests")
  },
})
standIn("store/operationalModeStore", {
  useOperationalModeStore: (selector: (value: unknown) => unknown) =>
    selector({
      isOfflineMode: offlineMode,
      offlineAccessByBusinessId: { [profile.businessId]: true },
    }),
  isOfflineAccessAllowed: () => true,
})
mock.module("expo-crypto", () => ({ randomUUID: () => `inert-${++nonce}` }))
mock.module("react-native", () => ({
  Keyboard: { dismiss() {} },
  Platform: { OS: "android" },
  AppState: { addEventListener: () => ({ remove() {} }) },
  Text: box,
  TextInput: (props: DescriptionField) => {
    descriptionFields.set(props.testID, props)
    return createElement("input", { value: props.value, readOnly: true })
  },
}))
function procedure(kind: string) {
  return {
    queryOptions: (_input?: unknown, options?: Record<string, unknown>) => ({
      queryKey: [[kind], { type: "query" }],
      ...(kind === "accounts"
        ? { queryFn: (context: unknown) => accountTransport(context) }
        : {}),
      ...options,
    }),
    infiniteQueryOptions: (
      _input?: unknown,
      options?: Record<string, unknown>,
    ) => ({ queryKey: [[kind], { type: "infinite" }], ...options }),
    mutationOptions: () => ({ kind }),
    queryFilter: () => ({ queryKey: [[kind]] }),
    pathFilter: () => ({ queryKey: [[kind]] }),
  }
}
const trpc = {
  catalog: {
    listItemsPage: procedure("catalog-page"),
    listItems: procedure("catalog"),
    getItem: procedure("item"),
  },
  tenant: { featureAvailability: procedure("availability") },
  orders: {
    paymentAccounts: procedure("accounts"),
    create: procedure("create-order"),
    listPage: procedure("orders-page"),
    list: procedure("orders"),
    customerCount: procedure("customer-count"),
  },
  customers: {
    listPage: procedure("customers-page"),
    count: procedure("directory-count"),
    create: procedure("create-customer"),
  },
  inventory: { balanceReport: procedure("balances") },
  services: { queuePage: procedure("services") },
}
standIn("trpc/client", {
  useTRPC: () => trpc,
  getDataCacheGeneration: () => generation,
})
mock.module("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: [string[]]; [key: string]: unknown }) => {
    const kind = options.queryKey[0][0]
    if (kind === "accounts") queryOptions.push(options)
    return {
      data:
        kind === "accounts"
          ? accountData
          : kind === "availability"
            ? { storeId }
            : kind?.endsWith("count")
              ? 0
              : undefined,
      isError: kind === "accounts" && Boolean(accountError),
      error: kind === "accounts" ? accountError : null,
      isFetchedAfterMount:
        kind === "accounts" ? accountFetchedAfterMount : true,
      isFetching: kind === "accounts" ? accountFetching : false,
      isPending: false,
      isLoading: false,
      dataUpdatedAt: 100,
      refetch: async () => undefined,
    }
  },
  useInfiniteQuery: () => ({
    data: { pages: [{ items: [] }] },
    isLoading: false,
    isPending: false,
    isPlaceholderData: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: async () => undefined,
    fetchNextPage: async () => undefined,
  }),
  useMutation: ({ kind }: { kind: string }) => ({
    isPending: false,
    mutateAsync: async (input: unknown) => {
      if (kind !== "create-order") throw Error("Unexpected customer mutation")
      requests.push(structuredClone(input))
      return mutationResult(input)
    },
  }),
  useQueryClient: () => ({ invalidateQueries: () => refreshResult() }),
}))
const { useCreateSale } = await import("./use-create-sale")
const { CatalogFreeSaleLines } = await import("./catalog-free-sale-lines")
const { useCheckoutPaymentAccountStore: accountCache } = await import(
  "../../../store/checkoutPaymentAccountStore"
)
const { useOfflineCommandStore: offlineQueue } = await import(
  "../../../store/offlineCommandStore"
)
const { setSession } = await import("../../../lib/session-store")
await Promise.all([
  accountCache.persist.rehydrate(),
  offlineQueue.persist.rehydrate(),
])
function syncSession() {
  setSession({
    token: "inert-fixture-token",
    profile: {
      ...profile,
      staffAccessMode:
        profile.staffAccessMode === "SCOPED" ? "SCOPED" : "LEGACY",
    },
  })
}
type Model = ReturnType<typeof useCreateSale>
const { saleActivityCategory, useSaleActivity } = await import(
  "./use-sale-activity"
)
const events: { name: string; properties: Record<string, unknown> }[] = []
let completeThrows = false
beforeEach(() => {
  events.length = 0
  completeThrows = false
  profile = { ...originalProfile }
  storeId = "store-a"
  generation++
  nonce = 0
  offlineMode = false
  descriptionFields.clear()
  secure.clear()
  persisted.clear()
  syncSession()
  accountCache.setState({ snapshots: {}, locallyChangedScopes: {} })
  offlineQueue.setState({
    commands: [],
    deviceIdsByScope: {},
    hasHydrated: true,
  })
  accountData = {
    book: { id: "book-a", currencyCode: "NGN" },
    accounts: [account()],
  }
  accountError = null
  accountFetching = false
  accountFetchedAfterMount = true
  accountTransport = async () => accountData
  queryOptions.length = requests.length = completed.length = recorded.length = 0
  mutationResult = async () => ({ id: "order-a", orderNumber: "SALE-1" })
  refreshResult = async () => undefined
})
async function mount(showCatalogFreeFields = false) {
  const document = new DOMParser().parseFromString(
    "<html><body/></html>",
    "text/html",
  )
  const window = {
    document,
    HTMLIFrameElement: class {},
    HTMLElement: class {},
    addEventListener() {},
    removeEventListener() {},
  }
  Object.assign(globalThis, {
    window,
    document,
    IS_REACT_ACT_ENVIRONMENT: true,
  })
  Object.assign(document, {
    defaultView: window,
    addEventListener() {},
    removeEventListener() {},
  })
  const create = document.createElement.bind(document)
  document.createElement = (name: string) =>
    Object.assign(create(name), {
      style: {},
      addEventListener() {},
      removeEventListener() {},
    })
  const host = document.createElement("div")
  document.documentElement?.appendChild(host)
  const { createRoot } = await import("react-dom/client")
  const root = createRoot(host as unknown as HTMLElement)
  let latest: Model | undefined
  function Probe() {
    latest = useCreateSale({
      onRecorded: (value) => recorded.push(value),
      onComplete: (value) => {
        if (completeThrows) throw Error("post-success callback failed")
        completed.push(value)
      },
    })
    const model = latest
    const accountState = model.accountState
    useSaleActivity(
      {
        lifetime: JSON.stringify([
          profile.id,
          profile.businessId,
          profile.storeId,
          generation,
          offlineMode,
        ]),
        step: model.step,
        category: saleActivityCategory(
          model.selectedRows.length,
          model.catalogFreeLines.map((line) => line.kind),
        ),
        itemCount: model.selectedRows.length + model.catalogFreeLines.length,
        completion: model.completion,
        submission: model.submission,
        chosenAccountId:
          accountState.kind === "selected" && !accountState.sole
            ? accountState.account.id
            : null,
        paymentMethod: model.paymentMethod,
      },
      (event) => events.push(event),
    )
    return showCatalogFreeFields
      ? createElement(CatalogFreeSaleLines, { model: latest })
      : null
  }
  const ui = {
    get text() {
      return host.textContent ?? ""
    },
    get model(): Model {
      if (!latest) throw Error("Hook did not mount")
      return latest
    },
    render: async () => {
      syncSession()
      await act(async () => root.render(createElement(Probe)))
    },
    run: async (fn: () => unknown) => {
      await act(async () => {
        await fn()
      })
    },
    close: async () => {
      await act(async () => root.unmount())
    },
  }
  await ui.render()
  return ui
}
type UI = Awaited<ReturnType<typeof mount>>
async function paidDraft(ui: UI) {
  await ui.run(() => ui.model.addCatalogFreeLine("quick_sale"))
  const line = ui.model.catalogFreeLines[0]
  if (!line) throw Error("Expected typed-price line")
  await ui.run(() =>
    ui.model.updateCatalogFreeLine(line.id, {
      amount: "50",
      description: "Rice",
    }),
  )
  await ui.run(() => ui.model.setAmountReceived("50"))
  expect(ui.model.totalMinor).toBe(5000)
  expect(ui.model.paymentSummary.receivedMinor).toBe(5000)
}

function latestAccountQuery() {
  const options = queryOptions.at(-1)
  if (!options || typeof options.queryFn !== "function")
    throw Error("Expected actual hook's account query wrapper")
  return options
}
async function invokeAccountQuery(
  options = latestAccountQuery(),
): Promise<unknown> {
  if (typeof options.queryFn !== "function")
    throw Error("Expected query function")
  return Reflect.apply(options.queryFn, undefined, [
    { queryKey: options.queryKey, signal: new AbortController().signal },
  ])
}

const names = () => events.map((event) => event.name)
const result = () =>
  events.filter((event) => event.name === "mobile_sale_result")
const failure = (code: string, httpStatus?: number) =>
  Object.assign(new Error("controlled"), { data: { code, httpStatus } })

test("baseline: an online sale reports submitted and saved", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    await ui.run(() => ui.model.submit())
    expect(ui.model.completion).toMatchObject({ status: "created" })
    expect(names()).toContain("mobile_sale_submitted")
    expect(result()).toEqual([
      {
        name: "mobile_sale_result",
        properties: { category: "quick_sale", status: "saved" },
      },
    ])
  } finally {
    await ui.close()
  }
})

test("fast offline: a batched confirm still reports submitted and queued", async () => {
  const ui = await mount()
  try {
    await ui.run(() => invokeAccountQuery())
    await paidDraft(ui)
    offlineMode = true
    await ui.render()
    events.length = 0
    await ui.run(() => ui.model.submit())
    expect(ui.model.completion).toMatchObject({ status: "queued" })
    expect(names()).toContain("mobile_sale_submitted")
    expect(result()).toEqual([
      {
        name: "mobile_sale_result",
        properties: { category: "quick_sale", status: "queued" },
      },
    ])
  } finally {
    await ui.close()
  }
})

test("fast definitive rejection reports one failed result", async () => {
  mutationResult = async () => {
    throw failure("FORBIDDEN")
  }
  const ui = await mount()
  try {
    await paidDraft(ui)
    await ui.run(() => ui.model.submit())
    expect(ui.model.completion).toBeNull()
    expect(names()).toContain("mobile_sale_submitted")
    expect(result()).toEqual([
      {
        name: "mobile_sale_result",
        properties: { category: "quick_sale", status: "failed" },
      },
    ])
  } finally {
    await ui.close()
  }
})

test("unknown, then a FORBIDDEN retry of the same operation, stays unknown", async () => {
  mutationResult = async () => {
    throw failure("INTERNAL_SERVER_ERROR", 503)
  }
  const ui = await mount()
  try {
    await paidDraft(ui)
    await ui.run(() => ui.model.submit())
    mutationResult = async () => {
      throw failure("FORBIDDEN")
    }
    await ui.run(() => ui.model.submit())
    expect(result().map((event) => event.properties.status)).toEqual([
      "unknown",
      "unknown",
    ])
  } finally {
    await ui.close()
  }
})

test("success with a refresh warning, or a throwing post-success callback, is never failed", async () => {
  refreshResult = async () => {
    throw Error("lists unavailable")
  }
  completeThrows = true
  const ui = await mount()
  try {
    await paidDraft(ui)
    await ui.run(async () => {
      try {
        await ui.model.submit()
      } catch {
        // A throwing callback may surface here; it is not a sale failure.
      }
    })
    expect(ui.model.completion).toMatchObject({ status: "created" })
    expect(result().map((event) => event.properties.status)).toEqual(["saved"])
  } finally {
    await ui.close()
  }
})

test("a queued sale carries the chosen account name for its receipt context; pending carries none", async () => {
  const ui = await mount()
  try {
    await ui.run(() => invokeAccountQuery())
    await paidDraft(ui)
    offlineMode = true
    await ui.render()
    await ui.run(() => ui.model.submit())
    expect(ui.model.completion).toMatchObject({
      status: "queued",
      moneyAccount: "Till A",
    })
  } finally {
    await ui.close()
  }
  offlineMode = false
  const pending = await mount()
  try {
    await pending.run(() => pending.model.addCatalogFreeLine("quick_sale"))
    const line = pending.model.catalogFreeLines[0]
    if (!line) throw Error("Expected line")
    await pending.run(() =>
      pending.model.updateCatalogFreeLine(line.id, {
        amount: "50",
        description: "Rice",
      }),
    )
    await pending.run(() => pending.model.submit())
    expect(pending.model.completion).toMatchObject({ status: "created" })
    expect(pending.model.completion?.moneyAccount).toBeUndefined()
  } finally {
    await pending.close()
  }
})
