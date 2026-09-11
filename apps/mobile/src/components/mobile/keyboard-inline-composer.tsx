import { ActionButton } from "@/components/mobile/action-button"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import type { MobileDesign } from "@/lib/mobile-design/screens"
import { Icon, type IconProps } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { forwardRef } from "react"
import { Keyboard, ScrollView, StyleSheet, TextInput, View } from "react-native"
import { KeyboardStickyView } from "react-native-keyboard-controller"

export type KeyboardInlineComposerPill = {
  id: string
  label: string
  removable?: boolean
  selected?: boolean
}

type KeyboardInlineComposerProps = {
  appearance?: MobileDesign
  onHeightChange?: (height: number) => void
  closedOffset?: number
  disabled?: boolean
  canSubmit?: boolean
  dismissKeyboardOnSubmit?: boolean
  helperText?: string
  hideSubmitButton?: boolean
  largeTextPlaceholder?: string
  onChangeText: (value: string) => void
  onPillPress: (pill: KeyboardInlineComposerPill) => void
  onRemovePill?: (pill: KeyboardInlineComposerPill) => void
  onSubmit: () => void
  pills: KeyboardInlineComposerPill[]
  placeholder: string
  submitAccessibilityLabel: string
  submitIconName?: IconProps["name"]
  submitLabel: string
  title?: string
  value: string
  visible: boolean
}

export const KeyboardInlineComposer = forwardRef<
  TextInput,
  KeyboardInlineComposerProps
>(function KeyboardInlineComposer(
  {
    appearance = "classic",
    onHeightChange,
    closedOffset = 88,
    disabled = false,
    canSubmit: canSubmitOverride,
    dismissKeyboardOnSubmit = false,
    helperText,
    hideSubmitButton = false,
    largeTextPlaceholder,
    onChangeText,
    onPillPress,
    onRemovePill,
    onSubmit,
    pills,
    placeholder,
    submitAccessibilityLabel,
    submitIconName = "Plus",
    submitLabel,
    title,
    value,
    visible,
  },
  ref,
) {
  const colors = useColors()
  const palette = useMarketDayPalette()
  const market = appearance === "market-day"
  const largeTextLayout = useLargeTextLayout()
  const canSubmit = !disabled && (canSubmitOverride ?? value.trim().length > 0)

  if (!visible) return null

  const submit = () => {
    if (!canSubmit) return

    onSubmit()
    if (dismissKeyboardOnSubmit) {
      Keyboard.dismiss()
    }
  }

  return (
    <KeyboardStickyView
      offset={{ closed: closedOffset, opened: 0 }}
      pointerEvents="box-none"
      style={styles.sticky}
    >
      <View
        onLayout={
          onHeightChange
            ? (event) => onHeightChange(event.nativeEvent.layout.height)
            : undefined
        }
        className={cn(
          "gap-2 border-t px-4 pb-3 pt-2",
          market
            ? "border-market-line bg-market-canvas"
            : "border-border bg-background",
        )}
      >
        {title ? (
          <View className="gap-0.5">
            <Text
              className={cn(
                "text-xs font-extrabold uppercase tracking-[1.4px]",
                market ? "text-market-accent-ink" : "text-primary",
              )}
            >
              {title}
            </Text>
            {helperText ? (
              <Text
                className={cn(
                  "text-xs",
                  market ? "text-market-muted-ink" : "text-muted-foreground",
                )}
              >
                {helperText}
              </Text>
            ) : null}
          </View>
        ) : null}
        {pills.length > 0 ? (
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
          >
            <View className="flex-row gap-2 pr-4">
              {pills.map((pill) => (
                <Pressable
                  accessibilityLabel={
                    pill.removable
                      ? `Remove ${pill.label}`
                      : `Use ${pill.label}`
                  }
                  className={cn(
                    "min-h-9 flex-row items-center justify-center gap-2 rounded-full border px-4",
                    pill.selected
                      ? market
                        ? "border-market-palm bg-market-palm"
                        : "border-primary bg-primary"
                      : market
                        ? "border-market-line bg-market-field"
                        : "border-border bg-card",
                  )}
                  haptic
                  key={pill.id}
                  disabled={disabled}
                  onPress={() => {
                    if (!disabled)
                      pill.removable ? onRemovePill?.(pill) : onPillPress(pill)
                  }}
                  transition
                >
                  <Text
                    className={cn(
                      "text-xs font-bold",
                      pill.selected
                        ? market
                          ? "text-market-on-palm"
                          : "text-primary-foreground"
                        : market
                          ? "text-market-ink"
                          : "text-foreground",
                    )}
                  >
                    {pill.label}
                  </Text>
                  {pill.removable ? (
                    <Icon
                      className={cn(
                        "size-xs",
                        pill.selected
                          ? market
                            ? "text-market-on-palm"
                            : "text-primary-foreground"
                          : market
                            ? "text-market-muted-ink"
                            : "text-muted-foreground",
                      )}
                      name="X"
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        ) : null}

        <View
          className={largeTextLayout ? "gap-2" : "flex-row items-center gap-2"}
        >
          <View
            className={cn(
              largeTextLayout
                ? "min-h-14 min-w-0 flex-row items-center rounded-2xl border border-border bg-card px-4"
                : "min-h-12 min-w-0 flex-1 flex-row items-center rounded-full border border-border bg-card px-4",
              market && "border-market-line bg-market-field",
            )}
          >
            <TextInput
              autoCapitalize="words"
              autoFocus
              editable={!disabled}
              maxLength={1000}
              blurOnSubmit={dismissKeyboardOnSubmit}
              className={cn(
                "min-w-0 flex-1 py-2 text-sm [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
                market ? "text-market-ink" : "text-foreground",
              )}
              onChangeText={onChangeText}
              onSubmitEditing={submit}
              placeholder={
                largeTextLayout && largeTextPlaceholder
                  ? largeTextPlaceholder
                  : placeholder
              }
              placeholderTextColor={
                market ? palette.mutedInk : colors.mutedForeground
              }
              ref={ref}
              returnKeyType="done"
              selectionColor={market ? palette.accentInk : colors.primary}
              showSoftInputOnFocus
              submitBehavior={
                dismissKeyboardOnSubmit ? "blurAndSubmit" : "submit"
              }
              value={value}
            />
          </View>
          {hideSubmitButton ? null : largeTextLayout ? (
            <ActionButton
              accessibilityLabel={submitAccessibilityLabel}
              onPress={submit}
              disabled={!canSubmit}
              icon={submitIconName}
              foregroundColor={market ? palette.onPalm : undefined}
              disabledForegroundColor={market ? palette.mutedInk : undefined}
              className={
                market
                  ? canSubmit
                    ? "bg-market-palm active:bg-market-hero-pressed"
                    : "bg-market-line active:bg-market-line"
                  : undefined
              }
            >
              {submitLabel}
            </ActionButton>
          ) : (
            <Pressable
              accessibilityLabel={submitAccessibilityLabel}
              className={cn(
                largeTextLayout
                  ? "min-h-12 w-full flex-row items-center justify-center gap-2 rounded-full px-5"
                  : "h-12 w-12 items-center justify-center rounded-full",
                canSubmit
                  ? market
                    ? "bg-market-palm"
                    : "bg-primary"
                  : market
                    ? "bg-market-line"
                    : "bg-muted",
              )}
              disabled={!canSubmit}
              haptic
              onPress={submit}
            >
              <Icon
                className={cn(
                  "size-sm",
                  canSubmit
                    ? market
                      ? "text-market-on-palm"
                      : "text-primary-foreground"
                    : market
                      ? "text-market-muted-ink"
                      : "text-muted-foreground",
                )}
                name={submitIconName}
              />
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardStickyView>
  )
})

const styles = StyleSheet.create({
  sticky: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 100,
  },
})
