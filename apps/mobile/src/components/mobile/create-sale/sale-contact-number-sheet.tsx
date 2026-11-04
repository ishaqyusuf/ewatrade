import { RowDivider } from "@/components/mobile/green-till/kit"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useEffect, useRef } from "react"
import { View } from "react-native"
import { formatContactPhone } from "./sale-contact-pick"
import type { SaleContactNumberChoice } from "./use-sale-contact-pick"

/** "Which number for Bayo?" when a picked contact has several numbers. */
export function SaleContactNumberSheet({
  choice,
  onChoose,
  onClose,
}: {
  choice: SaleContactNumberChoice | null
  onChoose: (phone: string) => void
  onClose: () => void
}) {
  const modal = useModal()
  // Keeps the rows while the sheet slides away after a choice.
  const shown = useRef(choice)
  if (choice) shown.current = choice
  const open = Boolean(choice)
  useEffect(() => {
    if (open) modal.present()
    else modal.dismiss()
  }, [open, modal.present, modal.dismiss])
  const current = shown.current

  return (
    <Modal
      accessibilityLabel="Choose a number"
      enableDynamicSizing
      hideHeader
      onDismiss={onClose}
      ref={modal.ref}
    >
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View className="gap-3 px-5 pt-1">
          <Text
            accessibilityRole="header"
            className="text-[18px] font-extrabold tracking-tight text-foreground"
          >
            Which number for {current?.name || "this contact"}?
          </Text>
          <View className="overflow-hidden rounded-[20px] border border-border bg-card">
            {current?.options.map((option, index) => (
              <Pressable
                accessibilityLabel={`${option.label}, ${formatContactPhone(option.phone)}`}
                accessibilityRole="button"
                className="min-h-[60px] flex-row items-center gap-3 px-3.5 py-3"
                haptic
                key={option.phone}
                onPress={() => onChoose(option.phone)}
              >
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-xs font-semibold text-muted-foreground">
                    {option.label}
                  </Text>
                  <Text className="text-sm font-bold text-foreground">
                    {formatContactPhone(option.phone)}
                  </Text>
                  {option.savedName ? (
                    <View className="self-start rounded-full bg-tint-mint px-2 py-0.5">
                      <Text className="text-[11px] font-extrabold text-tint-mint-foreground">
                        Saved as {option.savedName}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Icon
                  className="size-[18px] text-muted-foreground"
                  name="ChevronRight"
                />
                {index < current.options.length - 1 ? <RowDivider /> : null}
              </Pressable>
            ))}
          </View>
        </View>
      </BottomSheetScrollView>
    </Modal>
  )
}
