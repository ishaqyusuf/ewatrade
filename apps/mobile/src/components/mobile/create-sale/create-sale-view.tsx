import { StatusBanner } from "@/components/mobile/status-banner"
import { View } from "@/components/ui/view"
import { VariableContextProvider } from "nativewind"
import { useState } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { CreateSaleViewModel } from "./create-sale-presentation"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import { useSalePresentation } from "./use-sale-presentation"
import { CreateSaleItems } from "./create-sale-items"
import { CreateSaleCustomerStep } from "./create-sale-customer"
import { CreateSaleReview } from "./create-sale-review"
import { CreateSaleSheets } from "./create-sale-sheets"

export function CreateSaleView({
  model,
  appearance,
}: { model: CreateSaleViewModel; appearance: MobileDesign }) {
  const { tone } = useSalePresentation(appearance)
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
