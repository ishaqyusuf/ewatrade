import { CreateSaleCustomerSheet } from "@/components/mobile/create-sale-customer-sheet"
import type { SaleStepViewProps } from "./create-sale-presentation"

export function CreateSaleSheets({ model }: Pick<SaleStepViewProps, "model">) {
  const {
    isOffline,
    customerDraft,
    setCustomerDraft,
    customerDraftError,
    setCustomerDraftError,
    isSavingCustomer,
    customerModal,
    saveCustomerDraft,
  } = model

  return (
    <CreateSaleCustomerSheet
      description={
        isOffline
          ? "Attach these details to this order. The customer directory is updated only when the queued order is accepted during sync."
          : undefined
      }
      saveLabel={isOffline ? "Use for this order" : "Save customer"}
      draft={customerDraft}
      error={customerDraftError}
      isLoading={isSavingCustomer}
      disabled={model.actionsLocked}
      onChange={(draft) => {
        setCustomerDraft(draft)
        setCustomerDraftError(null)
      }}
      onSave={() => void saveCustomerDraft()}
      ref={customerModal.ref}
    />
  )
}
