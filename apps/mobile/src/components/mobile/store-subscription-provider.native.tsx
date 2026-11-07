import { useAuthContext } from "@/hooks/use-auth"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { getSession, getSessionGeneration } from "@/lib/session-store"
import {
  StoreBillingSessionChanged,
  completeStorePurchase,
  restoreMappedStorePurchases,
} from "@/lib/store-purchase-reconciliation"
import {
  iosSubscriptionPrice,
  playSubscriptionOffer,
} from "@/lib/store-subscription-disclosure"
import { getDataCacheGeneration, useTRPC } from "@/trpc/client"
import releaseScope from "@root/mobile-release-scope.json"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { requireOptionalNativeModule } from "expo"
import {
  type ProductSubscription,
  type Purchase,
  finishTransaction,
  getAvailablePurchases,
  useIAP,
} from "expo-iap"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { AppState, LogBox, Platform } from "react-native"

// Devices without Play Billing (an emulator with no Google account) fail to
// connect. useIAP reports that through onError, but expo-iap also
// console.errors it, which would raise a dev error banner on every launch.
LogBox.ignoreLogs(["initConnection failed"])

function useStoreBillingController() {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [message, setRawMessage] = useState<string | null>(null)
  const processing = useRef(new Set<string>())
  // tRPC obtains credentials when a request starts, so an old callback must
  // retire synchronously when sign-out or a business/account switch happens.
  // Capture by value for this render. A refreshed session can start new work;
  // closures already awaiting a result keep their original generation.
  const lifetime = {
    session: getSessionGeneration(),
    cache: getDataCacheGeneration(),
    userId: auth.profile?.id,
    businessId: auth.profile?.businessId,
  }
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const isCurrent = useCallback(() => {
    const session = getSession()
    return (
      active.current &&
      lifetime.session === getSessionGeneration() &&
      lifetime.cache === getDataCacheGeneration() &&
      session?.profile.id === lifetime.userId &&
      session?.profile.businessId === lifetime.businessId &&
      session?.profile.role?.trim().toUpperCase() === "OWNER"
    )
  }, [lifetime.session, lifetime.cache, lifetime.userId, lifetime.businessId])
  const setMessage = useCallback(
    (value: string | null) => {
      if (isCurrent()) setRawMessage(value)
    },
    [isCurrent],
  )
  const store = Platform.OS === "ios" ? "app_store" : "play_store"
  const catalog = useQuery(
    trpc.storeSubscriptions.catalog.queryOptions({ store }, { retry: false }),
  )
  const verification = useMutation(
    trpc.storeSubscriptions.verifyPurchase.mutationOptions(),
  )
  const enrollment = useMutation(
    trpc.storeSubscriptions.enrollBusiness.mutationOptions(),
  )
  const release = useMutation(
    trpc.storeSubscriptions.releaseBusiness.mutationOptions(),
  )
  const coverageBusy = useRef(false)
  const [coveragePending, setCoveragePending] = useState(false)
  const changeCoverage = async (action: "enroll" | "release") => {
    if (!isCurrent() || coverageBusy.current || processing.current.size > 0)
      return
    coverageBusy.current = true
    setCoveragePending(true)
    try {
      const latest = await catalog.refetch()
      if (!isCurrent() || processing.current.size > 0) return
      const current = latest.isSuccess ? latest.data : null
      const coverage = current?.ownerCoverage
      if (
        current?.billingScope !== "owner" ||
        !current.coverageAvailable ||
        !coverage ||
        !lifetime.businessId
      ) {
        setMessage("Business coverage is unavailable. Refresh and try again.")
        return
      }
      if (action === "release") {
        if (!coverage.enrolled) return
        await release.mutateAsync({ tenantId: lifetime.businessId })
      } else {
        if (
          coverage.enrolled ||
          coverage.reason !== "uncovered" ||
          coverage.coveredBusinessCount >= coverage.businessLimit
        ) {
          setMessage(
            "Your current plan cannot cover this business. Review its available business slots.",
          )
          return
        }
        await enrollment.mutateAsync()
      }
      if (!isCurrent()) return
      // Coverage changes affect subscription and workspace feature projections.
      await queryClient.invalidateQueries()
      setMessage(
        action === "release"
          ? "This business has been released from your owner plan. Its data is kept; store renewal is unchanged."
          : "Business coverage has been updated. Review its current status.",
      )
    } catch {
      setMessage(
        "Business coverage could not be confirmed. Refresh its status before trying again.",
      )
    } finally {
      coverageBusy.current = false
      if (active.current) setCoveragePending(false)
    }
  }
  const reconcile = async (
    purchase: Purchase,
    products = catalog.data?.products,
  ) => {
    if (!isCurrent() || purchase.purchaseState !== "purchased") return
    if (
      !products?.some(
        (product) =>
          product.store === store && product.productId === purchase.productId,
      )
    )
      return
    const purchaseId =
      Platform.OS === "ios" ? purchase.id : purchase.purchaseToken
    if (!purchaseId) {
      setMessage(
        "The store did not return a purchase reference. Try Restore purchases.",
      )
      return
    }
    if (processing.current.has(purchaseId)) return
    processing.current.add(purchaseId)
    try {
      const result = await completeStorePurchase({
        isCurrent,
        verify: () => verification.mutateAsync({ store, purchaseId }),
        finish: () => finishTransaction({ purchase, isConsumable: false }),
        refresh: () =>
          Promise.all([
            queryClient.invalidateQueries(
              trpc.retailOps.subscription.queryFilter(),
            ),
            queryClient.invalidateQueries(
              trpc.storeSubscriptions.catalog.queryFilter(),
            ),
          ]),
      })
      if (!result.storeFinished) {
        setMessage(
          "Your subscription was verified, but the store could not finish processing it. Use Restore purchases to retry.",
        )
      } else if (!result.refreshed) {
        setMessage(
          "Your subscription was verified. Reopen Plan & billing to refresh its current status and business coverage.",
        )
      } else {
        setMessage(
          "Your store subscription has been verified. Review this business's current plan and coverage below.",
        )
      }
    } catch (error) {
      if (error instanceof StoreBillingSessionChanged) throw error
      setMessage(
        "Your purchase is awaiting verification. Check your store purchase history and use Restore purchases to retry verification.",
      )
    } finally {
      processing.current.delete(purchaseId)
    }
  }
  const iap = useIAP({
    onPurchaseSuccess: (purchase) => {
      // A retired lifetime leaves the receipt for the next valid recovery.
      void reconcile(purchase).catch(() => {})
    },
    onPurchaseError: () =>
      setMessage("The purchase did not complete. You can try again."),
    onError: () =>
      setMessage(
        "The store is unavailable. Check your connection and try again.",
      ),
  })
  const productIds =
    catalog.data?.products
      .filter((product) => product.store === store)
      .map((product) => product.productId)
      .join(",") ?? ""
  const fetchProducts = iap.fetchProducts
  useEffect(() => {
    if (iap.connected && productIds)
      void fetchProducts({ skus: productIds.split(","), type: "subs" }).catch(
        () => setMessage("Subscription prices could not load."),
      )
  }, [iap.connected, productIds, fetchProducts, setMessage])
  const priceDescription = (product: ProductSubscription) => {
    if (product.platform === "ios")
      return iosSubscriptionPrice(
        product.displayPrice,
        product.subscriptionPeriodNumberIOS,
        product.subscriptionPeriodUnitIOS,
      )
    return playSubscriptionOffer(product.subscriptionOffers)?.label ?? null
  }
  const purchase = async (product: ProductSubscription) => {
    if (!isCurrent() || verification.isPending || coverageBusy.current) return
    // Purchase authority must be fresh; a previously rendered button is not a
    // current account binding, checkout gate or product mapping.
    const latest = await catalog.refetch()
    if (!isCurrent() || coverageBusy.current) return
    const currentCatalog = latest.isSuccess ? latest.data : null
    const accountToken = currentCatalog?.accountToken
    if (
      !currentCatalog?.purchaseAvailable ||
      !accountToken ||
      !currentCatalog.products.some(
        (item) => item.store === store && item.productId === product.id,
      ) ||
      !publicLegalUrl("terms") ||
      !publicLegalUrl("privacy") ||
      verification.isPending ||
      !priceDescription(product)
    )
      return
    const currentProvider = Platform.OS === "ios" ? "APP_STORE" : "PLAY_STORE"
    if (
      currentCatalog.activeProvider &&
      currentCatalog.activeProvider !== currentProvider
    ) {
      setMessage(
        "An active plan already exists through another billing provider. Manage that plan before starting a new store subscription.",
      )
      return
    }
    if (
      Platform.OS === "android" &&
      currentCatalog.activePlayProductId === product.id
    ) {
      setMessage(
        "This Play plan is already active. Use Manage store subscriptions to change or cancel it.",
      )
      return
    }
    try {
      if (Platform.OS === "ios") {
        await iap.requestPurchase({
          type: "subs",
          request: {
            apple: {
              sku: product.id,
              appAccountToken: accountToken,
            },
          },
        })
      } else {
        const offer = playSubscriptionOffer(product.subscriptionOffers)
        if (!offer) {
          setMessage(
            "The billing terms for this plan are unavailable. Please try again later.",
          )
          return
        }
        const oldProductId = currentCatalog.activePlayProductId
        const replacement =
          oldProductId && oldProductId !== product.id
            ? await getAvailablePurchases().then((purchases) =>
                purchases.filter(
                  (item) =>
                    item.purchaseState === "purchased" &&
                    item.productId === oldProductId &&
                    item.purchaseToken,
                ),
              )
            : []
        const oldPurchase = replacement.length === 1 ? replacement[0] : null
        if (!isCurrent()) return
        if (
          oldProductId &&
          oldProductId !== product.id &&
          !oldPurchase?.purchaseToken
        ) {
          setMessage(
            "The current Play subscription could not be identified safely. Restore purchases using the same Google account before changing plans.",
          )
          return
        }
        await iap.requestPurchase({
          type: "subs",
          request: {
            google: {
              skus: [product.id],
              obfuscatedAccountId: accountToken,
              subscriptionOffers: [
                { sku: product.id, offerToken: offer.token },
              ],
              ...(oldProductId && oldPurchase?.purchaseToken
                ? {
                    purchaseToken: oldPurchase.purchaseToken,
                    subscriptionProductReplacementParams: {
                      oldProductId,
                      replacementMode: "with-time-proration" as const,
                    },
                  }
                : {}),
            },
          },
        })
      }
    } catch {
      setMessage("The store purchase could not open. Please try again.")
    }
  }
  const restore = async () => {
    if (!isCurrent() || coverageBusy.current) return
    try {
      const result = await restoreMappedStorePurchases({
        isCurrent,
        store,
        loadProducts: async () => {
          const latest = await catalog.refetch()
          return latest.isSuccess ? latest.data.products : null
        },
        listPurchases: getAvailablePurchases,
        reconcile,
      })
      if (result === "catalog_unavailable")
        setMessage(
          "Subscription availability could not load. Check your connection and try again.",
        )
      else if (result === "unmapped")
        setMessage(
          "Store subscriptions are not available for this business yet.",
        )
      else if (result === "none")
        setMessage(
          "No available EwaTrade subscriptions were found for the current store account.",
        )
    } catch {
      setMessage(
        "Purchases could not be restored. Check the store account and try again.",
      )
    }
  }
  const reconcileRef = useRef(reconcile)
  reconcileRef.current = reconcile
  useEffect(() => {
    if (!iap.connected || !productIds) return
    let active = true
    const recover = async () => {
      try {
        await restoreMappedStorePurchases({
          isCurrent: () => active && isCurrent(),
          store,
          loadProducts: async () => {
            const latest = await catalog.refetch()
            return latest.isSuccess ? latest.data.products : null
          },
          listPurchases: getAvailablePurchases,
          reconcile: (purchase, products) =>
            reconcileRef.current(purchase, products),
        })
      } catch {
        if (active)
          setMessage(
            "Purchase recovery could not finish. Open Plan & billing to restore purchases.",
          )
      }
    }
    void recover()
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void recover()
    })
    return () => {
      active = false
      listener.remove()
    }
  }, [iap.connected, productIds, catalog.refetch, isCurrent, setMessage, store])
  return {
    catalog,
    verification,
    message,
    setMessage,
    iap,
    productIds,
    priceDescription,
    purchase,
    restore,
    coveragePending,
    changeCoverage,
    store,
  }
}

// Older development binaries predate expo-iap; skip billing until rebuilt.
const storeBillingLinked = Boolean(requireOptionalNativeModule("ExpoIap"))

const StoreBillingContext = createContext<ReturnType<
  typeof useStoreBillingController
> | null>(null)

function ActiveStoreBillingProvider({ children }: { children: ReactNode }) {
  const controller = useStoreBillingController()
  return (
    <StoreBillingContext.Provider value={controller}>
      {children}
    </StoreBillingContext.Provider>
  )
}

export function StoreSubscriptionProvider({
  children,
}: { children: ReactNode }) {
  const auth = useAuthContext()
  const role = auth.profile?.role?.trim().toUpperCase()
  const businessId = auth.profile?.businessId
  if (
    !releaseScope.softwarePlanPurchases ||
    !storeBillingLinked ||
    !auth.isAuthenticated ||
    !businessId ||
    role !== "OWNER"
  )
    return children
  return (
    <ActiveStoreBillingProvider key={`${auth.profile?.id}:${businessId}`}>
      {children}
    </ActiveStoreBillingProvider>
  )
}

export function useStoreSubscription() {
  return useContext(StoreBillingContext)
}
