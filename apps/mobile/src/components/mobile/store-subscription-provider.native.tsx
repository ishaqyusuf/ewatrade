import { useAuthContext } from "@/hooks/use-auth"
import { publicLegalUrl } from "@/lib/public-legal-url"
import {
  completeStorePurchase,
  restoreMappedStorePurchases,
} from "@/lib/store-purchase-reconciliation"
import {
  iosSubscriptionPrice,
  playSubscriptionOffer,
} from "@/lib/store-subscription-disclosure"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { AppState, Platform } from "react-native"

function useStoreBillingController() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const processing = useRef(new Set<string>())
  const store = Platform.OS === "ios" ? "app_store" : "play_store"
  const catalog = useQuery(
    trpc.storeSubscriptions.catalog.queryOptions(undefined, { retry: false }),
  )
  const verification = useMutation(
    trpc.storeSubscriptions.verifyPurchase.mutationOptions(),
  )
  const reconcile = async (
    purchase: Purchase,
    products = catalog.data?.products,
  ) => {
    if (purchase.purchaseState !== "purchased") return
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
          "Your subscription was verified for this business, but the store could not finish processing it. Use Restore purchases to retry.",
        )
      } else if (!result.refreshed) {
        setMessage(
          "Your subscription was verified for this business. Reopen Plan & billing to refresh its current status.",
        )
      } else {
        setMessage(
          "Your store subscription has been verified for this business.",
        )
      }
    } catch {
      setMessage(
        "Your purchase is awaiting verification. Check your store purchase history and use Restore purchases to retry verification.",
      )
    } finally {
      processing.current.delete(purchaseId)
    }
  }
  const iap = useIAP({
    onPurchaseSuccess: (purchase) => {
      void reconcile(purchase)
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
  }, [iap.connected, productIds, fetchProducts])
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
    const accountToken = catalog.data?.accountToken
    if (
      !catalog.data?.purchaseAvailable ||
      !accountToken ||
      !publicLegalUrl("terms") ||
      !publicLegalUrl("privacy") ||
      verification.isPending ||
      !priceDescription(product)
    )
      return
    const currentProvider = Platform.OS === "ios" ? "APP_STORE" : "PLAY_STORE"
    if (
      catalog.data.activeProvider &&
      catalog.data.activeProvider !== currentProvider
    ) {
      setMessage(
        "This business already has an active plan through another billing provider. Manage that plan before starting a new store subscription.",
      )
      return
    }
    if (
      Platform.OS === "android" &&
      catalog.data.activePlayProductId === product.id
    ) {
      setMessage(
        "This Play plan is already active for the business. Use Manage store subscriptions to change or cancel it.",
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
        const oldProductId = catalog.data.activePlayProductId
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
    try {
      const result = await restoreMappedStorePurchases({
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
        const purchases = await getAvailablePurchases()
        for (const purchase of purchases) {
          if (!active) return
          await reconcileRef.current(purchase)
        }
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
  }, [iap.connected, productIds])
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
    store,
  }
}

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
    !auth.isAuthenticated ||
    !businessId ||
    (role !== "OWNER" && role !== "ADMIN")
  )
    return children
  return (
    <ActiveStoreBillingProvider key={businessId}>
      {children}
    </ActiveStoreBillingProvider>
  )
}

export function useStoreSubscription() {
  return useContext(StoreBillingContext)
}
