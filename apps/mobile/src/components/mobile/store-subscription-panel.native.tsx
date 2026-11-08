import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getMobileRoleLabel } from "@/lib/mobile-roles"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { getPlan } from "@/lib/retail-ops-subscription"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { deepLinkToSubscriptions } from "expo-iap"
import { useRouter } from "expo-router"
import { useState } from "react"
import { Linking } from "react-native"
import { StoreOwnerCoverage } from "./store-owner-coverage"
import { useStoreSubscription } from "./store-subscription-provider"

const PLAN_ORDER = ["starter", "growth", "pro"] as const

/** Native implementation of Owner ledger / Workshop a v9. */
export function StoreSubscriptionPanel() {
  const { profile } = useAuthContext()
  return (
    <OwnerSubscriptionLedger key={`${profile?.id}:${profile?.businessId}`} />
  )
}

function OwnerSubscriptionLedger() {
  const router = useRouter()
  const { profile } = useAuthContext()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const billing = useStoreSubscription()
  const [showLimits, setShowLimits] = useState(false)
  const [showOffers, setShowOffers] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [failedPolicies, setFailedPolicies] = useState<Set<string>>(
    () => new Set(),
  )
  const context = (
    <View className="flex-row items-start justify-between gap-3">
      <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
        {profile?.businessName ?? "Current business"}
      </Text>
      <Text className="text-xs text-muted-foreground">
        {getMobileRoleLabel(profile?.role)}
      </Text>
    </View>
  )
  if (!billing)
    return (
      <View className="gap-3">
        <Text
          accessibilityRole="header"
          className="text-lg font-bold text-foreground"
        >
          Owner subscriptions
        </Text>
        {context}
        <Text className="text-sm text-muted-foreground">
          The owner manages subscriptions and business coverage. Staff and
          admins do not subscribe separately.
        </Text>
      </View>
    )

  const {
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
    coveragePending,
  } = billing
  const hasLegalPages = Boolean(
    publicLegalUrl("terms") && publicLegalUrl("privacy"),
  )
  const coverage = catalog.data?.ownerCoverage
  const hasOwnerPlan =
    catalog.data?.billingScope === "owner" &&
    coverage &&
    coverage.businessLimit > 0 &&
    ["covered", "uncovered", "over_business_limit"].includes(coverage.reason)
  const currentProvider = store === "app_store" ? "APP_STORE" : "PLAY_STORE"
  const activeProvider = catalog.data?.activeProvider
  const providerConflict = Boolean(
    activeProvider && activeProvider !== currentProvider,
  )
  const busy = verification.isPending || coveragePending || restoring
  const unavailable = offline || catalog.isError || !iap.connected
  const canPurchase =
    catalog.data?.purchaseAvailable &&
    hasLegalPages &&
    !busy &&
    !unavailable &&
    !verification.isError &&
    failedPolicies.size === 0 &&
    !providerConflict
  const mappedOffers = (catalog.data?.products ?? [])
    .filter((product) => product.store === store)
    .sort((a, b) => PLAN_ORDER.indexOf(a.planId) - PLAN_ORDER.indexOf(b.planId))
  const canShowOffers = !hasOwnerPlan || showOffers
  const openPolicy = (path: "terms" | "privacy") => {
    const url = publicLegalUrl(path)
    if (!url) {
      setFailedPolicies((current) => new Set(current).add(path))
      setMessage(
        "The policy page is unavailable in this build. New subscriptions are unavailable.",
      )
      return
    }
    void Linking.openURL(url)
      .then(() => {
        setFailedPolicies((current) => {
          const next = new Set(current)
          next.delete(path)
          return next
        })
        if (message === "The policy page could not open. Please try again.")
          setMessage(null)
      })
      .catch(() => {
        setFailedPolicies((current) => new Set(current).add(path))
        setMessage("The policy page could not open. Please try again.")
      })
  }

  return (
    <View className="gap-3">
      <Text
        accessibilityRole="header"
        className="text-lg font-bold text-foreground"
      >
        {catalog.data?.billingScope === "business"
          ? "App subscriptions"
          : "Owner subscriptions"}
      </Text>
      {context}
      {offline ||
      catalog.isError ||
      message ||
      verification.isPending ||
      restoring ? (
        <View
          accessibilityLiveRegion="polite"
          className="gap-1 rounded-[14px] bg-muted p-3"
        >
          {offline ? (
            <Text className="text-sm text-muted-foreground">
              Offline · Showing saved billing information when available.
              Reconnect to purchase, restore or change coverage.
            </Text>
          ) : catalog.isError ? (
            <>
              <Text className="text-sm text-muted-foreground">
                Subscription availability could not load. Any saved coverage is
                shown below; refresh before changing billing.
              </Text>
              <Pressable
                accessibilityRole="button"
                className="min-h-11 justify-center"
                onPress={() => void catalog.refetch()}
              >
                <Text className="font-semibold text-primary">
                  Refresh status
                </Text>
              </Pressable>
            </>
          ) : null}
          {verification.isPending ? (
            <Text className="text-sm text-muted-foreground">
              Verifying your store purchase with EwaTrade. Business coverage is
              a separate step after verification.
            </Text>
          ) : null}
          {restoring && !verification.isPending ? (
            <Text className="text-sm text-muted-foreground">
              Restoring purchases. Checking your store history and EwaTrade
              verification; business coverage is not changed automatically.
            </Text>
          ) : null}
          {message ? (
            <Text
              accessibilityRole="alert"
              className="text-sm text-muted-foreground"
            >
              {message}
            </Text>
          ) : null}
        </View>
      ) : null}
      {catalog.data ? (
        <StoreOwnerCoverage
          disabled={unavailable || busy}
          onSwitchBusiness={() => router.push("/business-switch-modal")}
        />
      ) : catalog.isPending ? (
        <Text className="text-sm text-muted-foreground">
          Loading owner subscriptions…
        </Text>
      ) : null}
      {providerConflict ? (
        <Text className="text-sm text-muted-foreground">
          An existing subscription is managed through another billing provider.
          Manage that plan in its original store or website before starting a
          new subscription here.
        </Text>
      ) : null}
      {failedPolicies.size > 0 ? (
        <Text className="text-sm text-muted-foreground">
          A required policy could not open. Retry that policy before starting a
          new subscription. Existing purchases can still be restored.
        </Text>
      ) : null}
      {catalog.data?.legalAcceptanceRequired && hasLegalPages ? (
        <View className="gap-1">
          <Text className="text-sm text-muted-foreground">
            Review and accept the current Terms and Privacy Notice before a new
            subscription. Existing purchases can still be restored.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={offline || busy}
            className="min-h-11 justify-center disabled:opacity-50"
            onPress={() => router.push("/account-privacy")}
          >
            <Text className="font-semibold text-primary">
              Review Terms and Privacy
            </Text>
          </Pressable>
        </View>
      ) : productIds && (!catalog.data?.purchaseAvailable || !hasLegalPages) ? (
        <Text className="text-sm text-muted-foreground">
          New subscriptions are temporarily unavailable. Existing purchases can
          still be restored.
        </Text>
      ) : null}
      {!iap.connected && !offline ? (
        <Text className="text-sm text-muted-foreground">
          The store is unavailable. Reconnect to load prices or restore
          purchases.
        </Text>
      ) : null}
      {!productIds && !catalog.isPending ? (
        <Text className="text-sm text-muted-foreground">
          Store subscriptions are not available yet.
        </Text>
      ) : null}
      {hasOwnerPlan ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showOffers }}
          className="min-h-11 justify-center"
          onPress={() => setShowOffers((value) => !value)}
        >
          <Text className="font-semibold text-primary">
            {showOffers ? "Hide monthly plans" : "Compare monthly plans"}
          </Text>
        </Pressable>
      ) : null}
      {canShowOffers && mappedOffers.length > 0 ? (
        <View className="overflow-hidden rounded-[18px] bg-card shadow-sm">
          {mappedOffers.map((configured, index) => {
            const product = iap.subscriptions.find(
              (item) => item.id === configured.productId,
            )
            const plan = getPlan(configured.planId)
            const disclosure = product ? priceDescription(product) : null
            const price = product?.displayPrice.trim()
            // Keep the complete store disclosure, including any phased Play terms.
            const period =
              disclosure && price && disclosure.startsWith(price)
                ? disclosure.slice(price.length).trim()
                : disclosure
            const disabled = !canPurchase || !product || !disclosure
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                key={configured.productId}
                disabled={disabled}
                className={`gap-1 px-3.5 py-3.5 disabled:opacity-50 ${index > 0 ? "border-t border-border" : ""}`}
                onPress={() => {
                  if (product) void purchase(product)
                }}
              >
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="min-w-0 flex-1 font-bold text-foreground">
                    {plan.name}
                  </Text>
                  <View className="max-w-[65%] items-end">
                    {disclosure && price ? (
                      <Text className="text-right font-bold text-foreground">
                        {price}
                      </Text>
                    ) : null}
                    <Text className="text-right text-xs text-muted-foreground">
                      {period ?? "Price and billing terms unavailable"}
                    </Text>
                  </View>
                </View>
                <Text className="text-xs text-muted-foreground">
                  {plan.limits.businesses}{" "}
                  {plan.limits.businesses === 1 ? "business" : "businesses"}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {plan.limits.products === null
                    ? "Unlimited"
                    : plan.limits.products.toLocaleString()}{" "}
                  goods · {plan.limits.staff} staff
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
      {canShowOffers && mappedOffers.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showLimits }}
            className="min-h-11 justify-center"
            onPress={() => setShowLimits((value) => !value)}
          >
            <Text className="font-semibold text-primary">
              {showLimits ? "Hide all limits" : "See all plan limits"}
            </Text>
          </Pressable>
          {showLimits ? (
            <View className="gap-2 rounded-[18px] border border-border p-3.5">
              {PLAN_ORDER.map((id) => {
                const plan = getPlan(id)
                return (
                  <Text key={id} className="text-sm text-muted-foreground">
                    <Text className="font-bold text-foreground">
                      {plan.name}
                    </Text>{" "}
                    · {plan.limits.offlineDevices} offline{" "}
                    {plan.limits.offlineDevices === 1 ? "device" : "devices"} ·
                    Unlimited orders · {plan.limits.reportsHistoryDays} days
                    history · {plan.supportLabel}
                  </Text>
                )
              })}
            </View>
          ) : null}
        </>
      ) : null}
      <Text className="text-xs [-rn-line-height:19] text-muted-foreground">
        Monthly subscriptions renew automatically through your store account
        until cancelled. Review the localized price, billing period and renewal
        terms before confirmation. Manage or cancel renewal in store settings.
        Coverage is a separate step.
      </Text>
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: offline || busy || !iap.connected }}
          disabled={offline || busy || !iap.connected}
          className="min-h-11 min-w-[130px] flex-1 items-center justify-center rounded-xl bg-primary/10 px-3 py-2.5 disabled:opacity-50"
          onPress={async () => {
            setRestoring(true)
            try {
              await restore()
            } finally {
              setRestoring(false)
            }
          }}
        >
          <Text className="font-bold text-primary">
            {restoring ? "Restoring purchases…" : "Restore purchases"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={offline || busy}
          className="min-h-11 min-w-[130px] flex-1 justify-center py-2.5 disabled:opacity-50"
          onPress={() => {
            if (providerConflict) {
              setMessage(
                "Manage the existing plan in its original billing provider's subscription settings. New subscriptions here remain blocked.",
              )
              return
            }
            void deepLinkToSubscriptions().catch(() =>
              setMessage("Store subscription settings could not open."),
            )
          }}
        >
          <Text className="font-semibold text-primary">
            Manage store subscriptions ↗
          </Text>
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-x-4">
        {(
          [
            ["Terms of service", "terms"],
            ["Privacy notice", "privacy"],
          ] as const
        ).map(([label, path]) => (
          <Pressable
            key={path}
            accessibilityRole="link"
            className="min-h-11 justify-center"
            onPress={() => openPolicy(path)}
          >
            <Text className="text-xs text-primary">{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
