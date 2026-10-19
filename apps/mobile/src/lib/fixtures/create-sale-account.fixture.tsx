import { beforeEach, expect, mock, test } from "bun:test"
import { DOMParser } from "@xmldom/xmldom"
import { type ReactNode, act, createElement } from "react"
import type { SaleOfferingChoice } from "../../components/mobile/sale-item-picker"

// Actual hook/React/pure models. Auth, native, operational-mode and query ports
// are controlled; no server command, DB, provider or native UI is invoked.
const source = new URL("../../", import.meta.url)
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
const { useCreateSale } = await import(
  "../../components/mobile/create-sale/use-create-sale"
)
const { CatalogFreeSaleLines } = await import(
  "../../components/mobile/create-sale/catalog-free-sale-lines"
)
const { useCheckoutPaymentAccountStore: accountCache } = await import(
  "../../store/checkoutPaymentAccountStore"
)
const { useOfflineCommandStore: offlineQueue } = await import(
  "../../store/offlineCommandStore"
)
const { setSession } = await import("../session-store")
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
beforeEach(() => {
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
      onComplete: (value) => completed.push(value),
    })
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

test("actual online submit preserves the explicit destination and receipt name", async () => {
  accountData.accounts = [account(), account("cash-b", "Till B")]
  const ui = await mount()
  try {
    await paidDraft(ui)
    expect(ui.model.accountState.kind).toBe("choose")
    await ui.run(() => ui.model.chooseAccount(accountAt(1)))
    await ui.run(() => ui.model.submit())
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      initialPayment: {
        moneyAccountId: "cash-b",
        amountMinor: 5000,
        method: "cash",
      },
    })
    expect(ui.model.completion).toMatchObject({
      moneyAccount: "Till B",
      orderId: "order-a",
    })
    expect(recorded).toHaveLength(1)
    expect(completed).toHaveLength(1)
  } finally {
    await ui.close()
  }
})

test("fresh single account preselects; deliberate selection asks again on method change", async () => {
  accountData.accounts = [
    account(),
    account("bank-b", "Bank B", ["bank_transfer"]),
  ]
  const ui = await mount()
  try {
    await paidDraft(ui)
    expect(ui.model.accountState).toMatchObject({
      kind: "selected",
      account: { id: "cash-a" },
      sole: true,
    })
    await ui.run(() => ui.model.setPaymentMethod("bank_transfer"))
    expect(ui.model.accountState).toMatchObject({
      kind: "selected",
      account: { id: "bank-b" },
      sole: true,
    })
    await ui.run(() => ui.model.chooseAccount(accountAt(1)))
    await ui.run(() => ui.model.setPaymentMethod("cash"))
    expect(ui.model.accountState).toMatchObject({
      kind: "choose_again",
      previousName: "Bank B",
    })
    expect(ui.model.accountBlocksConfirm).toBe(true)
  } finally {
    await ui.close()
  }
})

for (const change of ["paused", "removed", "method"] as const) {
  test(`explicit choice becoming ${change} blocks payment instead of selecting a replacement`, async () => {
    accountData.accounts = [account(), account("cash-b", "Till B")]
    const ui = await mount()
    try {
      await paidDraft(ui)
      await ui.run(() => ui.model.chooseAccount(accountAt(0)))
      const changed = {
        ...account(),
        paused: change === "paused",
        paymentMethods: change === "method" ? ["pos"] : ["cash"],
      }
      accountData.accounts =
        change === "removed"
          ? [account("cash-b", "Till B")]
          : [changed, account("cash-b", "Till B")]
      await ui.render()
      expect(ui.model.accountState.kind).toBe("choose_again")
      await ui.run(() => ui.model.submit())
      expect(requests).toHaveLength(0)
    } finally {
      await ui.close()
    }
  })
}

test("unpaid checkout does not require an account; denied paid read never submits", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    accountError = { data: { code: "FORBIDDEN" } }
    await ui.render()
    expect(ui.model.accountState.kind).toBe("denied")
    await ui.run(() => ui.model.submit())
    expect(requests).toHaveLength(0)
    await ui.run(() => ui.model.setAmountReceived(""))
    expect(ui.model.accountState.kind).toBe("not_needed")
    await ui.run(() => ui.model.submit())
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ initialPayment: undefined })
  } finally {
    await ui.close()
  }
})

test("retained old account-row handler cannot expose foreign account name after owner switch", async () => {
  accountData.accounts = [account(), account("cash-b", "Till B")]
  const ui = await mount()
  try {
    await paidDraft(ui)
    const oldChoose = ui.model.chooseAccount
    const oldRow = accountAt(0)
    profile = { ...profile, id: "actor-b" }
    generation++
    accountData.accounts = [
      account("new-a", "Current A"),
      account("new-b", "Current B"),
    ]
    await ui.render()
    await ui.run(() => oldChoose(oldRow))
    expect(ui.model.accountState.kind).toBe("choose")
    expect(JSON.stringify(ui.model.accountState)).not.toContain(oldRow.name)
  } finally {
    await ui.close()
  }
})

test("retained submit cannot post after A→B→A generation retirement", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    const oldSubmit = ui.model.submit
    profile = { ...profile, id: "actor-b" }
    generation++
    await ui.render()
    profile = { ...originalProfile }
    generation++
    await ui.render()
    await ui.run(() => oldSubmit())
    expect(requests).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

test("profile Store change cannot reuse cached availability and account read from original Store", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    profile = { ...profile, storeId: "store-b" }
    generation++
    // Availability and account data still represent Store A while Store B loads.
    await ui.render()
    const blocked = ui.model.accountBlocksConfirm
    await ui.run(() => ui.model.submit())
    expect({ blocked, requests }).toEqual({ blocked: true, requests: [] })
  } finally {
    await ui.close()
  }
})

test("foreign-currency Book cannot supply the receiving account for this sale", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    accountData = {
      book: { id: "book-usd", currencyCode: "USD" },
      accounts: [account()],
    }
    await ui.render()
    expect(ui.model.currencyCode).toBe("NGN")
    const blocked = ui.model.accountBlocksConfirm
    await ui.run(() => ui.model.submit())
    expect({ blocked, requests }).toEqual({ blocked: true, requests: [] })
  } finally {
    await ui.close()
  }
})

test("background account refresh does not authorize posting from its stale eligible snapshot", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    accountFetching = true
    await ui.render()
    const blocked = ui.model.accountBlocksConfirm
    await ui.run(() => ui.model.submit())
    expect({ blocked, requests }).toEqual({ blocked: true, requests: [] })
  } finally {
    await ui.close()
  }
})

test("late canonical success after owner switch cannot show old completion or fire current callbacks", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    let finish: (value: { id: string; orderNumber: string }) => void = () => {
      throw Error("Mutation not started")
    }
    mutationResult = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    let pending: Promise<void> | undefined
    await ui.run(() => {
      pending = ui.model.submit()
    })
    expect(requests).toHaveLength(1)
    profile = { ...profile, id: "actor-b" }
    generation++
    await ui.render()
    await ui.run(async () => {
      finish({ id: "old-owner-order", orderNumber: "OLD-PRIVATE" })
      await pending
    })
    expect({ completion: ui.model.completion, recorded, completed }).toEqual({
      completion: null,
      recorded: [],
      completed: [],
    })
  } finally {
    await ui.close()
  }
})

test("first account read must finish after mount before paid posting is available", async () => {
  accountFetchedAfterMount = false
  const ui = await mount()
  try {
    await paidDraft(ui)
    expect(ui.model.accountState.kind).toBe("loading")
    await ui.run(() => ui.model.submit())
    expect(requests).toHaveLength(0)
    accountFetchedAfterMount = true
    await ui.render()
    expect(ui.model.accountState.kind).toBe("selected")
  } finally {
    await ui.close()
  }
})

test("retained ready submit must honor a later explicit account-read denial", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    const oldSubmit = ui.model.submit
    accountError = { data: { code: "FORBIDDEN" } }
    await ui.render()
    expect(ui.model.accountState.kind).toBe("denied")
    await ui.run(() => oldSubmit())
    expect(requests).toHaveLength(0)
  } finally {
    await ui.close()
  }
})

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw Error("Deferred result was not initialized")
  }
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

test("late previous-owner success cannot silently mark the new owner's draft submitted", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    const saved = deferred<{ id: string; orderNumber: string }>()
    mutationResult = () => saved.promise
    let pending: Promise<void> | undefined
    await ui.run(() => {
      pending = ui.model.submit()
    })
    profile = { ...profile, id: "actor-b" }
    generation++
    await ui.render()
    await ui.run(async () => {
      saved.resolve({ id: "old-order", orderNumber: "OLD" })
      await pending
    })
    expect(ui.model.completion).toBeNull()
    expect(ui.model.actionsLocked).toBe(false)
    await ui.run(() => ui.model.setAmountReceived("10"))
    expect(ui.model.amountReceived).toBe("10")
  } finally {
    await ui.close()
  }
})

test("owner switch while success lists refresh hides old completion and suppresses post-refresh callback", async () => {
  const ui = await mount()
  const refreshed = deferred<void>()
  try {
    await paidDraft(ui)
    refreshResult = () => refreshed.promise
    let pending: Promise<void> | undefined
    await ui.run(() => {
      pending = ui.model.submit()
    })
    expect(recorded).toHaveLength(1)
    expect(completed).toHaveLength(0)
    profile = { ...profile, id: "actor-b" }
    generation++
    await ui.render()
    await ui.run(async () => {
      refreshed.resolve()
      await pending
    })
    expect(completed).toHaveLength(0)
    expect(ui.model.completion).toBeNull()
    expect(ui.model.postSubmitWarning).toBeNull()
  } finally {
    refreshed.resolve()
    await ui.close()
  }
})

test("unmount while saved lists refresh suppresses later completion callback", async () => {
  const ui = await mount()
  const refreshed = deferred<void>()
  await paidDraft(ui)
  refreshResult = () => refreshed.promise
  let pending: Promise<void> | undefined
  await ui.run(() => {
    pending = ui.model.submit()
  })
  expect(recorded).toHaveLength(1)
  await ui.close()
  refreshed.resolve()
  await pending
  expect(completed).toHaveLength(0)
})

test("retained paid submit cannot combine old received amount with current unpaid destination state", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    const oldSubmit = ui.model.submit
    await ui.run(() => ui.model.setAmountReceived(""))
    expect(ui.model.accountState.kind).toBe("not_needed")
    await ui.run(() => oldSubmit())
    // Either refusing the retired draft or using current unpaid facts is safe.
    expect(
      requests.every(
        (input) =>
          !input ||
          typeof input !== "object" ||
          Reflect.get(input, "initialPayment") === undefined,
      ),
    ).toBe(true)
  } finally {
    await ui.close()
  }
})

test("retained cash submit cannot pair stale method with a newly selected transfer account", async () => {
  accountData.accounts = [
    account(),
    account("bank-b", "Transfer bank", ["bank_transfer"]),
  ]
  const ui = await mount()
  try {
    await paidDraft(ui)
    const oldSubmit = ui.model.submit
    await ui.run(() => ui.model.setPaymentMethod("bank_transfer"))
    expect(ui.model.accountState).toMatchObject({
      kind: "selected",
      account: { id: "bank-b" },
    })
    await ui.run(() => oldSubmit())
    const methods = requests.map((input) => {
      const payment =
        input && typeof input === "object"
          ? Reflect.get(input, "initialPayment")
          : undefined
      return payment && typeof payment === "object"
        ? Reflect.get(payment, "method")
        : undefined
    })
    expect(methods.every((method) => method === "bank_transfer")).toBe(true)
  } finally {
    await ui.close()
  }
})

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

test("dedicated account query records into actual scoped balance-free persisted cache", async () => {
  const ui = await mount()
  try {
    expect(accountCache.getState().read("NGN")).toBeNull()
    await ui.run(() => invokeAccountQuery())
    expect<unknown>(accountCache.getState().read("NGN")?.data).toEqual(
      accountData,
    )
    const saved = persisted.get(
      "onboarding-storage:ewatrade-mobile-checkout-accounts",
    )
    if (!saved) throw Error("Expected actual account cache persistence")
    expect(saved).toContain("Till A")
    expect(saved).not.toContain("balance")
    expect(saved).not.toContain("inert-fixture-token")
  } finally {
    await ui.close()
  }
})

test("query ticket captured before await cannot write after actor/generation changes", async () => {
  const ui = await mount()
  try {
    const pending = deferred<typeof accountData>()
    accountTransport = () => pending.promise
    let request: Promise<unknown> | undefined
    await ui.run(() => {
      request = invokeAccountQuery()
    })
    profile = { ...profile, id: "actor-b" }
    generation++
    await ui.render()
    await ui.run(async () => {
      pending.resolve(accountData)
      await request
    })
    expect(accountCache.getState().read("NGN")).toBeNull()
    expect(accountCache.getState().snapshots).toEqual({})
  } finally {
    await ui.close()
  }
})

test("retained previous-owner query wrapper cannot stamp its result into the new owner's cache", async () => {
  const ui = await mount()
  try {
    const originalQuery = latestAccountQuery()
    const originalData = structuredClone(accountData)
    profile = { ...profile, id: "actor-b" }
    generation++
    await ui.render()
    accountTransport = async () => originalData
    await ui.run(async () => {
      try {
        await invokeAccountQuery(originalQuery)
      } catch {}
    })
    expect(accountCache.getState().read("NGN")).toBeNull()
    expect(accountCache.getState().snapshots).toEqual({})
  } finally {
    await ui.close()
  }
})

test("retained previous-owner denied query cannot erase a fresh current-owner snapshot", async () => {
  const ui = await mount()
  try {
    const originalQuery = latestAccountQuery()
    profile = { ...profile, id: "actor-b" }
    generation++
    accountData = {
      book: { id: "book-b", currencyCode: "NGN" },
      accounts: [account("cash-b", "Current B till")],
    }
    await ui.render()
    await ui.run(() => invokeAccountQuery())
    const before = accountCache.getState().read("NGN")
    accountTransport = async () => {
      throw Object.assign(new Error("Denied old request"), {
        data: { code: "FORBIDDEN" },
      })
    }
    await ui.run(async () => {
      try {
        await invokeAccountQuery(originalQuery)
      } catch {}
    })
    expect(accountCache.getState().read("NGN")).toEqual(before)
  } finally {
    await ui.close()
  }
})

for (const code of ["FORBIDDEN", "UNAUTHORIZED", "NETWORK"] as const) {
  test(`current ${code} account query ${code === "NETWORK" ? "retains" : "forgets"} the saved snapshot`, async () => {
    const ui = await mount()
    try {
      await ui.run(() => invokeAccountQuery())
      const before = accountCache.getState().read("NGN")
      const failure = Object.assign(new Error("Controlled read failure"), {
        data: { code },
      })
      accountTransport = async () => {
        throw failure
      }
      await ui.run(async () => {
        await expect(invokeAccountQuery()).rejects.toBe(failure)
      })
      expect(accountCache.getState().read("NGN")).toEqual(
        code === "NETWORK" ? before : null,
      )
    } finally {
      await ui.close()
    }
  })
}

test("offline paid sale queues the actually cached account without canonical receipt or online dispatch", async () => {
  const ui = await mount()
  try {
    await ui.run(() => invokeAccountQuery())
    await paidDraft(ui)
    offlineMode = true
    await ui.render()
    expect(ui.model.accountState).toMatchObject({
      kind: "selected",
      cached: true,
      account: { id: "cash-a" },
    })
    await ui.run(() => ui.model.submit())
    expect(requests).toEqual([])
    expect(offlineQueue.getState().commands).toHaveLength(1)
    expect(offlineQueue.getState().commands[0]).toMatchObject({
      actorUserId: profile.id,
      storeId: profile.storeId,
      businessId: profile.businessId,
      localStatus: "pending",
      payload: {
        initialPayment: { moneyAccountId: "cash-a", amountMinor: 5000 },
      },
    })
    expect(ui.model.completion).toMatchObject({ status: "queued" })
    expect(ui.model.completion?.orderId).toBeUndefined()
  } finally {
    await ui.close()
  }
})

for (const missing of [
  "snapshot",
  "actor",
  "Store",
  "currency",
  "identity",
] as const) {
  test(`offline paid sale cannot queue with missing/current-mismatched ${missing}`, async () => {
    const ui = await mount()
    try {
      if (missing !== "snapshot") await ui.run(() => invokeAccountQuery())
      await paidDraft(ui)
      if (missing === "actor") profile = { ...profile, id: "actor-b" }
      if (missing === "Store") profile = { ...profile, storeId: "store-b" }
      if (missing === "currency") profile = { ...profile, currencyCode: "USD" }
      if (missing === "identity") profile = { ...profile, id: "" }
      offlineMode = true
      await ui.render()
      expect(ui.model.accountBlocksConfirm).toBe(true)
      await ui.run(() => ui.model.submit())
      expect(offlineQueue.getState().commands).toEqual([])
      expect(requests).toEqual([])
    } finally {
      await ui.close()
    }
  })
}

test("actual cache hydration restores offline account eligibility after a cold saved snapshot", async () => {
  const ui = await mount()
  try {
    await ui.run(() => invokeAccountQuery())
    const key = "onboarding-storage:ewatrade-mobile-checkout-accounts"
    const saved = persisted.get(key)
    if (!saved) throw Error("Expected real persisted cache")
    await paidDraft(ui)
    await ui.run(() =>
      accountCache.setState({ snapshots: {}, locallyChangedScopes: {} }),
    )
    offlineMode = true
    accountFetchedAfterMount = false
    await ui.render()
    expect(ui.model.accountState.kind).toBe("offline_unavailable")
    persisted.set(key, saved)
    await ui.run(() => accountCache.persist.rehydrate())
    expect(ui.model.accountState).toMatchObject({
      kind: "selected",
      cached: true,
      account: { id: "cash-a" },
    })
    await ui.run(() => ui.model.submit())
    expect(
      offlineQueue.getState().commands[0]?.payload.initialPayment
        ?.moneyAccountId,
    ).toBe("cash-a")
  } finally {
    await ui.close()
  }
})

test("offline deliberate account choice becoming ineligible asks again without substituting another account", async () => {
  accountData.accounts = [
    account(),
    account("bank-b", "Transfer bank", ["bank_transfer"]),
  ]
  const ui = await mount()
  try {
    await ui.run(() => invokeAccountQuery())
    await paidDraft(ui)
    await ui.run(() => ui.model.chooseAccount(accountAt(0)))
    offlineMode = true
    await ui.render()
    await ui.run(() => ui.model.setPaymentMethod("bank_transfer"))
    expect(ui.model.accountState).toMatchObject({
      kind: "choose_again",
      cached: true,
      previousName: "Till A",
    })
    await ui.run(() => ui.model.submit())
    expect(offlineQueue.getState().commands).toEqual([])
  } finally {
    await ui.close()
  }
})

for (const transition of ["online-to-offline", "offline-to-online"] as const) {
  test(`retained submit cannot dispatch through a stale ${transition} mode`, async () => {
    const ui = await mount()
    try {
      await ui.run(() => invokeAccountQuery())
      await paidDraft(ui)
      if (transition === "offline-to-online") {
        offlineMode = true
        await ui.render()
      }
      const oldSubmit = ui.model.submit
      offlineMode = transition === "online-to-offline"
      await ui.render()
      await ui.run(() => oldSubmit())
      expect({ requests, queued: offlineQueue.getState().commands }).toEqual({
        requests: [],
        queued: [],
      })
    } finally {
      await ui.close()
    }
  })
}

const eligibleProduct: SaleOfferingChoice = {
  id: "product-offering",
  catalogItemId: "product-item",
  itemName: "Rice",
  displayName: "Rice",
  offeringName: "bag",
  kind: "product_unit",
  fixedPriceMinor: 5000,
  currencyCode: "NGN",
  configurationVersionId: "product-config",
  balanceRevision: 3,
  availableQuantity: "10",
  unitName: "bag",
}
async function delivery(ui: UI, future: boolean) {
  const selected = new Date(Date.now() + (future ? 86_400_000 : 0))
  await ui.run(() => ui.model.setDeliveryPickerMode("date"))
  await ui.run(() =>
    ui.model.changeDeliveryDueAt(
      {
        type: "set",
        nativeEvent: { timestamp: selected.getTime(), utcOffset: 0 },
      },
      selected,
    ),
  )
}

test("untouched eligible Product due now defaults fulfillment on in the actual submitted command", async () => {
  const ui = await mount()
  try {
    await ui.run(() => ui.model.addOffering(eligibleProduct))
    expect(ui.model.fulfillmentOption).toMatchObject({
      canFulfillNow: true,
      fulfillNow: true,
    })
    await ui.run(() => ui.model.proceedToCustomer())
    await ui.run(() => ui.model.selectCustomer(null))
    await ui.run(() => ui.model.submit())
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      fulfillNow: true,
      lines: [
        {
          offeringId: "product-offering",
          quantity: "1",
          expectedBalanceRevision: 3,
          expectedConfigurationVersionId: "product-config",
        },
      ],
    })
  } finally {
    await ui.close()
  }
})

test("explicit Product fulfillment off survives step changes and a future-to-now delivery transition", async () => {
  const ui = await mount()
  try {
    await ui.run(() => ui.model.addOffering(eligibleProduct))
    await ui.run(() => ui.model.setFulfillNowRequested(false))
    await ui.run(() => ui.model.proceedToCustomer())
    await ui.run(() => ui.model.selectCustomer(null))
    await ui.run(() => ui.model.setStep("items"))
    expect(ui.model.fulfillmentOption.fulfillNow).toBe(false)
    await delivery(ui, true)
    expect(ui.model.fulfillmentOption).toMatchObject({
      canFulfillNow: false,
      fulfillNow: false,
    })
    await delivery(ui, false)
    expect(ui.model.fulfillmentOption).toMatchObject({
      canFulfillNow: true,
      fulfillNow: false,
    })
    await ui.run(() => ui.model.submit())
    expect(requests[0]).toMatchObject({ fulfillNow: false })
  } finally {
    await ui.close()
  }
})

test("a future Product delivery disables fulfillment even when untouched default requests it", async () => {
  const ui = await mount()
  try {
    await ui.run(() => ui.model.addOffering(eligibleProduct))
    await delivery(ui, true)
    expect(ui.model.fulfillmentOption).toMatchObject({
      canFulfillNow: false,
      fulfillNow: false,
    })
    await ui.run(() => ui.model.submit())
    expect(requests[0]).toMatchObject({ fulfillNow: false })
  } finally {
    await ui.close()
  }
})

test("untouched Product fulfillment returns on when future delivery becomes due now", async () => {
  const ui = await mount()
  try {
    await ui.run(() => ui.model.addOffering(eligibleProduct))
    await delivery(ui, true)
    await delivery(ui, false)
    expect(ui.model.fulfillmentOption).toMatchObject({
      canFulfillNow: true,
      fulfillNow: true,
    })
  } finally {
    await ui.close()
  }
})

test("a Service-only sale never requests Product stock fulfillment", async () => {
  const ui = await mount()
  try {
    await ui.run(() =>
      ui.model.addOffering({
        ...eligibleProduct,
        kind: "service",
        id: "service-offering",
        configurationVersionId: undefined,
        balanceRevision: undefined,
        availableQuantity: undefined,
      }),
    )
    expect(ui.model.fulfillmentOption).toMatchObject({
      canFulfillNow: false,
      fulfillNow: false,
    })
    await ui.run(() => ui.model.submit())
    expect(requests[0]).toMatchObject({
      fulfillNow: false,
      lines: [
        {
          offeringId: "service-offering",
          expectedConfigurationVersionId: undefined,
          expectedBalanceRevision: undefined,
        },
      ],
    })
    expect(offlineQueue.getState().commands).toEqual([])
  } finally {
    await ui.close()
  }
})

test("Quick sale fulfillment retains the catalog-free payload and invents no Product stock identity", async () => {
  const ui = await mount()
  try {
    await paidDraft(ui)
    expect(ui.model.fulfillmentOption.fulfillNow).toBe(true)
    await ui.run(() => ui.model.submit())
    expect(requests[0]).toMatchObject({
      fulfillNow: true,
      lines: [{ custom: "quick_sale", amountMinor: 5000, description: "Rice" }],
    })
    const request = requests[0]
    if (!request || typeof request !== "object")
      throw Error("Expected captured sale")
    expect(Reflect.get(request, "lines")).toEqual([
      { custom: "quick_sale", amountMinor: 5000, description: "Rice" },
    ])
    expect(offlineQueue.getState().commands).toEqual([])
  } finally {
    await ui.close()
  }
})

for (const description of ["", " \n\t "]) {
  for (const action of ["Continue", "Confirm"] as const) {
    test(`${action} refuses ${description ? "whitespace-only" : "blank"} Quick sale description while keeping its entered amount and text`, async () => {
      const ui = await mount()
      try {
        await ui.run(() => ui.model.addCatalogFreeLine("quick_sale"))
        const line = ui.model.catalogFreeLines[0]
        if (!line) throw Error("Expected Quick sale draft")
        await ui.run(() =>
          ui.model.updateCatalogFreeLine(line.id, {
            amount: "50",
            description,
          }),
        )
        if (action === "Confirm") await ui.run(() => ui.model.setStep("review"))
        await ui.run(() =>
          action === "Continue"
            ? ui.model.proceedToCustomer()
            : ui.model.submit(),
        )
        expect(ui.model.step).toBe("items")
        expect(ui.model.catalogFreeErrorsVisible).toBe(true)
        expect(ui.model.error).toContain("Describe what was sold")
        expect(ui.model.catalogFreeLines[0]).toMatchObject({
          amount: "50",
          description,
        })
        expect(ui.model.totalMinor).toBe(5000)
        expect(requests).toEqual([])
        expect(offlineQueue.getState().commands).toEqual([])
      } finally {
        await ui.close()
      }
    })
  }
}

test("actual description field shows its required error after blocked Continue and preserves price while the user corrects words", async () => {
  const ui = await mount(true)
  try {
    await ui.run(() => ui.model.addCatalogFreeLine("quick_sale"))
    const line = ui.model.catalogFreeLines[0]
    if (!line) throw Error("Expected Quick sale draft")
    await ui.run(() =>
      ui.model.updateCatalogFreeLine(line.id, {
        amount: "50",
        description: "  ",
      }),
    )
    expect(ui.text).toContain("What was sold?")
    expect(ui.text).toContain("Required")
    expect(ui.text).not.toContain("Describe what was sold")
    await ui.run(() => ui.model.proceedToCustomer())
    expect(ui.text).toContain("Describe what was sold")
    const field = descriptionFields.get("sale-catalog-free-description-0")
    if (!field) throw Error("Expected actual rendered description field")
    expect(field.accessibilityLabel).toBe("Quick sale description, required")
    expect(field.accessibilityHint).toContain("Describe what was sold")
    expect(field.value).toBe("  ")
    await ui.run(() => field.onChangeText("Two bags of rice"))
    expect(descriptionFields.get(field.testID)?.value).toBe("Two bags of rice")
    expect(ui.model.catalogFreeLines[0]).toMatchObject({
      amount: "50",
      description: "Two bags of rice",
    })
    expect(ui.text).not.toContain("Describe what was sold")
    await ui.run(() => ui.model.proceedToCustomer())
    expect(ui.model.step).toBe("customer")
    expect(ui.model.error).toBeNull()
  } finally {
    await ui.close()
  }
})

test("blurring an untouched Quick sale description reveals the field error without deleting the typed price", async () => {
  const ui = await mount(true)
  try {
    await ui.run(() => ui.model.addCatalogFreeLine("quick_sale"))
    const line = ui.model.catalogFreeLines[0]
    if (!line) throw Error("Expected Quick sale draft")
    await ui.run(() =>
      ui.model.updateCatalogFreeLine(line.id, { amount: "12.50" }),
    )
    const field = descriptionFields.get("sale-catalog-free-description-0")
    if (!field) throw Error("Expected actual rendered description field")
    await ui.run(() => field.onBlur())
    expect(ui.text).toContain("Describe what was sold")
    expect(ui.model.catalogFreeLines[0]?.amount).toBe("12.50")
    expect(ui.model.totalMinor).toBe(1250)
  } finally {
    await ui.close()
  }
})

test("Additional cost description remains optional in the actual field, Continue and submitted command", async () => {
  const ui = await mount(true)
  try {
    await ui.run(() => ui.model.addCatalogFreeLine("additional_cost"))
    const line = ui.model.catalogFreeLines[0]
    if (!line) throw Error("Expected Additional cost draft")
    await ui.run(() => ui.model.updateCatalogFreeLine(line.id, { amount: "5" }))
    expect(ui.text).toContain("Optional")
    expect(
      descriptionFields.get("sale-catalog-free-description-0")
        ?.accessibilityLabel,
    ).toBe("Additional cost description, optional")
    await ui.run(() => ui.model.proceedToCustomer())
    expect(ui.model.step).toBe("customer")
    expect(ui.model.error).toBeNull()
    await ui.run(() => ui.model.submit())
    expect(requests[0]).toMatchObject({
      lines: [{ custom: "additional_cost", amountMinor: 500 }],
    })
  } finally {
    await ui.close()
  }
})
