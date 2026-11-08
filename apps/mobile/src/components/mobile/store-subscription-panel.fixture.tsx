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
const { StoreSubscriptionPanel } = await import(
  "./store-subscription-panel.native"
)
const render = () => renderToStaticMarkup(createElement(StoreSubscriptionPanel))
const offer = (name: string) =>
  presses.find((press) => press.label.startsWith(name))
const restore = () =>
  presses.find((press) => press.label === "Restore purchases")
beforeEach(() => {
  billing = initial()
  offline = false
  policies = true
  role = "OWNER"
  purchases.length = 0
  presses.length = 0
  messages.length = 0
  restoreCalls = 0
  manageCalls = 0
})
test("mapped monthly offers are ordered and use localized store prices; pressing only delegates checkout", async () => {
  const html = render()
  expect(html.indexOf("Starter")).toBeLessThan(html.indexOf("Growth"))
  expect(html.indexOf("Growth")).toBeLessThan(html.indexOf("Pro</span>"))
  expect(html).toContain("$3.99")
  expect(html).toContain("every 1 month")
  expect(html).not.toContain("₦5,000")
  expect(html).toContain("Coverage is a separate step")
  await offer("Starter")?.press()
  expect(purchases).toEqual(["starter"])
})
test("partial missing period disables only that mapped offer", () => {
  if (!billing) throw new Error("fixture")
  billing.priceDescription = (product) =>
    product.id === "growth" ? null : `${product.displayPrice} every 1 month`
  expect(render()).toContain("Price and billing terms unavailable")
  expect(offer("Starter")?.disabled).toBe(false)
  expect(offer("Growth")?.disabled).toBe(true)
})
test("offline saved state blocks checkout, restore, manage and coverage controls", () => {
  offline = true
  expect(render()).toContain("Offline")
  expect(
    presses
      .filter((press) =>
        /^(Starter|Growth|Pro|Restore|Manage)/.test(press.label),
      )
      .every((press) => press.disabled),
  ).toBe(true)
})
test("staff and admins have no owner purchase or restore controls", () => {
  billing = null
  for (const value of ["STAFF", "ADMIN"]) {
    role = value
    expect(render()).toContain("The owner manages subscriptions")
    expect(presses).toHaveLength(0)
  }
})
test("missing current policy blocks new purchase but keeps eligible restore available", async () => {
  policies = false
  render()
  expect(offer("Starter")?.disabled).toBe(true)
  expect(restore()?.disabled).toBe(false)
  await restore()?.press()
  expect(restoreCalls).toBe(1)
})
test("provider conflict blocks parallel purchase and does not open the wrong store", async () => {
  if (!billing) throw new Error("fixture")
  billing.catalog.data.activeProvider = "PLAY_STORE"
  expect(render()).toContain("another billing provider")
  expect(offer("Starter")?.disabled).toBe(true)
  await presses.find((press) => press.label.startsWith("Manage store"))?.press()
  expect(manageCalls).toBe(0)
  expect(messages[0]).toContain("original billing provider")
})
test("verification failure keeps recovery visible and prevents another checkout", () => {
  if (!billing) throw new Error("fixture")
  billing.verification.isError = true
  billing.message =
    "Your purchase is awaiting verification. Use Restore purchases."
  expect(render()).toContain("awaiting verification")
  expect(offer("Starter")?.disabled).toBe(true)
  expect(restore()?.disabled).toBe(false)
})
test("verified owner but uncovered business stays explicitly Free and offers are collapsed", () => {
  if (!billing) throw new Error("fixture")
  billing.catalog.data.ownerCoverage = {
    enrolled: false,
    reason: "uncovered",
    planId: "free",
    businessLimit: 3,
    coveredBusinessCount: 1,
  }
  const html = render()
  expect(html).toContain("Verified owner subscription")
  expect(html).toContain("remains on Free until you explicitly cover it")
  expect(html).toContain("Compare monthly plans")
  expect(offer("Starter")).toBeUndefined()
})
test("failed catalog refresh retains the snapshot but refuses coverage and new purchase", () => {
  if (!billing) throw new Error("fixture")
  billing.catalog.isError = true
  billing.catalog.data.ownerCoverage = {
    enrolled: false,
    reason: "uncovered",
    planId: "free",
    businessLimit: 3,
    coveredBusinessCount: 1,
  }
  expect(render()).toContain("Any saved coverage is shown below")
  expect(
    presses.find((press) => press.label === "Cover this business")?.disabled,
  ).toBe(true)
})
