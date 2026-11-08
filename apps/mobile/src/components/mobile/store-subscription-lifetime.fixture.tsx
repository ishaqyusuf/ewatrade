import { beforeEach, expect, mock, test } from "bun:test"
import type {
  ProductSubscriptionAndroid,
  ProductSubscriptionIOS,
  Purchase,
} from "expo-iap"
import { type ReactNode, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

let generation = 0
let cacheGeneration = 0
let platform = "android"
let availableProducts: Array<
  ProductSubscriptionAndroid | ProductSubscriptionIOS
> = []
const profile = { id: "owner", businessId: "business", role: "OWNER" }
const products = [
  { store: "play_store", productId: "growth", planId: "growth" },
]
const catalogData = () => ({
  billingScope: "owner" as "owner" | "business",
  coverageAvailable: true,
  ownerCoverage: {
    enrolled: false,
    reason: "uncovered" as "uncovered" | "covered" | "inactive_subscription",
    planId: "free",
    businessLimit: 3,
    coveredBusinessCount: 1,
  },
  products,
  purchaseAvailable: true,
  accountToken: "owner-account",
  activeProvider: null as "PLAY_STORE" | "APP_STORE" | null,
  activePlayProductId: null as string | null,
})
let data = catalogData()
let refetch = async () => ({ isSuccess: true, data })
let listPurchases: () => Promise<Purchase[]> = async () => []
let verify: () => Promise<void> = async () => {}
let mutateCoverage: () => Promise<void> = async () => {}
let onSuccess: (purchase: Purchase) => void = () => {}
const calls: Array<{ operation: string; input?: unknown }> = []

mock.module("@root/mobile-release-scope.json", () => ({
  default: { softwarePlanPurchases: true },
}))
mock.module("@/hooks/use-auth", () => ({
  useAuthContext: () => ({ isAuthenticated: true, profile }),
}))
mock.module("@/lib/session-store", () => ({
  getSession: () => ({ profile }),
  getSessionGeneration: () => generation,
}))
mock.module("@/lib/public-legal-url", () => ({
  publicLegalUrl: () => "https://example.invalid/policy",
}))
mock.module("@/trpc/client", () => ({
  getDataCacheGeneration: () => cacheGeneration,
  useTRPC: () => ({
    storeSubscriptions: {
      catalog: { queryOptions: () => ({}), queryFilter: () => ({}) },
      verifyPurchase: { mutationOptions: () => ({}) },
      enrollBusiness: { mutationOptions: () => ({ operation: "enroll" }) },
      releaseBusiness: { mutationOptions: () => ({ operation: "release" }) },
    },
    retailOps: { subscription: { queryFilter: () => ({}) } },
  }),
}))
mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({ data, refetch: () => refetch() }),
  useMutation: (options: { operation?: string }) => ({
    isPending: false,
    mutateAsync: async (input: unknown) => {
      calls.push({ operation: options.operation ?? "verify", input })
      if (!options.operation) await verify()
      else await mutateCoverage()
    },
  }),
  useQueryClient: () => ({
    invalidateQueries: async () => {
      calls.push({ operation: "refresh" })
    },
  }),
}))
mock.module("expo", () => ({ requireOptionalNativeModule: () => ({}) }))
mock.module("expo-iap", () => ({
  deepLinkToSubscriptions: async () => {},
  useIAP: (callbacks: { onPurchaseSuccess: typeof onSuccess }) => {
    onSuccess = callbacks.onPurchaseSuccess
    return {
      connected: true,
      subscriptions: availableProducts,
      fetchProducts: async () => {},
      requestPurchase: async (input: unknown) => {
        calls.push({ operation: "checkout", input })
      },
    }
  },
  getAvailablePurchases: () => listPurchases(),
  finishTransaction: async () => {
    calls.push({ operation: "finish" })
  },
}))
mock.module("react-native", () => ({
  Platform: {
    get OS() {
      return platform
    },
  },
  Linking: { openURL: async () => {} },
  LogBox: { ignoreLogs: () => {} },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))

const iosEntry = process.env.BILLING_TEST_ENTRYPOINT === "ios"
const provider = iosEntry
  ? await import("./store-subscription-provider.ios")
  : await import("./store-subscription-provider.native")
const { StoreSubscriptionProvider, useStoreSubscription } = provider
function renderController() {
  const captured: { value: ReturnType<typeof useStoreSubscription> } = {
    value: null,
  }
  function Child() {
    captured.value = useStoreSubscription()
    return null
  }
  renderToStaticMarkup(
    createElement(StoreSubscriptionProvider, null, createElement(Child)),
  )
  if (!captured.value) throw new Error("Billing fixture did not mount")
  return captured.value
}

const product: ProductSubscriptionAndroid = {
  id: "growth",
  title: "Growth",
  description: "Monthly",
  nameAndroid: "Growth",
  currency: "NGN",
  displayPrice: "₦15,000",
  platform: "android",
  type: "subs",
  subscriptionOfferDetailsAndroid: [],
  subscriptionOffers: [
    {
      id: "monthly",
      type: "introductory",
      price: 15000,
      displayPrice: "₦15,000",
      offerTokenAndroid: "actual-offer",
      pricingPhasesAndroid: {
        pricingPhaseList: [
          {
            billingCycleCount: 0,
            billingPeriod: "P1M",
            formattedPrice: "₦15,000",
            priceAmountMicros: "15000000000",
            priceCurrencyCode: "NGN",
            recurrenceMode: 1,
          },
        ],
      },
    },
  ],
}
const receipt: Purchase = {
  id: "receipt",
  productId: "growth",
  purchaseToken: "synthetic-token",
  purchaseState: "purchased",
  platform: "android",
  store: "google",
  isAutoRenewing: true,
  quantity: 1,
  transactionDate: 1,
}
beforeEach(() => {
  platform = "android"
  availableProducts = []
  generation++
  cacheGeneration++
  calls.length = 0
  data = catalogData()
  refetch = async () => ({ isSuccess: true, data })
  listPurchases = async () => [receipt]
  verify = async () => {}
  mutateCoverage = async () => {}
})

const appleProduct: ProductSubscriptionIOS = {
  id: "growth.ios",
  title: "Growth",
  description: "Monthly",
  displayNameIOS: "Growth",
  currency: "NGN",
  displayPrice: "₦15,000",
  platform: "ios",
  type: "subs",
  typeIOS: "auto-renewable-subscription",
  introductoryPricePaymentModeIOS: "empty",
  isFamilyShareableIOS: false,
  jsonRepresentationIOS: "{}",
  subscriptionPeriodNumberIOS: "1",
  subscriptionPeriodUnitIOS: "month",
}
const appleReceipt: Purchase = {
  id: "apple-transaction",
  transactionId: "apple-transaction",
  productId: "growth.ios",
  purchaseToken: "not-the-apple-verification-reference",
  platform: "ios",
  store: "apple",
  purchaseState: "purchased",
  isAutoRenewing: true,
  quantity: 1,
  transactionDate: 1,
}
function useAppleCatalog() {
  platform = "ios"
  data.products = [
    { store: "app_store", productId: "growth.ios", planId: "growth" },
  ]
}

test("Apple checkout binds the fresh owner account and the localized monthly offer", async () => {
  useAppleCatalog()
  const controller = renderController()
  refetch = async () => ({
    isSuccess: true,
    data: { ...data, accountToken: "fresh-apple-owner" },
  })
  expect(controller.priceDescription(appleProduct)).toBe(
    "₦15,000 every 1 month",
  )
  await controller.purchase(appleProduct)
  expect(calls).toEqual([
    {
      operation: "checkout",
      input: {
        type: "subs",
        request: {
          apple: { sku: "growth.ios", appAccountToken: "fresh-apple-owner" },
        },
      },
    },
  ])
})

test("Apple checkout refuses missing renewal terms and an active Play subscription", async () => {
  useAppleCatalog()
  const controller = renderController()
  await controller.purchase({
    ...appleProduct,
    subscriptionPeriodUnitIOS: null,
  })
  data.activeProvider = "PLAY_STORE"
  await controller.purchase(appleProduct)
  expect(calls).toEqual([])
})

test("Apple restore verifies its transaction ID before finishing and refreshing", async () => {
  useAppleCatalog()
  const controller = renderController()
  listPurchases = async () => [appleReceipt]
  await controller.restore()
  expect(calls.map((call) => call.operation)).toEqual([
    "verify",
    "finish",
    "refresh",
    "refresh",
  ])
  expect(calls[0]?.input).toEqual({
    store: "app_store",
    purchaseId: "apple-transaction",
  })
})

test("Apple restore leaves an unverified transaction unfinished for recovery", async () => {
  useAppleCatalog()
  const controller = renderController()
  listPurchases = async () => [appleReceipt]
  verify = async () => {
    throw new Error("verifier unavailable")
  }
  await controller.restore()
  expect(calls.map((call) => call.operation)).toEqual(["verify"])
})

test("native checkout uses the refreshed owner binding and the disclosed offer", async () => {
  const controller = renderController()
  refetch = async () => ({
    isSuccess: true,
    data: { ...data, accountToken: "fresh-owner-account" },
  })
  await controller.purchase(product)
  expect(calls).toMatchObject([
    {
      operation: "checkout",
      input: {
        request: {
          google: {
            obfuscatedAccountId: "fresh-owner-account",
            subscriptionOffers: [{ sku: "growth", offerToken: "actual-offer" }],
          },
        },
      },
    },
  ])
})

test("native checkout refuses a product removed by the fresh server catalog", async () => {
  const controller = renderController()
  refetch = async () => ({ isSuccess: true, data: { ...data, products: [] } })
  await controller.purchase(product)
  expect(calls).toEqual([])
})

test("native checkout stops if sign-out occurs during catalog refresh", async () => {
  const controller = renderController()
  refetch = async () => {
    generation++
    return { isSuccess: true, data }
  }
  await controller.purchase(product)
  expect(calls).toEqual([])
})

test("native replacement checkout stops on business cache retirement", async () => {
  data.activePlayProductId = "starter"
  data.activeProvider = "PLAY_STORE"
  const controller = renderController()
  listPurchases = async () => {
    cacheGeneration++
    return [{ ...receipt, productId: "starter" }]
  }
  await controller.purchase(product)
  expect(calls).toEqual([])
})

test("old native purchase callback cannot verify under a new session", async () => {
  renderController()
  generation++
  onSuccess(receipt)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(calls).toEqual([])
})

test("native acknowledgement waits for verification and stops on a switched session", async () => {
  renderController()
  verify = async () => {
    generation++
  }
  onSuccess(receipt)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(calls.map((call) => call.operation)).toEqual(["verify"])
})

test("native restore stops when the business changes during store history", async () => {
  const controller = renderController()
  listPurchases = async () => {
    cacheGeneration++
    return [receipt]
  }
  await controller.restore()
  expect(calls).toEqual([])
})

test("coverage enrollment uses the existing server command and refreshes projections", async () => {
  const controller = renderController()
  await controller.changeCoverage("enroll")
  expect(calls).toEqual([
    { operation: "enroll", input: undefined },
    { operation: "refresh" },
  ])
})

test("coverage release remains available for saved enrollment after paid expiry", async () => {
  data.ownerCoverage = {
    ...data.ownerCoverage,
    enrolled: true,
    reason: "inactive_subscription",
    businessLimit: 0,
    coveredBusinessCount: 0,
  }
  const controller = renderController()
  await controller.changeCoverage("release")
  expect(calls).toEqual([
    { operation: "release", input: { tenantId: "business" } },
    { operation: "refresh" },
  ])
})

test("coverage commands require fresh owner scope, runtime and available capacity", async () => {
  const controller = renderController()
  for (const changed of [
    { ...data, billingScope: "business" as const },
    { ...data, coverageAvailable: false },
    {
      ...data,
      ownerCoverage: { ...data.ownerCoverage, coveredBusinessCount: 3 },
    },
  ]) {
    refetch = async () => ({ isSuccess: true, data: changed })
    await controller.changeCoverage("enroll")
  }
  expect(calls).toEqual([])
})

test("coverage release cannot target an old business after session retirement", async () => {
  data.ownerCoverage.enrolled = true
  const controller = renderController()
  refetch = async () => {
    cacheGeneration++
    return { isSuccess: true, data }
  }
  await controller.changeCoverage("release")
  expect(calls).toEqual([])
})

test("duplicate coverage taps serialize before the first catalog request completes", async () => {
  const controller = renderController()
  const first = controller.changeCoverage("enroll")
  await controller.changeCoverage("enroll")
  await first
  expect(calls.filter((call) => call.operation === "enroll")).toHaveLength(1)
})

test("a coverage command completing after session retirement cannot refresh the next account", async () => {
  const controller = renderController()
  mutateCoverage = async () => {
    generation++
  }
  await controller.changeCoverage("enroll")
  expect(calls).toEqual([{ operation: "enroll", input: undefined }])
})

test("coverage started during checkout refresh prevents a competing store launch", async () => {
  const controller = renderController()
  const checkout = controller.purchase(product)
  const coverage = controller.changeCoverage("enroll")
  await Promise.all([checkout, coverage])
  expect(calls.map((call) => call.operation)).toEqual(["enroll", "refresh"])
})

if (iosEntry) {
  const node = ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children)
  mock.module("@/components/ui/view", () => ({ View: node }))
  mock.module("@/components/ui/text", () => ({ Text: node }))
  mock.module("@/components/ui/pressable", () => ({
    Pressable: ({
      children,
      disabled,
    }: { children?: ReactNode; disabled?: boolean }) =>
      createElement("button", { type: "button", disabled }, children),
  }))
  mock.module("expo-router", () => ({ useRouter: () => ({ push: () => {} }) }))
  mock.module("./store-owner-coverage", () => ({
    StoreOwnerCoverage: () => null,
  }))
  mock.module("./store-subscription-provider", () => provider)
  const { StoreSubscriptionPanel } = await import(
    "./store-subscription-panel.ios"
  )
  test("iOS entries render the shared owner catalog, monthly price and restore controls", () => {
    useAppleCatalog()
    availableProducts = [appleProduct]
    const html = renderToStaticMarkup(
      createElement(
        StoreSubscriptionProvider,
        null,
        createElement(StoreSubscriptionPanel),
      ),
    )
    expect(html).toContain("Owner subscriptions")
    expect(html).toContain("Growth")
    expect(html).toContain("₦15,000")
    expect(html).toContain("month")
    expect(html).toContain("Restore purchases")
    expect(html).toContain("Manage store subscriptions")
    expect(calls.filter((call) => call.operation === "checkout")).toHaveLength(
      0,
    )
  })
}
