import { ActionButton } from "@/components/mobile/action-button"
import type { AppThemeOptionPresentation } from "@/components/mobile/app-theme-presentation"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { THEME } from "@/lib/theme"
import type { ThemeOverride } from "@/lib/theme-preference"
import { cn } from "@/lib/utils"
import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import { VariableContextProvider } from "nativewind"
import { forwardRef, useCallback, useState } from "react"
import { useWindowDimensions } from "react-native"

function ThemePreview({ preview }: { preview: ThemeOverride }) {
  const theme = THEME[preview === "system" ? "light" : preview]
  return (
    <VariableContextProvider
      value={{
        "--more-preview-light": THEME.light.card,
        "--more-preview-dark": THEME.dark.card,
        "--more-preview-card": theme.card,
        "--more-preview-ink": theme.foreground,
        "--more-preview-border": theme.border,
      }}
    >
      {preview === "system" ? (
        <View className="h-9 w-12 flex-row overflow-hidden rounded-[10px] border border-border">
          <View className="h-full flex-1 bg-[var(--more-preview-light)]" />
          <View className="h-full flex-1 bg-[var(--more-preview-dark)]" />
        </View>
      ) : (
        <View className="h-9 w-12 gap-[6px] rounded-[10px] border border-[var(--more-preview-border)] bg-[var(--more-preview-card)] p-2">
          <View className="h-1 w-full rounded-full bg-[var(--more-preview-ink)]" />
          <View className="h-1 w-3/5 rounded-full bg-[var(--more-preview-ink)] opacity-50" />
        </View>
      )}
    </VariableContextProvider>
  )
}
export const MoreThemeSheet = forwardRef<
  BottomSheetModal,
  {
    options: AppThemeOptionPresentation[]
    pending: boolean
    error: string | null
    onSelect: (value: ThemeOverride) => void
  }
>(function MoreThemeSheet({ options, pending, error, onSelect }, ref) {
  const { height } = useWindowDimensions()
  return (
    <Modal
      ref={ref}
      title="Appearance"
      accessibilityLabel="App theme"
      snapPoints={[]}
      enableDynamicSizing
      maxDynamicContentSize={height * 0.44}
    >
      <BottomSheetScrollView keyboardShouldPersistTaps="handled">
        <View className="gap-3 px-4 pb-5">
          <Text className="text-xs text-muted-foreground [-rn-line-height:18]">
            Choose Light, Dark or System for this device.
          </Text>
          {error ? (
            <StatusBanner
              title="Appearance not saved"
              message={error}
              tone="destructive"
            />
          ) : null}
          <View accessibilityRole="radiogroup">
            {options.map((option, index) => (
              <Pressable
                key={option.value}
                accessibilityHint={option.detail}
                accessibilityLabel={`${option.label} app theme`}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: option.selected,
                  disabled: pending,
                }}
                disabled={pending}
                haptic={!pending}
                onPress={() => onSelect(option.value)}
                className={cn(
                  "min-h-20 flex-row items-center gap-3 px-3 py-3",
                  option.selected
                    ? "rounded-2xl border border-primary bg-accent"
                    : cn(
                        "border-t",
                        index === 0 ? "border-t-transparent" : "border-border",
                      ),
                )}
              >
                <ThemePreview preview={option.preview} />
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-extrabold text-foreground">
                    {option.label}
                  </Text>
                  <Text className="text-xs text-muted-foreground [-rn-line-height:18]">
                    {option.detail}
                  </Text>
                </View>
                <View
                  className={cn(
                    "size-6 shrink-0 items-center justify-center rounded-full border-2",
                    option.selected
                      ? "border-primary bg-primary"
                      : "border-border bg-card",
                  )}
                >
                  {option.selected ? (
                    <Icon
                      name="Check"
                      className="size-xs text-primary-foreground"
                    />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
          <Text
            accessibilityLiveRegion="polite"
            className="text-xs text-muted-foreground [-rn-line-height:18]"
          >
            {pending
              ? "Saving appearance…"
              : "Changes apply immediately and stay on this device."}
          </Text>
        </View>
      </BottomSheetScrollView>
    </Modal>
  )
})
export const MoreSignOutSheet = forwardRef<
  BottomSheetModal,
  {
    syncAlertCount: number
    onCancel: () => void
    onConfirm: () => void
  }
>(function MoreSignOutSheet({ syncAlertCount, onCancel, onConfirm }, ref) {
  const { height } = useWindowDimensions()
  const largeText = useLargeTextLayout()
  const [footerHeight, setFooterHeight] = useState(88)
  const footer = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          className={cn(
            "gap-3 bg-card px-4 pb-5 pt-3",
            !largeText && "flex-row",
          )}
        >
          <ActionButton
            className={largeText ? "w-full" : "w-auto flex-1"}
            variant="outline"
            onPress={onCancel}
          >
            Cancel
          </ActionButton>
          <ActionButton
            className={largeText ? "w-full" : "w-auto flex-1"}
            variant="destructive"
            onPress={onConfirm}
          >
            Sign out
          </ActionButton>
        </View>
      </BottomSheetFooter>
    ),
    [largeText, onCancel, onConfirm],
  )
  return (
    <Modal
      ref={ref}
      title="Sign out?"
      snapPoints={[]}
      enableDynamicSizing
      maxDynamicContentSize={height * 0.44}
      footerComponent={footer}
    >
      {/* Sheet content renders in a portal: the footer-height variable must be
          provided inside the Modal, or the spacer collapses and the footer
          is cut off. */}
      <VariableContextProvider
        value={{ "--more-signout-footer": footerHeight }}
      >
        <BottomSheetScrollView>
          <View className="px-5 pt-2">
            <Text className="text-sm text-foreground [-rn-line-height:22]">
              {syncAlertCount > 0
                ? `${syncAlertCount} unsynced ${syncAlertCount === 1 ? "change remains" : "changes remain"} on this device. Signing out will not silently clear the queue.`
                : "You will need to sign in again to access this workspace."}
            </Text>
            <View className="h-[var(--more-signout-footer)]" />
          </View>
        </BottomSheetScrollView>
      </VariableContextProvider>
    </Modal>
  )
})
