import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import { useReturnableItems } from "@/components/mobile/returnables/use-returnables"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import type { SaleStepViewProps } from "./create-sale-presentation"

/**
 * Checkout: crates, cylinders and other returnables going out with the sale.
 * Hidden for businesses with no Returnable items.
 */
export function CheckoutReturnables({
  model,
}: {
  model: SaleStepViewProps["model"]
}) {
  const items = useReturnableItems()
  const picker = useModal()
  const { returnables, selectedCustomer, isOffline } = model
  const available = items.data ?? []
  if (!available.length && !returnables.length) return null

  const saved = Boolean(selectedCustomer?.directoryId)
  const blocked = isOffline
    ? "Connect to send returnables with this sale"
    : saved
      ? null
      : "Choose a saved customer to track returnables"
  const remaining = available.filter(
    (item) => !returnables.some((row) => row.catalogItemId === item.id),
  )
  const add = () => {
    if (remaining.length === 1) {
      const [item] = remaining
      if (item) model.addReturnable({ catalogItemId: item.id, name: item.name })
    } else picker.present()
  }

  return (
    <>
      <View className="mt-3 min-h-8 flex-row items-center">
        <Text className="text-xs font-extrabold tracking-[0.3px] text-muted-foreground">
          RETURNABLES
        </Text>
      </View>
      {blocked && !returnables.length ? (
        <View
          accessible
          className="min-h-[58px] flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-2.5 opacity-60 shadow-sm"
        >
          <ReturnableBadge />
          <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
            {blocked}
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {returnables.map((row) => (
            <View
              className="gap-2 rounded-[20px] bg-card px-3.5 py-3 shadow-sm"
              key={row.catalogItemId}
            >
              <View className="flex-row items-center gap-3">
                <ReturnableBadge />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-bold text-foreground">
                    {row.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {blocked ?? "To be returned"}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel={`Remove ${row.name}`}
                  accessibilityRole="button"
                  className="size-11 items-center justify-center rounded-full"
                  disabled={model.actionsLocked}
                  haptic
                  onPress={() => model.removeReturnable(row.catalogItemId)}
                >
                  <Icon
                    className="size-[18px] text-muted-foreground"
                    name="X"
                  />
                </Pressable>
              </View>
              <QuantityStepper
                label="Going out"
                onChangeText={(value) =>
                  model.updateReturnable(row.catalogItemId, value)
                }
                value={row.quantity}
              />
            </View>
          ))}
          {remaining.length && !blocked ? (
            <Pressable
              accessibilityRole="button"
              className={cn(
                "flex-row items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border",
                returnables.length ? "min-h-11" : "min-h-[52px]",
              )}
              disabled={model.actionsLocked}
              haptic
              onPress={add}
            >
              <Icon className="size-[18px] text-primary" name="Plus" />
              <Text className="text-sm font-extrabold text-primary">
                {returnables.length ? "Add another" : "Add returnable"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <Modal ref={picker.ref} title="Add returnable">
        <BottomSheetScrollView
          contentContainerStyle={{
            gap: 4,
            paddingBottom: 24,
            paddingHorizontal: 18,
          }}
        >
          {remaining.map((item) => (
            <Pressable
              accessibilityRole="button"
              className="min-h-14 flex-row items-center gap-3 border-t border-border py-3 first:border-t-0"
              haptic="selection"
              key={item.id}
              onPress={() => {
                model.addReturnable({ catalogItemId: item.id, name: item.name })
                picker.dismiss()
              }}
            >
              <ReturnableBadge />
              <Text className="flex-1 text-sm font-bold text-foreground">
                {item.name}
              </Text>
            </Pressable>
          ))}
        </BottomSheetScrollView>
      </Modal>
    </>
  )
}

export function ReturnableBadge() {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette.amber,
        borderRadius: 12,
        height: 40,
        justifyContent: "center",
        width: 40,
      }}
    >
      <Icon
        className="size-[20px]"
        color={palette.amberForeground}
        name="Package"
      />
    </View>
  )
}
