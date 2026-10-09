import type { CommerceCustomer } from "@/components/mobile/commerce"
import {
  type SelectedCustomer,
  customerFromSuggestion,
} from "@/components/mobile/create-sale/create-sale-model"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { Text as NativeText, ScrollView } from "react-native"

const RAIL_LIMIT = 8

/** Walk-in, recent buyers and New, as the 02 Cart & Sheet rail. */
export function ClassicBuyerRail({
  customers,
  onNew,
  onSelect,
  selectedId,
}: {
  customers: CommerceCustomer[]
  onNew: () => void
  onSelect: (customer: SelectedCustomer | null) => void
  selectedId: string | null
}) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}
      style={{ marginHorizontal: -16 }}
    >
      <RailChoice
        bg={palette.sky}
        fg={palette.skyForeground}
        icon="Store"
        label="Walk-in"
        on={selectedId === null}
        onPress={() => onSelect(null)}
      />
      {customers.slice(0, RAIL_LIMIT).map((customer) => (
        <RailChoice
          key={customer.id}
          bg={palette.lilac}
          fg={palette.lilacForeground}
          initials={customer.initials}
          label={customer.name.split(/\s+/)[0] ?? customer.name}
          on={selectedId === customer.id}
          onPress={() => onSelect(customerFromSuggestion(customer))}
        />
      ))}
      <RailChoice
        bg={colors.accent}
        fg={colors.accentForeground}
        icon="UserPlus"
        label="New"
        on={false}
        onPress={onNew}
      />
    </ScrollView>
  )
}

function RailChoice({
  bg,
  fg,
  icon,
  initials,
  label,
  on,
  onPress,
}: {
  bg: string
  fg: string
  icon?: IconKeys
  initials?: string
  label: string
  on: boolean
  onPress: () => void
}) {
  const colors = useColors()
  return (
    <Pressable
      accessibilityLabel={label === "New" ? "Create customer" : label}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      haptic
      onPress={onPress}
      style={{ alignItems: "center", gap: 6, width: 62 }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: bg,
          borderColor: on ? colors.primary : "transparent",
          borderRadius: 999,
          borderWidth: 2,
          height: 58,
          justifyContent: "center",
          width: 58,
        }}
      >
        {icon ? (
          <Icon className="size-[20px]" color={fg} name={icon} />
        ) : (
          <NativeText
            maxFontSizeMultiplier={1.3}
            style={{ color: fg, fontSize: 15, fontWeight: "800" }}
          >
            {initials}
          </NativeText>
        )}
      </View>
      <NativeText
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={{
          color: on ? colors.primary : colors.foreground,
          fontSize: 12,
          fontWeight: on ? "800" : "700",
        }}
      >
        {label}
      </NativeText>
    </Pressable>
  )
}

export function ClassicSelectedBuyer({
  customer,
}: {
  customer: SelectedCustomer | null
}) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  const initials = customer?.name
    .split(/\s+/)
    .map((part) => Array.from(part)[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <View className="min-h-[66px] flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3 shadow-sm">
      <View
        style={{
          alignItems: "center",
          backgroundColor: customer ? palette.lilac : palette.sky,
          borderRadius: 999,
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        {customer ? (
          <NativeText
            maxFontSizeMultiplier={1.3}
            style={{
              color: palette.lilacForeground,
              fontSize: 13,
              fontWeight: "800",
            }}
          >
            {initials}
          </NativeText>
        ) : (
          <Icon
            className="size-[18px]"
            color={palette.skyForeground}
            name="Store"
          />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-bold text-foreground">
          {customer?.name ?? "Walk-in customer"}
        </Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {customer
            ? [
                customer.directoryId
                  ? "Saved customer"
                  : "Previous sale contact",
                customer.phone,
              ]
                .filter(Boolean)
                .join(" · ")
            : "No customer attached to this sale"}
        </Text>
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.primary,
          borderRadius: 999,
          height: 24,
          justifyContent: "center",
          width: 24,
        }}
      >
        <Icon
          className="size-[14px]"
          color={colors.primaryForeground}
          name="Check"
        />
      </View>
    </View>
  )
}
