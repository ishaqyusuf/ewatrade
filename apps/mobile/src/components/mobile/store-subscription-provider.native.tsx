import { useAuthContext } from "@/hooks/use-auth"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { getSession, getSessionGeneration } from "@/lib/session-store"
import {
  STORE_PURCHASE_PENDING_MESSAGE,
  storePurchaseErrorMessage,
} from "@/lib/store-purchase-message"
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

export type StoreBillingActionResult = {
  status: "confirmed" | "unconfirmed" | "none" | "retired"
  message: string
}
const retiredResult: StoreBillingActionResult = {
  status: "retired",
  message: "Billing session changed.",
}

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
  const restoreBusy = useRef(false)
  const [coveragePending, setCoveragePending] = useState(false)
  const changeCoverage = async (
    action: "enroll" | "release",
  ): Promise<StoreBillingActionResult> => {
    if (!isCurrent()) return retiredResult
    if (
      coverageBusy.current ||
      restoreBusy.current ||
      processing.current.size > 0
    )
      return {
        status: "unconfirmed",
        message: "Another billing action is still processing.",
      }
    coverageBusy.current = true
    setCoveragePending(true)
    try {
      const latest = await catalog.refetch()
      if (!isCurrent()) return retiredResult
      const current = latest.isSuccess ? latest.data : null
      const coverage = current?.ownerCoverage
      if (
        processing.current.size > 0 ||
        current?.billingScope !== "owner" ||
        !current.coverageAvailable ||
        !coverage ||
        !lifetime.businessId
      )
        throw new Error("Coverage unavailable")
      if (action === "release") {
        if (!coverage.enrolled) throw new Error("Business is not enrolled")
        await release.mutateAsync({ tenantId: lifetime.businessId })
      } else {
        if (
          coverage.enrolled ||
          coverage.reason !== "uncovered" ||
          coverage.coveredBusinessCount >= coverage.businessLimit
        )
          throw new Error("Plan capacity unavailable")
        await enrollment.mutateAsync()
      }
      if (!isCurrent()) return retiredResult
      await queryClient.invalidateQueries()
      if (!isCurrent()) return retiredResult
      // Promise settlement is not evidence: require a fresh same-scope projection.
      const refreshed = await catalog.refetch()
      if (!isCurrent()) return retiredResult
      const after = refreshed.isSuccess ? refreshed.data.ownerCoverage : null
      const confirmed =
        refreshed.data?.billingScope === "owner" &&
        after &&
        (action === "release"
          ? !after.enrolled && after.planId === "free"
          : after.enrolled &&
            after.reason === "covered" &&
            after.planId !== "free")
      if (!confirmed) throw new Error("Coverage postcondition not confirmed")
      const message =
        action === "release"
          ? "This business is now on Free. Its records and existing staff are kept. Store renewal is unchanged."
          : "Your plan is now active for this business."
      setMessage(message)
      return { status: "confirmed", message }
    } catch {
      if (!isCurrent()) return retiredResult
      const message =
        "Business coverage could not be confirmed. Refresh its status before trying again."
      setMessage(message)
      return { status: "unconfirmed", message }
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
      return result.storeFinished && result.refreshed
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
      if (purchase.purchaseState === "pending") {
        setMessage(STORE_PURCHASE_PENDING_MESSAGE)
        return
      }
      // A retired lifetime leaves the receipt for the next valid recovery.
      void reconcile(purchase).catch(() => {})
    },
    onPurchaseError: (error) =>
      setMessage(storePurchaseErrorMessage(error.code)),
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
    if (
      !isCurrent() ||
      verification.isPending ||
      coverageBusy.current ||
      restoreBusy.current
    )
      return
    // Purchase authority must be fresh; a previously rendered button is not a
    // current account binding, checkout gate or product mapping.
    const latest = await catalog.refetch()
    if (!isCurrent() || coverageBusy.current) return
    const currentCatalog = latest.isSuccess ? latest.data : null
    const accountToken = currentCatalog?.accountToken
    if (
      !currentCatalog?.purchaseAvailable ||
      Boolean(
        currentCatalog.ownerCoverage &&
          currentCatalog.ownerCoverage.businessLimit > 0 &&
          ["covered", "uncovered", "over_business_limit"].includes(
            currentCatalog.ownerCoverage.reason,
          ),
      ) ||
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
  const restore = async (): Promise<StoreBillingActionResult> => {
    if (!isCurrent()) return retiredResult
    if (
      coverageBusy.current ||
      restoreBusy.current ||
      processing.current.size > 0
    )
      return {
        status: "unconfirmed",
        message: "Another billing action is still processing.",
      }
    restoreBusy.current = true
    try {
      let beforeEnrolled: boolean | undefined
      let verified = 0
      let incomplete = false
      const result = await restoreMappedStorePurchases({
        isCurrent,
        store,
        loadProducts: async () => {
          const latest = await catalog.refetch()
          beforeEnrolled = latest.isSuccess
            ? Boolean(latest.data.ownerCoverage?.enrolled)
            : undefined
          return latest.isSuccess ? latest.data.products : null
        },
        listPurchases: getAvailablePurchases,
        reconcile: async (purchase, products) => {
          if (await reconcile(purchase, products)) verified++
          else incomplete = true
        },
      })
      if (!isCurrent()) return retiredResult
      if (result === "restored" && verified > 0 && !incomplete) {
        const fresh = await catalog.refetch()
        if (!isCurrent()) return retiredResult
        if (
          !fresh.isSuccess ||
          beforeEnrolled === undefined ||
          Boolean(fresh.data.ownerCoverage?.enrolled) !== beforeEnrolled
        )
          throw new Error("Restore state not confirmed")
        const message =
          "Purchase history verified. Business coverage was not changed."
        setMessage(message)
        return { status: "confirmed", message }
      }
      const message =
        result === "none"
          ? "No matching purchase was found. Check your original store account and try again."
          : result === "catalog_unavailable" || result === "unmapped"
            ? "Subscription availability could not load. Refresh and try Restore again."
            : "Restore was not verified. Check your store purchase history and try again."
      setMessage(message)
      return { status: result === "none" ? "none" : "unconfirmed", message }
    } catch {
      if (!isCurrent()) return retiredResult
      const message =
        "Purchases could not be restored. Check the store account and try again."
      setMessage(message)
      return { status: "unconfirmed", message }
    } finally {
      restoreBusy.current = false
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
          reconcile: async (purchase, products) => {
            await reconcileRef.current(purchase, products)
          },
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
