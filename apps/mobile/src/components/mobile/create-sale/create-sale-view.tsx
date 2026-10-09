import { ClassicSaleTopBar } from "@/components/mobile/appearances/classic/create-sale"
import { StatusBanner } from "@/components/mobile/status-banner"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import { useRouter } from "expo-router"
import { VariableContextProvider } from "nativewind"
import { useState } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { CreateSaleCustomerStep } from "./create-sale-customer"
import { CreateSaleItems } from "./create-sale-items"
import type { CreateSaleViewModel } from "./create-sale-presentation"
import { CreateSaleReview } from "./create-sale-review"
import { CreateSaleSheets } from "./create-sale-sheets"
import { useSalePresentation } from "./use-sale-presentation"

export function CreateSaleView({
  model,
  appearance,
}: { model: CreateSaleViewModel; appearance: MobileDesign }) {
  const { tone } = useSalePresentation(appearance)
  const router = useRouter()
  const { profile } = useAuthContext()
  const insets = useSafeAreaInsets()
  const [actionsHeight, setActionsHeight] = useState(96)
  const props = {
    model,
    appearance,
    actionsHeight,
    onActionsHeightChange: setActionsHeight,
  }
  return (
    <VariableContextProvider
      value={{
        "--sale-items-bottom":
          model.selectedRows.length > 0 ? actionsHeight + 24 : 96,
        "--sale-customer-bottom":
          model.showCustomerSearch && !model.isOffline
            ? actionsHeight + 24
            : 24,
        "--sale-actions-bottom": actionsHeight + 24,
        "--sale-fab-bottom":
          model.selectedRows.length > 0
            ? actionsHeight + 16
            : Math.max(insets.bottom, 16),
      }}
    >
      <View
        className={tone("flex-1 bg-background")}
        pointerEvents={model.actionsLocked ? "none" : "auto"}
      >
        {model.completion ? (
          <StatusBanner
            title={
              model.completion.status === "queued"
                ? "Order queued"
                : "Order recorded"
            }
            message={
              model.postSubmitWarning ?? "This draft has been submitted."
            }
            tone="success"
          />
        ) : null}
        {appearance !== "market-day" ? (
          <ClassicSaleTopBar
            onBack={
              model.step === "items"
                ? undefined
                : () => {
                    model.setError(null)
                    model.setStep(
                      model.step === "review" ? "customer" : "items",
                    )
                  }
            }
            onClose={() => router.replace("/dashboard")}
            step={
              model.step === "items" ? 1 : model.step === "customer" ? 2 : 3
            }
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
        ) : null}
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
