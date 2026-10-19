import { ClassicSaleTopBar } from "@/components/mobile/appearances/classic/create-sale"
import { StatusBanner } from "@/components/mobile/status-banner"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getSession, getSessionGeneration } from "@/lib/session-store"
import { trackMobileActivity } from "@/runtime/analytics-runtime"
import {
  getOperationalModeGeneration,
  useOperationalModeStore,
} from "@/store/operationalModeStore"
import { getDataCacheGeneration } from "@/trpc/client"
import { useRouter } from "expo-router"
import { VariableContextProvider } from "nativewind"
import { useRef, useState } from "react"
import { CreateSaleCustomerStep } from "./create-sale-customer"
import { CreateSaleItems } from "./create-sale-items"
import type { CreateSaleViewModel } from "./create-sale-presentation"
import { CreateSaleReview } from "./create-sale-review"
import { CreateSaleSheets } from "./create-sale-sheets"
import { SaleStepTransition } from "./sale-step-transition"
import {
  saleActivityCategory,
  saleActivityLifetimeOf,
  useSaleActivity,
} from "./use-sale-activity"
import { useSaleBackSteps } from "./use-sale-back-steps"

/**
 * The session that may report sale activity right now, read live: the stored
 * session, current data-cache generation and current connection. Compared
 * with the lifetime the view actually rendered.
 */
function liveSaleActivityLifetime() {
  const session = getSession()
  return saleActivityLifetimeOf({
    token: session?.token,
    profile: session?.profile,
    hasBusinessAccess: session?.accessProfile?.hasBusinessAccess,
    generation: getDataCacheGeneration(),
    sessionGeneration: getSessionGeneration(),
    offline: useOperationalModeStore.getState().isOfflineMode,
    operationalGeneration: getOperationalModeGeneration(),
  })
}

export function CreateSaleView({
  model: saleModel,
}: { model: CreateSaleViewModel }) {
  const router = useRouter()
  const { profile, token, accessProfile } = useAuthContext()
  const [actionsHeight, setActionsHeight] = useState(96)
  // Items scroll position, kept across steps for this sale only.
  const itemsScroll = useRef(0)
  const accountState = saleModel.accountState
  const activity = useSaleActivity(
    {
      // Exact session, actor, business, Store, role/access, cache and
      // connection: any change retires what was observed.
      // The rendered AuthProvider/model snapshot, never the live session: an
      // old model's lines can't be relabelled as a new owner's.
      lifetime: saleActivityLifetimeOf({
        token,
        profile,
        hasBusinessAccess: accessProfile?.hasBusinessAccess,
        generation: getDataCacheGeneration(),
        sessionGeneration: getSessionGeneration(),
        offline: saleModel.isOffline,
        operationalGeneration: getOperationalModeGeneration(),
      }),
      step: saleModel.step,
      category: saleActivityCategory(
        saleModel.selectedRows.length,
        saleModel.catalogFreeLines.map((line) => line.kind),
      ),
      itemCount:
        saleModel.selectedRows.length + saleModel.catalogFreeLines.length,
      completion: saleModel.completion,
      submission: saleModel.submission,
      chosenAccountId:
        accountState.kind === "selected" && !accountState.sole
          ? accountState.account.id
          : null,
      paymentMethod: saleModel.paymentMethod,
    },
    trackMobileActivity,
    liveSaleActivityLifetime,
  )
  // System back and swipe follow the steps, like the visible back.
  const stepBack = useSaleBackSteps(saleModel)
  // The user's own account pick is noted for the activity report.
  const model: CreateSaleViewModel = {
    ...saleModel,
    chooseAccount: (account) => {
      activity.noteAccountChoice(account.id)
      saleModel.chooseAccount(account)
    },
  }
  const props = {
    model,
    actionsHeight,
    onActionsHeightChange: setActionsHeight,
    itemsScroll,
  }
  return (
    <VariableContextProvider
      value={{
        "--sale-items-bottom": model.hasSaleLines ? actionsHeight + 24 : 96,
        "--sale-customer-bottom":
          model.showCustomerSearch && !model.isOffline
            ? actionsHeight + 24
            : 24,
        "--sale-actions-bottom": actionsHeight + 24,
      }}
    >
      <View
        className="flex-1 bg-background"
        pointerEvents={model.actionsLocked ? "none" : "auto"}
      >
        {model.completion && model.postSubmitWarning ? (
          <StatusBanner
            title={
              model.completion.status === "queued"
                ? "Order queued"
                : "Order recorded"
            }
            message={model.postSubmitWarning}
            tone="success"
          />
        ) : null}
        <ClassicSaleTopBar
          onBack={model.step === "items" ? undefined : stepBack}
          onClose={() => router.replace("/dashboard")}
          step={model.step === "items" ? 1 : model.step === "customer" ? 2 : 3}
          subtitle={[...new Set([profile?.businessName, profile?.storeName])]
            .filter(Boolean)
            .join(" · ")}
          title={
            model.step === "items"
              ? model.itemKind === "service"
                ? "New service order"
                : "New sale"
              : model.step === "customer"
                ? "Who is buying?"
                : "Checkout"
          }
        />
        <SaleStepTransition step={model.step}>
          {model.step === "items" ? (
            <CreateSaleItems {...props} />
          ) : model.step === "customer" ? (
            <CreateSaleCustomerStep {...props} />
          ) : (
            <CreateSaleReview {...props} />
          )}
        </SaleStepTransition>
        <CreateSaleSheets {...props} />
      </View>
    </VariableContextProvider>
  )
}
