import { expect, mock, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

mock.module("@root/mobile-release-scope.json", () => ({
  default: { softwarePlanPurchases: false },
}))

const unexpected = () => {
  throw new Error(
    "Disabled billing scope must not initialize store billing or call its API",
  )
}
mock.module("@/hooks/use-auth", () => ({
  useAuthContext: () => ({
    isAuthenticated: true,
    profile: {
      id: "owner-fixture",
      businessId: "business-fixture",
      role: "OWNER",
    },
  }),
}))
mock.module("@/trpc/client", () => ({
  useTRPC: unexpected,
  getDataCacheGeneration: unexpected,
}))
mock.module("@/lib/session-store", () => ({
  getSession: unexpected,
  getSessionGeneration: unexpected,
}))
mock.module("expo", () => ({ requireOptionalNativeModule: () => ({}) }))
mock.module("expo-iap", () => ({
  useIAP: unexpected,
  finishTransaction: unexpected,
  getAvailablePurchases: unexpected,
}))
mock.module("react-native", () => ({
  Platform: { OS: "android" },
  LogBox: { ignoreLogs: () => {} },
  AppState: { addEventListener: unexpected },
}))

const { StoreSubscriptionProvider, useStoreSubscription } = await import(
  "./store-subscription-provider.native"
)

function Child() {
  expect(useStoreSubscription()).toBeNull()
  return createElement("span", null, "Business app remains available")
}

test("disabled billing scope renders an authenticated owner's app without billing initialization", () => {
  expect(
    renderToStaticMarkup(
      createElement(StoreSubscriptionProvider, null, createElement(Child)),
    ),
  ).toBe("<span>Business app remains available</span>")
})
