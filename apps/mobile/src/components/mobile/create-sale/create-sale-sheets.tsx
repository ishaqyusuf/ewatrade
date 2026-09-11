import { CreateSaleCustomerSheet } from "@/components/mobile/create-sale-customer-sheet"
import {
  CompactSaleItemPicker,
  FullScreenSaleItemPicker,
} from "@/components/mobile/sale-item-picker"
import type { SaleStepViewProps } from "./create-sale-presentation"

export function CreateSaleSheets({
  model,
  appearance,
}: Pick<SaleStepViewProps, "model" | "appearance">) {
  const {
    itemKind,
    isOffline,
    allRows,
    customerDraft,
    setCustomerDraft,
    customerDraftError,
    setCustomerDraftError,
    isSavingCustomer,
    customerModal,
    compactPickerChoices,
    compactPickerVisible,
    setCompactPickerVisible,
    lineCountsByOfferingId,
    pickerDraft,
    pickerVisible,
    productSearch,
    setProductSearch,
    pickerChoiceCount,
    addOffering,
    closeFullScreenPicker,
    commitFullScreenPicker,
    saveCustomerDraft,
    choicesLoading,
    choicesError,
    retryChoices,
    addPickerChoice,
    removePickerLine,
    fetchNextChoices,
    catalog,
  } = model

  return (
    <>
      <CreateSaleCustomerSheet
        appearance={appearance}
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
      <CompactSaleItemPicker
        appearance={appearance}
        choices={compactPickerChoices}
        itemKind={itemKind}
        lineCountsByOfferingId={lineCountsByOfferingId}
        onAdd={(choice) => {
          addOffering(choice)
          setCompactPickerVisible(false)
        }}
        onClose={() => setCompactPickerVisible(false)}
        visible={compactPickerVisible}
      />
      <FullScreenSaleItemPicker
        appearance={appearance}
        choices={allRows}
        draft={pickerDraft}
        hasNextPage={!isOffline && Boolean(catalog.hasNextPage)}
        isFetchingNextPage={catalog.isFetchingNextPage}
        isLoading={choicesLoading}
        error={choicesError}
        onRetry={isOffline ? undefined : retryChoices}
        itemKind={itemKind}
        onAdd={addPickerChoice}
        onClose={closeFullScreenPicker}
        onFetchNextPage={fetchNextChoices}
        onProceed={commitFullScreenPicker}
        onQueryChange={setProductSearch}
        onRemove={removePickerLine}
        query={productSearch}
        searchChoiceCount={pickerChoiceCount}
        visible={pickerVisible}
      />
    </>
  )
}
