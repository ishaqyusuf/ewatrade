import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { Children, Fragment, type ReactNode } from "react"
import { type AccessibilityRole, Text as NativeText } from "react-native"

// Green Till list pieces for the 03 auth screens: a white card of rows with
// hairline dividers, tinted icon chips, radios, checkboxes and pill chips.

export function AuthListCard({
  children,
  flat = false,
}: {
  children: ReactNode
  flat?: boolean
}) {
  const rows = Children.toArray(children).filter(Boolean)
  return (
    <View
      className={cn(
        flat ? "" : "rounded-[20px] bg-card px-[14px] py-0.5 shadow-sm",
      )}
    >
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows keep their order
        <Fragment key={index}>
          {index > 0 ? <View className="h-px bg-border" /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  )
}

export function AuthListRow({
  icon,
  tint = "mint",
  control,
  title,
  subtitle,
  chevron = false,
  onPress,
  accessibilityLabel,
  accessibilityRole,
  selected,
  disabled = false,
  testID,
}: {
  icon?: IconKeys
  tint?: GreenTillTint
  /** A radio or checkbox shown before the text. */
  control?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  chevron?: boolean
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityRole?: AccessibilityRole
  selected?: boolean
  disabled?: boolean
  testID?: string
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const body = (
    <>
      {control}
      {icon ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette[tint],
            borderRadius: 11,
            height: 36,
            justifyContent: "center",
            width: 36,
          }}
        >
          <Icon
            className="size-[18px]"
            color={palette[`${tint}Foreground`]}
            name={icon}
          />
        </View>
      ) : null}
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold [-rn-line-height:20] text-foreground">
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-xs [-rn-line-height:17] text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {chevron ? (
        <Icon
          className="size-[18px] text-muted-foreground"
          name="ChevronRight"
        />
      ) : null}
    </>
  )
  if (!onPress)
    return (
      <View className="min-h-11 flex-row items-center gap-3 py-3">{body}</View>
    )
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityState={
        selected === undefined ? { disabled } : { selected, disabled }
      }
      className="min-h-11 flex-row items-center gap-3 py-3 active:opacity-70"
      disabled={disabled}
      haptic
      onPress={onPress}
      testID={testID}
    >
      {body}
    </Pressable>
  )
}

export function AuthRadio({ selected }: { selected: boolean }) {
  return (
    <View
      className={cn(
        "size-[22px] items-center justify-center rounded-full border-2",
        selected ? "border-primary" : "border-border",
      )}
    >
      {selected ? (
        <View className="size-[11px] rounded-full bg-primary" />
      ) : null}
    </View>
  )
}

export function AuthCheckbox({ checked }: { checked: boolean }) {
  return (
    <View
      className={cn(
        "size-[22px] items-center justify-center rounded-[7px] border-2",
        checked ? "border-primary bg-primary" : "border-border",
      )}
    >
      {checked ? (
        <Icon className="size-[14px] text-primary-foreground" name="Check" />
      ) : null}
    </View>
  )
}

export function AuthChip({
  label,
  selected,
  showCheck = false,
  onPress,
  accessibilityRole = "radio",
}: {
  label: string
  selected: boolean
  showCheck?: boolean
  onPress: () => void
  accessibilityRole?: AccessibilityRole
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected, checked: selected }}
      haptic
      hitSlop={6}
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: selected ? colors.accent : colors.muted,
        borderColor: selected ? colors.primary : "transparent",
        borderRadius: 999,
        borderWidth: 1.5,
        flexDirection: "row",
        gap: 5,
        minHeight: 36,
        paddingHorizontal: 12,
      }}
    >
      {selected && showCheck ? (
        <Icon className="size-[13px] text-primary" name="Check" />
      ) : null}
      <Text
        className={cn(
          "text-[12.5px] font-bold [-rn-line-height:18]",
          selected ? "text-primary" : "text-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function AuthGroupLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="text-[12.5px] font-extrabold [-rn-line-height:18] text-foreground">
      {children}
    </Text>
  )
}

/** Lilac invitation card: business initial, name, email and role pill. */
export function InviteCard({
  businessName,
  email,
  role,
  muted = false,
}: {
  businessName: string
  email: string
  role: string
  muted?: boolean
}) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  const largeText = useLargeTextLayout()
  const lines = largeText ? undefined : 1
  const initial = Array.from(businessName.trim())[0]?.toUpperCase() ?? "?"
  return (
    <View
      accessible
      accessibilityLabel={`${businessName}, ${email}, ${role}`}
      style={{
        alignItems: "center",
        backgroundColor: palette.lilac,
        borderRadius: 18,
        flexDirection: "row",
        gap: 12,
        opacity: muted ? 0.6 : 1,
        padding: 14,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.primary,
          borderRadius: 22,
          height: 44,
          justifyContent: "center",
          width: 44,
        }}
      >
        <NativeText
          maxFontSizeMultiplier={1.3}
          style={{
            color: colors.primaryForeground,
            fontSize: 16,
            fontWeight: "800",
          }}
        >
          {initial}
        </NativeText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <NativeText
          numberOfLines={lines}
          style={{
            color: palette.lilacForeground,
            fontSize: 15,
            fontWeight: "700",
            lineHeight: 20,
          }}
        >
          {businessName}
        </NativeText>
        <NativeText
          numberOfLines={lines}
          style={{
            color: palette.lilacForeground,
            fontSize: 12.5,
            lineHeight: 17,
            opacity: 0.9,
          }}
        >
          {email}
        </NativeText>
      </View>
      <NativeText
        style={{
          backgroundColor: palette.lilacChip,
          borderRadius: 999,
          color: palette.lilacForeground,
          fontSize: 11,
          fontWeight: "800",
          overflow: "hidden",
          paddingHorizontal: 9,
          paddingVertical: 4,
        }}
      >
        {role}
      </NativeText>
    </View>
  )
}
