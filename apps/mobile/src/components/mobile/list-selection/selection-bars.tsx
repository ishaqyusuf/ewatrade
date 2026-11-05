import { ActionButton } from "@/components/mobile/action-button"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { VariableContextProvider } from "nativewind"
import { useSafeAreaInsets } from "react-native-safe-area-context"

/**
 * Takes over the top of a list screen while selecting:
 * ✕ · "N selected" · Select all. Opaque so rows scroll under it.
 */
export function SelectionTopBar({
  allSelected,
  count,
  onCancel,
  onSelectAll,
  selectAllDisabled,
}: {
  allSelected: boolean
  count: number
  onCancel: () => void
  onSelectAll: () => void
  selectAllDisabled?: boolean
}) {
  const insets = useSafeAreaInsets()
  const largeText = useLargeTextLayout()
  const countLabel = (
    <Text
      accessibilityLiveRegion="polite"
      className={
        largeText
          ? "px-2 pb-1 text-lg font-extrabold text-foreground"
          : "min-w-0 flex-1 text-xl font-extrabold text-foreground"
      }
      numberOfLines={largeText ? undefined : 1}
    >
      {`${count} selected`}
    </Text>
  )
  return (
    <VariableContextProvider value={{ "--selection-top": insets.top }}>
      <View
        accessibilityRole="toolbar"
        className="absolute inset-x-0 top-0 z-30 bg-background px-2.5 pb-1.5 pt-[var(--selection-top)]"
        testID="selection-top-bar"
      >
        <View className="min-h-14 flex-row items-center gap-1">
          <Pressable
            accessibilityLabel="Cancel selection"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full"
            haptic="selection"
            onPress={onCancel}
            testID="selection-cancel"
          >
            <Icon className="size-[22px] text-foreground" name="X" />
          </Pressable>
          {largeText ? <View className="flex-1" /> : countLabel}
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center rounded-full px-3"
            disabled={selectAllDisabled}
            haptic="selection"
            onPress={onSelectAll}
            testID="selection-select-all"
          >
            <Text
              className={
                selectAllDisabled
                  ? "text-sm font-extrabold text-muted-foreground"
                  : "text-sm font-extrabold text-primary"
              }
            >
              {allSelected ? "Clear all" : "Select all"}
            </Text>
          </Pressable>
        </View>
        {largeText ? countLabel : null}
      </View>
    </VariableContextProvider>
  )
}

export type SelectionAction = {
  disabled?: boolean
  icon: IconKeys
  isLoading?: boolean
  label: string
  onPress: () => void
  testID?: string
}

/**
 * Bulk actions while selecting: a wide main button and a second button,
 * flat on the page background (owner rule: never a sheet-like card).
 */
export function SelectionActionBar({
  notice,
  primary,
  secondary,
}: {
  notice?: string | null
  primary: SelectionAction
  secondary?: SelectionAction
}) {
  const insets = useSafeAreaInsets()
  const largeText = useLargeTextLayout()
  const button = (action: SelectionAction, main: boolean) => (
    <ActionButton
      className={main && !largeText ? "flex-1" : undefined}
      disabled={action.disabled}
      icon={action.icon}
      isLoading={action.isLoading}
      onPress={action.onPress}
      testID={action.testID}
      variant={main ? undefined : "outline"}
    >
      {action.label}
    </ActionButton>
  )
  return (
    <VariableContextProvider
      value={{ "--selection-bottom": Math.max(insets.bottom, 16) }}
    >
      <View
        className="absolute inset-x-0 bottom-0 z-30 gap-2 bg-background px-4 pt-3 pb-[var(--selection-bottom)]"
        testID="selection-action-bar"
      >
        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-center text-xs font-bold text-muted-foreground"
          >
            {notice}
          </Text>
        ) : null}
        <View className={largeText ? "gap-2" : "flex-row items-center gap-3"}>
          {button(primary, true)}
          {secondary ? button(secondary, false) : null}
        </View>
      </View>
    </VariableContextProvider>
  )
}
