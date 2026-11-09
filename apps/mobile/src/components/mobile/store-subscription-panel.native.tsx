import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { publicLegalUrl } from "@/lib/public-legal-url"
import {
  RETAIL_OPS_PLANS,
  type RetailOpsPlanId,
} from "@/lib/retail-ops-subscription"
import { getSessionGeneration } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { getDataCacheGeneration } from "@/trpc/client"
import { BottomSheetScrollView, BottomSheetView } from "@gorhom/bottom-sheet"
import { deepLinkToSubscriptions } from "expo-iap"
import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Linking } from "react-native"
import { useStoreSubscription } from "./store-subscription-provider"
import {
  SubscriptionPlanAction,
  SubscriptionPlanBenefits,
} from "./subscription-plan-benefits"
import {
  formatPlanBillingDisclosure,
  getUpgradePlans,
} from "./subscription-plan-benefits-model"

type PanelOptions = {
  currentPlanId: RetailOpsPlanId | null
  onCompleted?: () => Promise<void> | void
}
type Operation = "restore" | "enroll" | "release"
type Feedback = {
  operation: Operation
  phase: "confirm" | "processing" | "success" | "error"
  title: string
  message: string
}

/** Selected Workshop a/v19. The parent retains its current-plan hero and Usage. */
export function useSubscriptionPlanPanel({
  currentPlanId,
  onCompleted,
}: PanelOptions) {
  const { profile } = useAuthContext()
  const router = useRouter()
  const billing = useStoreSubscription()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [chosen, setChosen] = useState<RetailOpsPlanId | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [failedPolicies, setFailedPolicies] = useState<Set<string>>(
    () => new Set(),
  )
  const settings = useModal()
  const resultSheet = useModal()
  const sessionGeneration = getSessionGeneration()
  const cacheGeneration = getDataCacheGeneration()
  const scope = `${profile?.id}:${profile?.businessId}:${profile?.role}:${sessionGeneration}:${cacheGeneration}`
  const lifetime = useRef({ scope, mounted: true, run: 0 })
  lifetime.current.scope = scope
  const effectBusy = useRef(false)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackPresented = useRef(false)
  const confirmedCompletion = useRef<(() => void) | null>(null)
  useEffect(() => {
    lifetime.current.scope = scope
    lifetime.current.mounted = true
    effectBusy.current = false
    feedbackPresented.current = false
    confirmedCompletion.current = null
    setWorking(false)
    setChosen(null)
    setFeedback(null)
    setFeedbackOpen(false)
    setSettingsOpen(false)
    setFailedPolicies(new Set())
    settings.dismiss()
    resultSheet.dismiss()
    return () => {
      lifetime.current.mounted = false
      lifetime.current.run++
      if (successTimer.current) clearTimeout(successTimer.current)
    }
  }, [scope, settings.dismiss, resultSheet.dismiss])
  const isCurrent = (run?: number) =>
    lifetime.current.mounted &&
    lifetime.current.scope === scope &&
    sessionGeneration === getSessionGeneration() &&
    cacheGeneration === getDataCacheGeneration() &&
    (run === undefined || run === lifetime.current.run)
  const owner = profile?.role?.trim().toUpperCase() === "OWNER"
  const current =
    RETAIL_OPS_PLANS.find((plan) => plan.id === currentPlanId) ?? null
  const options = getUpgradePlans(currentPlanId)
  const selected =
    options.find((plan) => plan.id === chosen) ?? options[0] ?? current
  const catalog = billing?.catalog
  const data = catalog?.data
  const coverage = data?.ownerCoverage
  const hasOwnerPlan = Boolean(
    data?.billingScope === "owner" &&
      coverage &&
      coverage.businessLimit > 0 &&
      ["covered", "uncovered", "over_business_limit"].includes(coverage.reason),
  )
  const hasPaidPlan = hasOwnerPlan || Boolean(data?.activeProvider)
  const providerConflict = Boolean(
    data?.activeProvider &&
      data.activeProvider !==
        (billing?.store === "app_store" ? "APP_STORE" : "PLAY_STORE"),
  )
  const busy =
    working ||
    Boolean(billing?.verification.isPending || billing?.coveragePending)
  const unavailable =
    offline ||
    !billing ||
    Boolean(catalog?.isError || catalog?.isPending || !billing.iap.connected)
  const legalPages = Boolean(
    publicLegalUrl("terms") && publicLegalUrl("privacy"),
  )
  const configured = data?.products.find(
    (product) =>
      product.store === billing?.store && product.planId === selected?.id,
  )
  const product = billing?.iap.subscriptions.find(
    (item) => item.id === configured?.productId,
  )
  const disclosure = formatPlanBillingDisclosure(
    product && billing ? billing.priceDescription(product) : null,
  )
  const price = disclosure ? (product?.displayPrice.trim() ?? null) : null
  const period =
    disclosure && price && disclosure.startsWith(price)
      ? disclosure.slice(price.length).trim()
      : disclosure
  const canPurchase =
    owner &&
    Boolean(current) &&
    !hasPaidPlan &&
    Boolean(data?.purchaseAvailable && product && disclosure) &&
    legalPages &&
    !data?.legalAcceptanceRequired &&
    !failedPolicies.size &&
    !busy &&
    !unavailable &&
    !billing?.verification.isError &&
    !providerConflict
  const canActivate =
    owner &&
    !unavailable &&
    !busy &&
    data?.billingScope === "owner" &&
    data.coverageAvailable &&
    currentPlanId === "free" &&
    coverage?.reason === "uncovered" &&
    !coverage.enrolled &&
    coverage.coveredBusinessCount < coverage.businessLimit
  const canRelease =
    owner &&
    !unavailable &&
    !busy &&
    data?.billingScope === "owner" &&
    data.coverageAvailable &&
    coverage?.enrolled
  const storeName =
    billing?.store === "play_store" ? "Google Play" : "App Store"
  const openSettings = () => {
    if (!isCurrent()) return
    setSettingsOpen(true)
    settings.present()
  }
  const openPolicy = async (path: "terms" | "privacy") => {
    if (!isCurrent()) return
    const url = publicLegalUrl(path)
    try {
      if (!url) throw new Error("Policy unavailable")
      await Linking.openURL(url)
      if (!isCurrent()) return
      setFailedPolicies((values) => {
        const next = new Set(values)
        next.delete(path)
        return next
      })
    } catch {
      if (!isCurrent()) return
      setFailedPolicies((values) => new Set(values).add(path))
      billing?.setMessage(
        "The policy page could not open. Retry it in Subscription settings before subscribing.",
      )
    }
  }
  const manage = async () => {
    if (!owner || unavailable || busy || !isCurrent()) return
    if (providerConflict) {
      billing?.setMessage(
        "Manage this subscription in its original store or website.",
      )
      openSettings()
      return
    }
    try {
      await deepLinkToSubscriptions()
    } catch {
      billing?.setMessage(
        "Store subscription settings could not open. Open subscriptions in your device settings or try again.",
      )
    }
  }
  const showFeedback = (value: Feedback) => {
    feedbackPresented.current = true
    setFeedback(value)
    setFeedbackOpen(true)
    resultSheet.present()
  }
  const run = async (operation: Operation) => {
    if (
      !billing ||
      !owner ||
      unavailable ||
      busy ||
      effectBusy.current ||
      !isCurrent()
    )
      return
    if (
      (operation === "enroll" && !canActivate) ||
      (operation === "release" && !canRelease)
    )
      return
    effectBusy.current = true
    confirmedCompletion.current = null
    const ticket = ++lifetime.current.run
    setWorking(true)
    setSettingsOpen(false)
    settings.dismiss()
    showFeedback({
      operation,
      phase: "processing",
      title:
        operation === "restore"
          ? "Restoring purchases"
          : "Updating this business",
      message:
        operation === "restore"
          ? "Checking your store history and verifying purchases. Business coverage stays as it is."
          : "Checking the confirmed business plan. Please wait.",
    })
    try {
      const result =
        operation === "restore"
          ? await billing.restore()
          : await billing.changeCoverage(operation)
      if (!isCurrent(ticket)) return
      if (result?.status !== "confirmed") {
        setFeedback({
          operation,
          phase: "error",
          title:
            result?.status === "none"
              ? "No matching purchase found"
              : "Could not confirm",
          message:
            result?.message ??
            "Refresh your status before trying again. No success was confirmed.",
        })
        return
      }
      setFeedback({
        operation,
        phase: "success",
        title:
          operation === "restore"
            ? "Purchase history verified"
            : operation === "release"
              ? "Plan removed here"
              : "Plan is active here",
        message: result.message,
      })
      // All ways to dismiss a verified success share one scoped completion.
      let completed = false
      confirmedCompletion.current = () => {
        if (completed || !isCurrent(ticket)) return
        completed = true
        void Promise.resolve(onCompleted?.()).catch(() => {
          if (isCurrent(ticket))
            billing.setMessage(
              "The action was verified, but this screen could not refresh. Pull to refresh your current plan.",
            )
        })
      }
      successTimer.current = setTimeout(() => {
        if (!isCurrent(ticket)) return
        if (feedbackPresented.current) resultSheet.dismiss()
        else confirmedCompletion.current?.()
      }, 1200)
    } catch {
      if (isCurrent(ticket))
        setFeedback({
          operation,
          phase: "error",
          title: "Could not confirm",
          message:
            "Refresh your status and try again. No success was confirmed.",
        })
    } finally {
      if (isCurrent(ticket)) {
        effectBusy.current = false
        setWorking(false)
      }
    }
  }
  const confirmRelease = () => {
    if (!canRelease || !isCurrent()) return
    setSettingsOpen(false)
    settings.dismiss()
    showFeedback({
      operation: "release",
      phase: "confirm",
      title: "Remove plan here?",
      message:
        "This business returns to Free limits. Its records and existing staff are kept. This does not cancel store renewal or move the plan to another business.",
    })
  }
  const purchase = () => {
    if (canPurchase && product && billing && !effectBusy.current && isCurrent())
      void billing.purchase(product)
  }
  const action =
    selected && owner && billing
      ? {
          label: hasPaidPlan
            ? `Manage in ${providerConflict ? "original store" : storeName}`
            : `Upgrade to ${selected.name}`,
          disabled: hasPaidPlan ? unavailable || busy : !canPurchase,
          onPress: hasPaidPlan ? () => void manage() : purchase,
          disclosure: hasPaidPlan ? null : disclosure,
          note: hasPaidPlan
            ? null
            : !owner
              ? "The owner manages this plan."
              : unavailable
                ? "Connect to refresh billing availability."
                : !disclosure
                  ? "Price and billing terms unavailable."
                  : !canPurchase
                    ? "Review subscription availability and policies in Settings."
                    : "Renews automatically until cancelled in store settings.",
        }
      : null
  const status = offline
    ? "Offline · Showing saved billing information. Reconnect to change your plan."
    : catalog?.isPending
      ? "Loading subscription availability…"
      : catalog?.isError
        ? "Subscription availability could not load. Refresh before changing billing."
        : billing && !billing.iap.connected
          ? "The store is unavailable. Reconnect to load prices or restore purchases."
          : providerConflict
            ? "An existing subscription is managed through another provider. Use its original store or website."
            : data?.legalAcceptanceRequired
              ? "Review and accept the current Terms and Privacy before subscribing. Restore remains available."
              : !legalPages || failedPolicies.size
                ? "A required policy is unavailable. Retry it in Subscription settings. Restore remains available."
                : coverage?.reason === "over_business_limit"
                  ? "This business uses Free limits. Review the businesses using your plan. Records and existing staff are kept."
                  : coverage?.reason === "uncovered" &&
                      coverage.coveredBusinessCount >= coverage.businessLimit &&
                      coverage.businessLimit > 0
                    ? "Your plan is in use on other businesses. Review them in Subscription settings."
                    : !owner || !billing
                      ? "The owner manages this plan. Staff do not need separate subscriptions."
                      : null
  const row = (label: string, press: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={press}
      className="min-h-11 justify-center py-3 disabled:opacity-50"
    >
      <Text className="text-base font-semibold text-primary">{label}</Text>
    </Pressable>
  )
  const content = (
    <>
      <SubscriptionPlanBenefits
        currentPlanId={currentPlanId}
        selectedPlan={selected}
        options={options}
        onSelect={setChosen}
        price={price}
        period={period}
        onSettingsPress={openSettings}
        inlineAction={options.length ? null : action}
      >
        {status || billing?.message || billing?.verification.isPending ? (
          <View
            accessibilityLiveRegion="polite"
            className="gap-2 rounded-2xl bg-muted p-3.5"
          >
            {status ? (
              <Text className="text-sm text-muted-foreground">{status}</Text>
            ) : null}
            {billing?.verification.isPending ? (
              <Text className="text-sm text-muted-foreground">
                Verifying your purchase. This business is not activated
                automatically.
              </Text>
            ) : null}
            {billing?.message ? (
              <Text
                accessibilityRole="alert"
                className="text-sm text-muted-foreground"
              >
                {billing.message}
              </Text>
            ) : null}
            {catalog?.isError
              ? row(
                  "Refresh status",
                  () => void catalog.refetch(),
                  offline || busy,
                )
              : null}
            {data?.legalAcceptanceRequired
              ? row(
                  "Review Terms and Privacy",
                  () => router.push("/account-privacy"),
                  offline || busy,
                )
              : null}
          </View>
        ) : null}
        {canActivate ? (
          <SubscriptionPlanAction
            action={{
              label: `Use my ${coverage?.businessLimit === 1 ? "Starter" : coverage?.businessLimit === 3 ? "Growth" : "Pro"} plan here`,
              disabled: false,
              onPress: () => void run("enroll"),
            }}
          />
        ) : null}
      </SubscriptionPlanBenefits>
      <Modal
        ref={settings.ref}
        title="Subscription settings"
        onDismiss={() => setSettingsOpen(false)}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 32 }}
        >
          <Text className="mb-3 text-sm text-muted-foreground">
            Catalog items include products, services and drafts. Your storefront
            shows published items only, within your catalog allowance. Business
            allowance is shared across businesses on the plan; other limits
            apply per business.
          </Text>
          <Text className="mb-2 text-sm text-muted-foreground">
            Monthly subscriptions renew automatically until cancelled in the
            original store. Buying a plan and using it for a business are
            separate steps.
          </Text>
          {owner && billing ? (
            <>
              {row(
                "Restore purchases",
                () => void run("restore"),
                unavailable || busy,
              )}
              {row(
                `Manage in ${providerConflict ? "original store" : storeName}`,
                () => void manage(),
                unavailable || busy,
              )}
              {canRelease
                ? row("Move plan to another business", confirmRelease)
                : null}
              {hasOwnerPlan
                ? row(
                    "Review businesses",
                    () => {
                      settings.dismiss()
                      router.push("/business-switch-modal")
                    },
                    busy || offline,
                  )
                : null}
            </>
          ) : (
            <Text className="text-sm text-muted-foreground">
              The owner manages purchases and business activation.
            </Text>
          )}
          {row("Terms of service", () => void openPolicy("terms"))}
          {row("Privacy notice", () => void openPolicy("privacy"))}
        </BottomSheetScrollView>
      </Modal>
      <Modal
        ref={resultSheet.ref}
        hideHeader
        enableDynamicSizing
        enablePanDownToClose={feedback?.phase !== "processing"}
        onDismiss={() => {
          feedbackPresented.current = false
          setFeedbackOpen(false)
          if (successTimer.current) clearTimeout(successTimer.current)
          const complete = confirmedCompletion.current
          confirmedCompletion.current = null
          complete?.()
        }}
      >
        <BottomSheetView className="gap-3 px-[18px] pb-6">
          {feedback ? (
            <>
              {feedback.phase === "processing" ? (
                <ActivityIndicator accessibilityLabel="Processing billing action" />
              ) : null}
              <Text
                accessibilityRole="header"
                className="text-[22px] font-bold text-foreground"
              >
                {feedback.title}
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                className="text-base text-muted-foreground"
              >
                {feedback.message}
              </Text>
              {feedback.phase === "confirm" ? (
                <>
                  <SubscriptionPlanAction
                    action={{
                      label: "Remove plan here",
                      disabled: !canRelease,
                      onPress: () => void run("release"),
                    }}
                  />
                  {row("Keep plan here", resultSheet.dismiss)}
                </>
              ) : feedback.phase !== "processing" ? (
                row("Done", resultSheet.dismiss)
              ) : null}
            </>
          ) : null}
        </BottomSheetView>
      </Modal>
    </>
  )
  return {
    content,
    footer:
      options.length && !settingsOpen && !feedbackOpen && action ? (
        <SubscriptionPlanAction action={action} />
      ) : null,
  }
}

export function StoreSubscriptionPanel({
  currentPlanId = null,
}: { currentPlanId?: RetailOpsPlanId | null }) {
  return useSubscriptionPlanPanel({ currentPlanId }).content
}
