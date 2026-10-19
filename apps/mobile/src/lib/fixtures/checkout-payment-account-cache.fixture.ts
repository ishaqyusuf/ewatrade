import { beforeEach, expect, mock, test } from "bun:test"
import type {
  CheckoutAccountReadTicket,
  CheckoutPaymentAccounts,
} from "../checkout-payment-account-cache"
import type { MobileSession } from "../session-store"

// Actual session, Zustand, persistence adapter and parser. Only native storage
// and the tRPC cache-generation port are inert. No network or database access.
const secure = new Map<string, string>()
const persisted = new Map<string, string>()
let generation = 0
let storageReadOverride: (() => Promise<string | null>) | null = null
mock.module("expo-secure-store", () => ({
  getItem: (key: string) => secure.get(key) ?? null,
  setItem: (key: string, value: string) => secure.set(key, value),
  deleteItemAsync: async (key: string) => {
    secure.delete(key)
  },
}))
mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) =>
      storageReadOverride
        ? storageReadOverride()
        : (persisted.get(key) ?? null),
    setItem: async (key: string, value: string) => {
      persisted.set(key, value)
    },
    removeItem: async (key: string) => {
      persisted.delete(key)
    },
  },
}))
mock.module(new URL("../../trpc/client.tsx", import.meta.url).pathname, () => ({
  getDataCacheGeneration: () => generation,
}))
const { setSession, deleteSession } = await import("../session-store")
const { useCheckoutPaymentAccountStore: store } = await import(
  "../../store/checkoutPaymentAccountStore"
)
const { checkoutAccountScopeKey } = await import(
  "../checkout-payment-account-cache"
)
await store.persist.rehydrate()
const state = () => store.getState()
const storageKey = "onboarding-storage:ewatrade-mobile-checkout-accounts"
const profile: MobileSession["profile"] = {
  id: "actor-a",
  businessId: "business-a",
  storeId: "store-a",
  currencyCode: "NGN",
  name: "Actor A",
  email: "inert@example.test",
}
function session(next = profile) {
  setSession({ token: "inert-test-token", profile: next })
}
function ticket(currency = "NGN"): CheckoutAccountReadTicket {
  const result = state().capture(currency)
  if (!result) throw Error("Expected current complete cache owner")
  return result
}
function response(currencyCode = "NGN", name = "Till") {
  const paymentMethods: CheckoutPaymentAccounts["accounts"][number]["paymentMethods"] =
    ["cash"]
  return {
    book: { id: "book-a", currencyCode },
    accounts: [
      {
        id: "cash-a",
        name,
        purpose: "CASH" as const,
        paymentMethods,
        paused: false,
      },
    ],
  }
}
function snapshot(owner = ticket().scope, checkedAt = 100, name = "Till") {
  return {
    scope: { ...owner },
    checkedAt,
    data: response(owner.currencyCode, name),
  }
}
async function restore(snapshots: unknown) {
  persisted.set(
    storageKey,
    JSON.stringify({ state: { snapshots }, version: 1 }),
  )
  await store.persist.rehydrate()
}
beforeEach(() => {
  storageReadOverride = null
  secure.clear()
  persisted.clear()
  generation += 1
  session()
  store.setState({ snapshots: {}, locallyChangedScopes: {} })
})

test("records dedicated balance-free DTO through actual persistence and restores canonical keys", async () => {
  expect(state().record(ticket(), response())).toBe(true)
  const saved = persisted.get(storageKey)
  if (!saved) throw Error("Expected actual persist write")
  expect(JSON.parse(saved)).toEqual({
    state: { snapshots: state().snapshots },
    version: 1,
  })
  expect(saved).not.toContain("inert-test-token")
  expect(saved).not.toContain(profile.email)
  expect(saved).not.toContain("balance")
  const original = state().read("NGN")
  // Simulate a fresh store lifetime before restoring its persisted JSON.
  store.setState({ snapshots: {}, locallyChangedScopes: {} })
  persisted.set(storageKey, saved)
  await store.persist.rehydrate()
  expect(state().read("NGN")).toEqual(original)
  expect(Object.keys(state().snapshots)).toEqual([
    checkoutAccountScopeKey(ticket().scope),
  ])
})

for (const [axis, next] of [
  ["actor", { ...profile, id: "actor-b" }],
  ["business", { ...profile, businessId: "business-b" }],
  ["Store", { ...profile, storeId: "store-b" }],
] as const) {
  test(`${axis} switch hides prior data and rejects stale response/denial`, () => {
    const previous = ticket()
    expect(state().record(previous, response())).toBe(true)
    const captured = structuredClone(state().snapshots)
    session(next)
    expect(state().read("NGN")).toBeNull()
    expect(state().record(previous, response("NGN", "Wrong owner"))).toBe(false)
    state().forget(previous)
    expect(state().snapshots).toEqual(captured)
    expect(ticket().scope).not.toEqual(previous.scope)
    session()
    expect(state().read("NGN")?.data.accounts[0]?.name).toBe("Till")
  })
}

test("currency partitions response, reads and denial without clearing another currency", () => {
  const ngn = ticket()
  const usd = ticket("USD")
  expect(state().record(ngn, response())).toBe(true)
  expect(state().read("USD")).toBeNull()
  expect(state().record(usd, response())).toBe(false)
  expect(state().record(usd, response("USD", "Dollar till"))).toBe(true)
  state().forget(usd)
  expect(state().read("USD")).toBeNull()
  expect(state().read("NGN")?.data.accounts[0]?.name).toBe("Till")
  expect(state().capture("ngn")).toBeNull()
})

test("A→B→A and generation retirement prevent both stale response and stale denial", () => {
  const first = ticket()
  expect(state().record(first, response())).toBe(true)
  session({ ...profile, id: "actor-b" })
  generation += 1
  session()
  generation += 1
  expect(state().record(first, response("NGN", "Stale completion"))).toBe(false)
  state().forget(first)
  expect(state().read("NGN")?.data.accounts[0]?.name).toBe("Till")
  expect(state().record(ticket(), response("NGN", "Fresh completion"))).toBe(
    true,
  )
  expect(state().read("NGN")?.data.accounts[0]?.name).toBe("Fresh completion")
})

test("logout and incomplete identity cannot read, capture, record or erase prior data", async () => {
  const previous = ticket()
  state().record(previous, response())
  const saved = structuredClone(state().snapshots)
  await deleteSession()
  expect(state().capture("NGN")).toBeNull()
  expect(state().read("NGN")).toBeNull()
  expect(state().record(previous, response())).toBe(false)
  state().forget(previous)
  expect(state().snapshots).toEqual(saved)
  for (const patch of [
    { id: "" },
    { businessId: undefined },
    { storeId: undefined },
  ]) {
    session({ ...profile, ...patch })
    expect(state().capture("NGN")).toBeNull()
    expect(state().read("NGN")).toBeNull()
  }
})

test("explicit current denial removes only the current scope from memory and persistence", async () => {
  const current = ticket()
  state().record(current, response())
  session({ ...profile, id: "actor-b" })
  state().record(ticket(), response("NGN", "Other owner"))
  session()
  state().forget(current)
  expect(state().read("NGN")).toBeNull()
  const saved = persisted.get(storageKey)
  if (!saved) throw Error("Expected denial to persist cache removal")
  expect(Object.values(JSON.parse(saved).state.snapshots)).toHaveLength(1)
  await store.persist.rehydrate()
  expect(state().read("NGN")).toBeNull()
  session({ ...profile, id: "actor-b" })
  expect(state().read("NGN")?.data.accounts[0]?.name).toBe("Other owner")
})

test("failed or invalid read does not erase last-known data; confirmed no Book does", () => {
  state().record(ticket(), response())
  for (const failure of [
    new Error("offline"),
    undefined,
    null,
    { message: "timeout" },
    { ...response(), balances: [100] },
  ]) {
    expect(state().record(ticket(), failure)).toBe(false)
    expect(state().read("NGN")?.data.accounts[0]?.name).toBe("Till")
  }
  expect(state().record(ticket(), { book: null, accounts: [] })).toBe(true)
  expect(state().read("NGN")?.data).toEqual({ book: null, accounts: [] })
})

test("response, captured profile and returned snapshot mutations cannot alter private stored facts", () => {
  const owner = { ...profile }
  session(owner)
  const captured = ticket()
  owner.id = "mutated-profile"
  expect(captured.scope.actorUserId).toBe(profile.id)
  const data = response()
  expect(state().record(captured, data)).toBe(true)
  data.book.id = "mutated-book"
  const inputAccount = data.accounts[0]
  if (!inputAccount) throw Error("Expected caller account")
  inputAccount.name = "mutated-input"
  inputAccount.paymentMethods.push("pos")
  const read = state().read("NGN")
  const readAccount = read?.data.accounts[0]
  if (!read?.data.book || !readAccount) throw Error("Expected stored snapshot")
  read.scope.actorUserId = "mutated-result-owner"
  read.data.book.id = "mutated-result-book"
  readAccount.name = "mutated-result-name"
  expect(state().read("NGN")).toMatchObject({
    scope: { actorUserId: profile.id },
    data: {
      book: { id: "book-a" },
      accounts: [{ name: "Till", paymentMethods: ["cash"] }],
    },
  })
})

test("rehydration rejects malformed/private/foreign-currency/duplicate/invalid-method DTOs", async () => {
  const valid = snapshot()
  const account = valid.data.accounts[0]
  if (!account) throw Error("Expected original account")
  const invalid = [
    null,
    [],
    "wrong",
    { ...valid, checkedAt: Number.NaN },
    { ...valid, scope: { ...valid.scope, actorUserId: "" } },
    { ...valid, privateToken: "private-token" },
    { ...valid, data: { ...valid.data, balance: 100 } },
    {
      ...valid,
      data: { ...valid.data, book: { ...valid.data.book, balance: 100 } },
    },
    {
      ...valid,
      data: { ...valid.data, book: { id: "book-a", currencyCode: "USD" } },
    },
    { ...valid, data: { ...valid.data, book: null } },
    { ...valid, data: { ...valid.data, accounts: [account, account] } },
    {
      ...valid,
      data: { ...valid.data, accounts: [{ ...account, balance: 100 }] },
    },
    {
      ...valid,
      data: {
        ...valid.data,
        accounts: [{ ...account, paymentMethods: ["cash", "cash"] }],
      },
    },
    {
      ...valid,
      data: {
        ...valid.data,
        accounts: [{ ...account, paymentMethods: ["bank_transfer"] }],
      },
    },
    {
      ...valid,
      data: {
        ...valid.data,
        accounts: [{ ...account, paymentMethods: ["crypto"] }],
      },
    },
  ]
  await restore(
    Object.fromEntries(invalid.map((entry, i) => [`invalid-${i}`, entry])),
  )
  expect(state().snapshots).toEqual({})
  expect(state().read("NGN")).toBeNull()
})

test("rehydration canonicalizes keys, keeps newest duplicate and leaves foreign scope private", async () => {
  const own = snapshot()
  const newest = snapshot(own.scope, 500, "Newest till")
  const other = snapshot(
    { ...own.scope, actorUserId: "actor-b" },
    600,
    "Other actor",
  )
  await restore({
    misleading: own,
    duplicate: newest,
    [checkoutAccountScopeKey(own.scope)]: other,
  })
  expect(Object.keys(state().snapshots)).toHaveLength(2)
  expect(state().read("NGN")?.data.accounts[0]?.name).toBe("Newest till")
  expect(state().snapshots[checkoutAccountScopeKey(other.scope)]).toEqual(other)
  session({ ...profile, id: "actor-b" })
  expect(state().read("NGN")?.data.accounts[0]?.name).toBe("Other actor")
})

test("rehydration cap counts unique valid scopes after duplicate normalization", async () => {
  const own = ticket().scope
  const duplicates = Array.from({ length: 40 }, (_, i) => [
    `duplicate-${i}`,
    snapshot(own, 1000 + i, `Copy ${i}`),
  ])
  const other = snapshot({ ...own, storeId: "store-b" }, 500, "Other Store")
  await restore(Object.fromEntries([...duplicates, ["other", other]]))
  expect(Object.keys(state().snapshots)).toHaveLength(2)
  expect(state().snapshots[checkoutAccountScopeKey(other.scope)]).toEqual(other)
  expect(state().read("NGN")?.data.accounts[0]?.name).toBe("Copy 39")
})

test("rehydration retains exactly the 32 most recent valid unique scopes", async () => {
  const own = ticket().scope
  const entries = Array.from({ length: 40 }, (_, i) => {
    const value = snapshot({ ...own, storeId: `store-${i}` }, i + 1)
    return [`untrusted-key-${i}`, value]
  })
  await restore(Object.fromEntries(entries))
  expect(Object.keys(state().snapshots)).toHaveLength(32)
  expect(
    Object.values(state().snapshots).map((value) => value.checkedAt),
  ).toEqual(Array.from({ length: 32 }, (_, i) => 40 - i))
  session({ ...profile, storeId: "store-0" })
  expect(state().read("NGN")).toBeNull()
  session({ ...profile, storeId: "store-39" })
  expect(state().read("NGN")?.checkedAt).toBe(40)
})

test("new record caps actual memory and persisted state at 32 scopes", async () => {
  const own = ticket().scope
  await restore(
    Object.fromEntries(
      Array.from({ length: 32 }, (_, i) => [
        `old-${i}`,
        snapshot({ ...own, storeId: `store-${i}` }, i + 1),
      ]),
    ),
  )
  expect(state().record(ticket(), response("NGN", "Latest store"))).toBe(true)
  expect(Object.keys(state().snapshots)).toHaveLength(32)
  expect(
    state().snapshots[checkoutAccountScopeKey({ ...own, storeId: "store-0" })],
  ).toBeUndefined()
  expect(state().read("NGN")?.data.accounts[0]?.name).toBe("Latest store")
  const saved = persisted.get(storageKey)
  if (!saved) throw Error("Expected bounded persisted cache")
  expect(Object.keys(JSON.parse(saved).state.snapshots)).toHaveLength(32)
})

for (const action of ["explicit denial", "fresh response"] as const) {
  test(`late hydration cannot undo a newer ${action}`, async () => {
    const owner = ticket()
    state().record(owner, response("NGN", "Old account settings"))
    const oldSaved = persisted.get(storageKey)
    if (!oldSaved) throw Error("Expected original saved cache")
    let completeRead: (value: string | null) => void = (_value) => {
      throw Error("Storage read not started")
    }
    const delayed = new Promise<string | null>((resolve) => {
      completeRead = resolve
    })
    storageReadOverride = () => delayed
    const hydration = store.persist.rehydrate()
    if (action === "explicit denial") state().forget(owner)
    else state().record(owner, response("NGN", "Fresh account settings"))
    completeRead(oldSaved)
    await hydration
    expect(state().read("NGN")?.data.accounts[0]?.name ?? null).toBe(
      action === "explicit denial" ? null : "Fresh account settings",
    )
  })
}

test("denial before first restored snapshot fences a late persisted account", async () => {
  const owner = ticket()
  const oldSaved = JSON.stringify({
    state: { snapshots: { old: snapshot(owner.scope) } },
    version: 1,
  })
  let completeRead: (value: string | null) => void = () => {
    throw Error("Storage read not started")
  }
  const delayed = new Promise<string | null>((resolve) => {
    completeRead = resolve
  })
  storageReadOverride = () => delayed
  const hydration = store.persist.rehydrate()
  expect(state().read("NGN")).toBeNull()
  state().forget(owner)
  completeRead(oldSaved)
  await hydration
  expect(state().read("NGN")).toBeNull()
  expect(state().snapshots).toEqual({})
  const saved = persisted.get(storageKey)
  if (!saved) throw Error("Expected denial to persist empty cache")
  expect(JSON.parse(saved).state).toEqual({ snapshots: {} })
})
