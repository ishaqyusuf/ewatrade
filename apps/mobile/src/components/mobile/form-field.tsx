import { Icon, type IconKeys } from "@/components/ui/icon"
import { Input } from "@/components/ui/input-2"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"
import { useState } from "react"
import { View } from "react-native"

type FormFieldProps = Omit<ComponentProps<typeof Input>, "className"> & {
  containerClassName?: string
  error?: string
  helper?: string
  inputClassName?: string
  label: string
  leadingIcon?: IconKeys
  trailingIcon?: IconKeys
  variant?: "auth" | "filled" | "line"
}

export function FormField({
  containerClassName,
  error,
  helper,
  inputClassName,
  label,
  leadingIcon,
  onBlur,
  onFocus,
  trailingIcon,
  variant = "filled",
  ...inputProps
}: FormFieldProps) {
  const isAuthVariant = variant === "auth"
  const colors = useColors()
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
  const shouldShowLabel = !isAuthVariant
  const isMultiline = !!inputProps.multiline

  return (
    <View
      className={cn(isAuthVariant ? "gap-2" : "gap-2.5", containerClassName)}
    >
      {shouldShowLabel ? (
        <Text
          className={cn(
            "text-xs font-bold uppercase tracking-[1.4px]",
            error
              ? "text-destructive"
              : isFocused
                ? "text-primary"
                : "text-muted-foreground",
          )}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          alignItems: isMultiline ? "flex-start" : "center",
          backgroundColor: colors.card,
          borderColor: activeBorderColor,
          borderRadius: 12,
          borderWidth: isFocused || error ? 1.5 : 1,
          flexDirection: "row",
          gap: 10,
          minHeight: isMultiline ? 92 : 50,
          paddingHorizontal: 14,
          paddingVertical: isMultiline ? 10 : 0,
        }}
      >
        {leadingIcon ? (
          <Icon className={iconClassName} name={leadingIcon} />
        ) : null}
        <Input
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          className={cn(
            isMultiline
              ? "min-h-[72px] flex-1 border-0 bg-transparent px-0 py-0"
              : "h-[48px] flex-1 border-0 bg-transparent px-0",
            inputClassName,
          )}
          expand
          unstyled
          {...sharedInputProps}
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
