import { beforeEach, expect, mock, test } from "bun:test"
import type { ProductSubscriptionAndroid, Purchase } from "expo-iap"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

let generation = 0
let cacheGeneration = 0
const profile = { id: "owner", businessId: "business", role: "OWNER" }
const products = [
  { store: "play_store", productId: "growth", planId: "growth" },
]
const catalogData = () => ({
  products,
  purchaseAvailable: true,
  accountToken: "owner-account",
  activeProvider: null as "PLAY_STORE" | null,
  activePlayProductId: null as string | null,
})
let data = catalogData()
let refetch = async () => ({ isSuccess: true, data })
let listPurchases: () => Promise<Purchase[]> = async () => []
let verify: () => Promise<void> = async () => {}
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
    },
    retailOps: { subscription: { queryFilter: () => ({}) } },
  }),
}))
mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({ data, refetch: () => refetch() }),
  useMutation: () => ({
    isPending: false,
    mutateAsync: async (input: unknown) => {
      calls.push({ operation: "verify", input })
      await verify()
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
  useIAP: (callbacks: { onPurchaseSuccess: typeof onSuccess }) => {
    onSuccess = callbacks.onPurchaseSuccess
    return {
      connected: true,
      subscriptions: [],
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
  Platform: { OS: "android" },
  LogBox: { ignoreLogs: () => {} },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
}))

const { StoreSubscriptionProvider, useStoreSubscription } = await import(
  "./store-subscription-provider.native"
)
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
  generation++
  cacheGeneration++
  calls.length = 0
  data = catalogData()
  refetch = async () => ({ isSuccess: true, data })
  listPurchases = async () => [receipt]
  verify = async () => {}
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
