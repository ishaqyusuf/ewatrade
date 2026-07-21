import { Icon, type IconProps } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
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
  canSubmit?: boolean
  dismissKeyboardOnSubmit?: boolean
  hideSubmitButton?: boolean
  onChangeText: (value: string) => void
  onPillPress: (pill: KeyboardInlineComposerPill) => void
  onRemovePill?: (pill: KeyboardInlineComposerPill) => void
  onSubmit: () => void
  pills: KeyboardInlineComposerPill[]
  placeholder: string
  submitAccessibilityLabel: string
  submitIconName?: IconProps["name"]
  value: string
  visible: boolean
}

export const KeyboardInlineComposer = forwardRef<
  TextInput,
  KeyboardInlineComposerProps
>(function KeyboardInlineComposer(
  {
    canSubmit: canSubmitOverride,
    dismissKeyboardOnSubmit = false,
    hideSubmitButton = false,
    onChangeText,
    onPillPress,
    onRemovePill,
    onSubmit,
    pills,
    placeholder,
    submitAccessibilityLabel,
    submitIconName = "Plus",
    value,
    visible,
  },
  ref,
) {
  const colors = useColors()
  const canSubmit = canSubmitOverride ?? value.trim().length > 0

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
      offset={{ closed: 88, opened: 70 }}
      pointerEvents="box-none"
      style={styles.sticky}
    >
      <View className="gap-2 border-t border-border bg-background px-4 pb-3 pt-2">
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
                      ? "border-primary bg-primary"
                      : "border-border bg-card",
                  )}
                  haptic
                  key={pill.id}
                  onPress={() =>
                    pill.removable ? onRemovePill?.(pill) : onPillPress(pill)
                  }
                  transition
                >
                  <Text
                    className={cn(
                      "text-xs font-bold",
                      pill.selected
                        ? "text-primary-foreground"
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
                          ? "text-primary-foreground"
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

        <View className="flex-row items-center gap-2">
          <View className="min-h-12 min-w-0 flex-1 flex-row items-center rounded-full border border-border bg-card px-4">
            <TextInput
              autoCapitalize="words"
              autoFocus
              blurOnSubmit={dismissKeyboardOnSubmit}
              className="min-w-0 flex-1 text-sm text-foreground"
              onChangeText={onChangeText}
              onSubmitEditing={submit}
              placeholder={placeholder}
              placeholderTextColor={colors.mutedForeground}
              ref={ref}
              returnKeyType="done"
              selectionColor={colors.primary}
              showSoftInputOnFocus
              submitBehavior={
                dismissKeyboardOnSubmit ? "blurAndSubmit" : "submit"
              }
              value={value}
            />
          </View>
          {hideSubmitButton ? null : (
            <Pressable
              accessibilityLabel={submitAccessibilityLabel}
              className={cn(
                "h-12 w-12 items-center justify-center rounded-full",
                canSubmit ? "bg-primary" : "bg-muted",
              )}
              disabled={!canSubmit}
              haptic
              onPress={submit}
            >
              <Icon
                className={cn(
                  "size-sm",
                  canSubmit
                    ? "text-primary-foreground"
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
