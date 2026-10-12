import { ClassicSaleTopBar } from "@/components/mobile/appearances/classic/create-sale"
import { StatusBanner } from "@/components/mobile/status-banner"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useRouter } from "expo-router"
import { VariableContextProvider } from "nativewind"
import { useState } from "react"
import { CreateSaleCustomerStep } from "./create-sale-customer"
import { CreateSaleItems } from "./create-sale-items"
import type { CreateSaleViewModel } from "./create-sale-presentation"
import { CreateSaleReview } from "./create-sale-review"
import { CreateSaleSheets } from "./create-sale-sheets"

export function CreateSaleView({ model }: { model: CreateSaleViewModel }) {
  const router = useRouter()
  const { profile } = useAuthContext()
  const [actionsHeight, setActionsHeight] = useState(96)
  const props = {
    model,
    actionsHeight,
    onActionsHeightChange: setActionsHeight,
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
          onBack={
            model.step === "items"
              ? undefined
              : () => {
                  model.setError(null)
                  model.setStep(model.step === "review" ? "customer" : "items")
                }
          }
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
        {model.step === "items" ? (
          <CreateSaleItems {...props} />
        ) : model.step === "customer" ? (
          <CreateSaleCustomerStep {...props} />
        ) : (
          <CreateSaleReview {...props} />
        )}
        <CreateSaleSheets {...props} />
      </View>
    </VariableContextProvider>
  )
}
