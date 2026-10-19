import { Icon, type IconKeys } from "@/components/ui/icon"
import { Input } from "@/components/ui/input-2"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { COMPACT_CONTROL_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { cn } from "@/lib/utils"
import type { ComponentProps, ReactNode } from "react"
import { useState } from "react"
import { View } from "react-native"

type FormFieldProps = Omit<ComponentProps<typeof Input>, "className"> & {
  actionLabel?: string
  containerClassName?: string
  error?: string
  helper?: string
  inputClassName?: string
  label: string
  leadingIcon?: IconKeys
  leadingContent?: ReactNode
  leadingActionLabel?: string
  onLeadingActionPress?: () => void
  leadingText?: string
  onActionPress?: () => void
  trailingIcon?: IconKeys
  variant?: "auth" | "green-gate" | "filled" | "line"
}

export function FormField({
  actionLabel,
  containerClassName,
  error,
  helper,
  inputClassName,
  label,
  leadingIcon,
  leadingContent,
  leadingActionLabel,
  onLeadingActionPress,
  leadingText,
  onBlur,
  onFocus,
  onActionPress,
  trailingIcon,
  variant = "filled",
  ...inputProps
}: FormFieldProps) {
  const isAuthVariant = variant === "auth"
  const isGreenGate = variant === "green-gate"
  const colors = useColors()
  const largeTextLayout = useLargeTextLayout()
  const [isFocused, setIsFocused] = useState(false)
  const activeBorderColor = error
    ? colors.destructive
    : isFocused
      ? colors.primary
      : colors.border
  const sharedInputProps = {
    onBlur: (event) => {
      setIsFocused(false)
      onBlur?.(event)
    },
    onFocus: (event) => {
      setIsFocused(true)
      onFocus?.(event)
    },
    ...inputProps,
  } satisfies ComponentProps<typeof Input>
  const iconClassName = cn(
    "size-sm",
    error
      ? "text-destructive"
      : isFocused
        ? "text-primary"
        : "text-muted-foreground",
  )
  const shouldShowLabel = !isAuthVariant || largeTextLayout
  const isMultiline = !!inputProps.multiline
  const singleLineHeight = largeTextLayout ? 64 : 50
  const embeddedStyle =
    inputProps.style || (!isMultiline && largeTextLayout)
      ? [
          inputProps.style,
          !isMultiline && largeTextLayout ? { height: 64 } : undefined,
        ]
      : undefined

  return (
    <View
      className={cn(isAuthVariant ? "gap-2" : "gap-2.5", containerClassName)}
    >
      {shouldShowLabel ? (
        <View
          className={cn(
            "flex-row items-center justify-between gap-3",
            largeTextLayout ? "min-h-8" : "min-h-5",
          )}
        >
          <Text
            className={cn(
              "min-w-0 flex-1 text-xs font-bold",
              isGreenGate
                ? "[-rn-line-height:22]"
                : "uppercase tracking-[1.4px]",
              !isGreenGate &&
                (largeTextLayout ? "leading-7" : "leading-[22px]"),
              error
                ? "text-destructive"
                : isFocused
                  ? "text-primary"
                  : "text-muted-foreground",
            )}
            maxFontSizeMultiplier={COMPACT_CONTROL_FONT_SCALE_CAP}
          >
            {label}
          </Text>
          {actionLabel && onActionPress ? (
            <Pressable
              accessibilityLabel={`${actionLabel} ${label}`}
              accessibilityRole="button"
              className="min-h-11 justify-center px-1"
              haptic
              onPress={onActionPress}
            >
              <Text className="text-xs font-bold text-primary">
                {actionLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View
        style={{
          alignItems: isMultiline ? "flex-start" : "center",
          backgroundColor: isGreenGate ? colors.muted : colors.card,
          borderColor: activeBorderColor,
          borderRadius: isGreenGate ? 14 : 12,
          borderWidth: isFocused || error ? 1.5 : 1,
          flexDirection: "row",
          gap: 10,
          minHeight: isMultiline ? 92 : singleLineHeight,
          paddingHorizontal: 14,
          paddingVertical: isMultiline ? 10 : largeTextLayout ? 6 : 0,
        }}
      >
        {leadingContent ??
          (leadingIcon ? (
            onLeadingActionPress && leadingActionLabel ? (
              <Pressable
                accessibilityLabel={leadingActionLabel}
                accessibilityRole="button"
                className="min-h-11 min-w-11 items-center justify-center rounded-full active:bg-accent"
                disabled={inputProps.editable === false}
                haptic
                onPress={onLeadingActionPress}
              >
                <Icon className={iconClassName} name={leadingIcon} />
              </Pressable>
            ) : (
              <Icon className={iconClassName} name={leadingIcon} />
            )
          ) : leadingText ? (
            <Text className={cn("font-semibold", iconClassName)}>
              {leadingText}
            </Text>
          ) : null)}
        <Input
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          {...(embeddedStyle
            ? {}
            : {
                className: cn(
                  isMultiline
                    ? "min-h-[72px] flex-1 border-0 bg-transparent px-0 py-0"
                    : "h-[48px] flex-1 border-0 bg-transparent px-0",
                  inputClassName,
                  isGreenGate && "text-base font-semibold",
                ),
              })}
          expand
          unstyled
          {...sharedInputProps}
          foregroundColor={inputProps.foregroundColor}
          placeholderTextColor={
            inputProps.placeholderTextColor ?? colors.mutedForeground
          }
          selectionColor={inputProps.selectionColor ?? colors.primary}
          numberOfLines={isMultiline ? inputProps.numberOfLines : 1}
          {...(embeddedStyle ? { style: embeddedStyle } : {})}
        />
        {trailingIcon ? (
          <Icon className={iconClassName} name={trailingIcon} />
        ) : null}
      </View>
      {error ? (
        <Text className="text-xs font-medium text-destructive">{error}</Text>
      ) : helper ? (
        <Text className="text-xs text-muted-foreground">{helper}</Text>
      ) : null}
    </View>
  )
}
