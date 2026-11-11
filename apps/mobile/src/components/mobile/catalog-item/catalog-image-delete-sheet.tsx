import { ActionButton } from "@/components/mobile/action-button"
import { useFullScreenFormBack } from "@/components/mobile/full-screen-form"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useCallback, useEffect, useRef } from "react"
import { View } from "react-native"
import { CatalogIllustrationPreview } from "../catalog-setup/catalog-illustration-library"
import { SavedPhotoPreview } from "./saved-photo-preview"

export type CatalogImageRemoval = { kind: "photo" | "illustration"; id: string }

const deleteQuestion = "Do you want to delete this image?"

export function CatalogImageDeleteSheet({
  target,
  storeId,
  itemName,
  disabled,
  onClose,
  onDelete,
}: {
  target: CatalogImageRemoval | null
  storeId: string
  itemName: string
  disabled: boolean
  onClose(): void
  onDelete(target: CatalogImageRemoval): void
}) {
  const { ref, present, dismiss } = useModal()
  const confirmed = useRef(false)
  useEffect(() => {
    if (target) present()
  }, [present, target])
  useFullScreenFormBack(
    useCallback(() => {
      if (!target) return false
      dismiss()
      return true
    }, [dismiss, target]),
  )

  return (
    <Modal
      ref={ref}
      accessibilityLabel={deleteQuestion}
      enableDynamicSizing
      hideHeader
      onDismiss={() => {
        const selected = confirmed.current && !disabled ? target : null
        confirmed.current = false
        onClose()
        if (selected) onDelete(selected)
      }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          gap: 12,
          paddingHorizontal: 20,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {target ? (
          <View className="size-[168px] items-center justify-center self-center overflow-hidden rounded-2xl bg-muted">
            {target.kind === "photo" ? (
              <SavedPhotoPreview
                key={target.id}
                assetId={target.id}
                storeId={storeId}
                name={itemName}
                variant="thumbnail"
                contentFit="contain"
              />
            ) : (
              <CatalogIllustrationPreview id={target.id} size={144} />
            )}
          </View>
        ) : null}
        <Text
          accessibilityRole="header"
          className="text-center text-lg font-extrabold text-foreground"
        >
          {deleteQuestion}
        </Text>
        <View className="flex-row gap-3">
          <ActionButton
            className="w-auto flex-1"
            variant="outline"
            onPress={dismiss}
          >
            Cancel
          </ActionButton>
          <ActionButton
            className="w-auto flex-1"
            variant="destructive"
            disabled={disabled || !target}
            onPress={() => {
              confirmed.current = true
              dismiss()
            }}
          >
            Delete
          </ActionButton>
        </View>
      </BottomSheetScrollView>
    </Modal>
  )
}
