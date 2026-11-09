import { beforeEach, expect, mock, test } from "bun:test"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

let offline = false
let policies = true
let role = "OWNER"
let restoreCalls = 0
let manageCalls = 0
const purchases: string[] = []
const messages: Array<string | null> = []
const presses: Array<{
  label: string
  disabled: boolean
  press: () => unknown
}> = []
const initial = () => ({
  catalog: {
    isPending: false,
    isError: false,
    refetch: async () => {},
    data: {
      billingScope: "owner",
      coverageAvailable: true,
      purchaseAvailable: true,
      legalAcceptanceRequired: false,
      activeProvider: null as string | null,
      products: ["pro", "starter", "growth"].map((planId) => ({
        store: "app_store",
        productId: planId,
        planId,
      })),
      ownerCoverage: {
        enrolled: false,
        reason: "inactive_subscription",
        planId: "free",
        businessLimit: 0,
        coveredBusinessCount: 0,
      },
    },
  },
  verification: { isPending: false, isError: false },
  coveragePending: false,
  iap: {
    connected: true,
    subscriptions: [
      { id: "pro", displayPrice: "$22.99" },
      { id: "starter", displayPrice: "$3.99" },
      { id: "growth", displayPrice: "$9.99" },
    ],
  },
  priceDescription: (product: { id: string; displayPrice: string }) =>
    `${product.displayPrice} every 1 month` as string | null,
  productIds: "pro,starter,growth",
  store: "app_store",
  message: null as string | null,
  setMessage: (value: string | null) => messages.push(value),
  purchase: async (product: { id: string }) => {
    purchases.push(product.id)
  },
  restore: async () => {
    restoreCalls++
  },
  changeCoverage: async () => {},
})
let billing: ReturnType<typeof initial> | null = initial()
mock.module("./store-subscription-provider", () => ({
  useStoreSubscription: () => billing,
}))
mock.module("@/hooks/use-auth", () => ({
  useAuthContext: () => ({
    profile: {
      id: "owner",
      businessId: "business",
      businessName: "Current business",
      role,
    },
  }),
}))
mock.module("@/store/operationalModeStore", () => ({
  useOperationalModeStore: (
    select: (state: { isOfflineMode: boolean }) => boolean,
  ) => select({ isOfflineMode: offline }),
}))
mock.module("@/lib/public-legal-url", () => ({
  publicLegalUrl: (path: string) =>
    policies ? `https://example.invalid/${path}` : null,
}))
mock.module("expo-router", () => ({ useRouter: () => ({ push: () => {} }) }))
mock.module("expo-iap", () => ({
  deepLinkToSubscriptions: async () => {
    manageCalls++
  },
}))
mock.module("react-native", () => ({
  ActivityIndicator: () => null,
  Linking: { openURL: async () => {} },
  Alert: { alert: () => {} },
}))
mock.module("@/components/ui/view", () => ({
  View: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}))
mock.module("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) =>
    createElement("span", null, children),
}))
mock.module("@/components/ui/pressable", () => ({
  Pressable: ({
    children,
    onPress,
    disabled = false,
  }: { children: ReactNode; onPress: () => unknown; disabled?: boolean }) => {
    const label = renderToStaticMarkup(
      createElement("span", null, children),
    ).replace(/<[^>]*>/g, "")
    presses.push({ label, disabled, press: onPress })
    return createElement("button", { type: "button", disabled }, children)
  },
}))

mock.module("@/components/ui/icon", () => ({ Icon: () => null }))
mock.module("@/components/ui/modal", () => ({
  Modal: () => null,
  useModal: () => ({
    ref: { current: null },
    present: () => {},
    dismiss: () => {},
  }),
}))
mock.module("@gorhom/bottom-sheet", () => ({
  BottomSheetScrollView: () => null,
  BottomSheetView: () => null,
}))
mock.module("@/lib/session-store", () => ({ getSessionGeneration: () => 1 }))
mock.module("@/trpc/client", () => ({ getDataCacheGeneration: () => 1 }))
const { useSubscriptionPlanPanel } = await import(
  "./store-subscription-panel.native"
)
let currentPlanId: "free" | "starter" | "growth" | "pro" | null = "free"
function Harness() {
  const panel = useSubscriptionPlanPanel({ currentPlanId })
  return createElement("main", null, panel.content, panel.footer)
}
const render = () => renderToStaticMarkup(createElement(Harness))
const action = () =>
  presses.find((press) => press.label.startsWith("Upgrade to"))
beforeEach(() => {
  billing = initial()
  offline = false
  policies = true
  role = "OWNER"
  currentPlanId = "free"
  purchases.length = 0
  presses.length = 0
  messages.length = 0
  restoreCalls = 0
  manageCalls = 0
})
test("selected package uses mapped localized price and separate guarded checkout", async () => {
  const html = render()
  expect(html).toContain("$3.99 per month")
  expect(html).not.toContain("₦5,000")
  expect(html).toContain("Included in")
  expect(action()?.disabled).toBe(false)
  await action()?.press()
  expect(purchases).toEqual(["starter"])
})
test("plan tabs select without starting a purchase", async () => {
  render()
  await presses.find((p) => p.label === "Growth")?.press()
  expect(purchases).toHaveLength(0)
})
test("business Starter compares only higher plans and never offers a second owner purchase", () => {
  if (!billing) throw Error()
  currentPlanId = "starter"
  billing.catalog.data.ownerCoverage = {
    enrolled: true,
    reason: "covered",
    planId: "starter",
    businessLimit: 1,
    coveredBusinessCount: 1,
  }
  const html = render()
  expect(html).not.toContain("owner subscription")
  expect(
    presses
      .filter((p) => ["Free", "Starter", "Growth", "Pro"].includes(p.label))
      .map((p) => p.label),
  ).toEqual(["Growth", "Pro"])
  expect(action()).toBeUndefined()
  expect(presses.some((p) => p.label === "Manage in App Store")).toBe(true)
})
test("unknown plan does not invent a Free tier or an upgrade", () => {
  currentPlanId = null
  expect(render()).toContain("Plan unavailable")
  expect(action()).toBeUndefined()
  expect(purchases).toHaveLength(0)
})
test("offline retains benefits but disables effects", () => {
  offline = true
  expect(render()).toContain("Offline")
  expect(action()?.disabled).toBe(true)
})
test("staff and admin can read benefits without owner effects", () => {
  billing = null
  for (const r of ["STAFF", "ADMIN"]) {
    role = r
    presses.length = 0
    const html = render()
    expect(html).toContain("Staff do not need separate subscriptions")
    expect(html).toContain("Monthly assistant questions")
    expect(action()).toBeUndefined()
    expect(presses.some((p) => /^(Use my|Restore|Manage)/.test(p.label))).toBe(
      false,
    )
  }
})
test("missing policy or verified period blocks checkout", () => {
  policies = false
  render()
  expect(action()?.disabled).toBe(true)
  policies = true
  if (!billing) throw Error()
  billing.priceDescription = () => null
  presses.length = 0
  expect(render()).toContain("Price unavailable")
  expect(action()?.disabled).toBe(true)
})
test("provider conflict uses original provider maintenance without parallel checkout", async () => {
  if (!billing) throw Error()
  billing.catalog.data.activeProvider = "PLAY_STORE"
  expect(render()).toContain("another provider")
  expect(action()).toBeUndefined()
  await presses.find((p) => p.label === "Manage in original store")?.press()
  expect(manageCalls).toBe(0)
  expect(purchases).toHaveLength(0)
})
test("verification failure never enables another purchase", () => {
  if (!billing) throw Error()
  billing.verification.isError = true
  billing.message = "Purchase awaiting verification"
  expect(render()).toContain("awaiting verification")
  expect(action()?.disabled).toBe(true)
})
test("purchased owner plan remains separate from explicit business activation", () => {
  if (!billing) throw Error()
  billing.catalog.data.ownerCoverage = {
    enrolled: false,
    reason: "uncovered",
    planId: "free",
    businessLimit: 1,
    coveredBusinessCount: 0,
  }
  const html = render()
  expect(html).toContain("This business is on")
  expect(presses.some((p) => p.label === "Use my Starter plan here")).toBe(true)
  expect(action()).toBeUndefined()
  expect(purchases).toHaveLength(0)
})
test("failed catalog preserves details and blocks activation", () => {
  if (!billing) throw Error()
  billing.catalog.isError = true
  billing.catalog.data.ownerCoverage = {
    enrolled: false,
    reason: "uncovered",
    planId: "free",
    businessLimit: 1,
    coveredBusinessCount: 0,
  }
  expect(render()).toContain("Subscription availability could not load")
  expect(presses.find((p) => p.label === "Manage in App Store")?.disabled).toBe(
    true,
  )
  expect(presses.some((p) => p.label.startsWith("Use my"))).toBe(false)
})
