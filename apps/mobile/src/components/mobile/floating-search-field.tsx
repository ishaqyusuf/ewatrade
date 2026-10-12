import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input-2"
import { Pressable } from "@/components/ui/pressable"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { View } from "react-native"

type FloatingSearchFieldProps = {
  accessibilityLabel: string
  autoFocus?: boolean
  editable?: boolean
  focused: boolean
  maxLength?: number
  onBlur: () => void
  onChangeText: (value: string) => void
  onFocus: () => void
  placeholder: string
  value: string
}

/**
 * The floating search pill used by BottomSearchFooter: our search icon,
 * placeholder and a clear button, on a raised rounded surface with a hairline
 * border and a soft shadow. It sits over the list with no bar behind it.
 */
export function FloatingSearchField({
  accessibilityLabel,
  autoFocus,
  editable = true,
  focused,
  maxLength,
  onBlur,
  onChangeText,
  onFocus,
  placeholder,
  value,
}: FloatingSearchFieldProps) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const largeText = useLargeTextLayout()
  const dark = colorScheme === "dark"

  return (
    <View
      style={{
        alignItems: "center",
        // A step above the card in dark mode; white in light mode.
        backgroundColor: dark ? colors.muted : colors.card,
        borderColor: focused ? colors.primary : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        boxShadow: dark
          ? "0 14px 30px -8px rgba(0, 0, 0, 0.62)"
          : "0 12px 28px -10px rgba(24, 36, 32, 0.30), 0 2px 6px rgba(24, 36, 32, 0.06)",
        flexDirection: "row",
        gap: 10,
        minHeight: largeText ? 64 : 52,
        paddingLeft: 18,
        paddingRight: value && editable ? 7 : 18,
      }}
    >
      <Icon
        className={cn(
          "size-sm text-muted-foreground",
          !editable && "opacity-50",
        )}
        name="Search"
      />
      <Input
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        className={cn(largeText ? "h-16" : "h-[50px]", "text-[15px]")}
        editable={editable}
        expand
        maxLength={maxLength}
        numberOfLines={1}
        onBlur={onBlur}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        returnKeyType="search"
        unstyled
        value={value}
      />
      {value && editable ? (
        <Pressable
          accessibilityLabel="Clear search"
          accessibilityRole="button"
          className={cn(
            "size-9 items-center justify-center rounded-full",
            dark ? "bg-border" : "bg-muted",
          )}
          haptic
          hitSlop={6}
          onPress={() => onChangeText("")}
        >
          <Icon className="size-xs text-foreground" name="X" />
        </Pressable>
      ) : null}
    </View>
  )
}
