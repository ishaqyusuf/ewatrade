import { ActionButton } from "@/components/mobile/action-button"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { BottomSheetView } from "@gorhom/bottom-sheet"
import { useCallback, useEffect, useRef, useState } from "react"

/** Floating "Discard this sale?" confirmation for leaving New sale with items. */
export function useDiscardSaleSheet() {
  const sheet = useModal()
  const [proceed, setProceed] = useState<(() => void) | null>(null)
  const ask = useCallback((next: () => void) => setProceed(() => next), [])
  useEffect(() => {
    if (proceed) sheet.present()
  }, [proceed, sheet.present])
  return { sheet, proceed, ask, clear: () => setProceed(null) }
}

export function DiscardSaleSheet({
  state,
}: {
  state: ReturnType<typeof useDiscardSaleSheet>
}) {
  // Discard runs after the sheet has closed, so navigation never races it.
  const discard = useRef(false)
  return (
    <Modal
      ref={state.sheet.ref}
      enableDynamicSizing
      snapPoints={[]}
      title="Discard this sale?"
      onDismiss={() => {
        const leave = discard.current ? state.proceed : null
        discard.current = false
        state.clear()
        leave?.()
      }}
    >
      <BottomSheetView
        style={{ gap: 12, paddingBottom: 24, paddingHorizontal: 20 }}
      >
        <Text className="text-sm text-muted-foreground">
          The items you added will be removed.
        </Text>
        <ActionButton
          onPress={() => {
            discard.current = true
            state.sheet.dismiss()
          }}
          variant="destructive"
        >
          Discard
        </ActionButton>
        <ActionButton onPress={state.sheet.dismiss} variant="outline">
          Keep editing
        </ActionButton>
      </BottomSheetView>
    </Modal>
  )
}
