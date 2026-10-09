import { FormField } from "@/components/mobile/form-field"
import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import {
  type Country,
  countryFlag,
  getCountry,
  searchCountries,
} from "@ewatrade/utils/countries"
import { BottomSheetFlatList } from "@gorhom/bottom-sheet"
import { useMemo, useState } from "react"
import { useWindowDimensions } from "react-native"

/**
 * A country field: the flag and name in a field-like control that opens a
 * floating sheet of countries with flags, dialling codes and search.
 */
export function CountrySelect({
  label = "Country",
  disabled = false,
  onChange,
  value,
}: {
  label?: string
  disabled?: boolean
  onChange: (code: string) => void
  value: string
}) {
  const colors = useColors()
  const largeText = useLargeTextLayout()
  const { height } = useWindowDimensions()
  const modal = useModal()
  const [search, setSearch] = useState("")
  const country = getCountry(value)
  const countries = useMemo(() => searchCountries(search), [search])

  const choose = (next: Country) => {
    if (disabled) return
    onChange(next.code)
    modal.dismiss()
  }

  return (
    <View className="gap-2.5">
      <Text className="text-xs font-bold [-rn-line-height:18] text-muted-foreground">
        {label}
      </Text>
      <Pressable
        accessibilityHint="Opens the country list"
        accessibilityLabel={`${label}: ${country.name}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        haptic
        onPress={() => {
          setSearch("")
          modal.present()
        }}
        style={{
          alignItems: "center",
          backgroundColor: colors.muted,
          borderColor: colors.border,
          borderRadius: 14,
          borderWidth: 1,
          flexDirection: "row",
          gap: 10,
          minHeight: largeText ? 64 : 50,
          paddingHorizontal: 14,
        }}
        testID="country-select"
      >
        <Text className="text-[20px] [-rn-line-height:26]">
          {countryFlag(country.code)}
        </Text>
        <Text
          className="min-w-0 flex-1 text-[15px] font-semibold text-foreground"
          numberOfLines={largeText ? undefined : 1}
        >
          {country.name}
        </Text>
        <Icon
          className="size-[18px] text-muted-foreground"
          name="ChevronDown"
        />
      </Pressable>

      <Modal
        enableDynamicSizing={false}
        maxDynamicContentSize={height * 0.85}
        onDismiss={() => setSearch("")}
        ref={modal.ref}
        snapPoints={["75%"]}
        title="Country"
      >
        <BottomSheetFlatList<Country>
          contentContainerStyle={{ paddingBottom: 24 }}
          data={countries}
          initialNumToRender={14}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.code}
          ListEmptyComponent={
            <Text className="px-5 py-6 text-center text-sm text-muted-foreground">
              No country matches “{search.trim()}”.
            </Text>
          }
          ListHeaderComponent={
            <BottomSheetInputProvider>
              <View className="px-5 pb-2">
                <FormField
                  autoCapitalize="none"
                  autoCorrect={false}
                  label="Search countries"
                  leadingIcon="Search"
                  onChangeText={setSearch}
                  placeholder="Country, code or +dial code"
                  value={search}
                  variant="search"
                />
              </View>
            </BottomSheetInputProvider>
          }
          renderItem={({ item }) => {
            const selected = item.code === country.code
            return (
              <Pressable
                accessibilityLabel={`${item.name}, plus ${item.dialCode}`}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                className={cn(
                  "mx-3 min-h-12 flex-row items-center gap-3 rounded-2xl px-3 py-2.5 active:bg-accent",
                  selected && "bg-accent",
                )}
                haptic
                onPress={() => choose(item)}
              >
                <Text className="text-[22px] [-rn-line-height:28]">
                  {countryFlag(item.code)}
                </Text>
                <Text
                  className={cn(
                    "min-w-0 flex-1 text-[15px] [-rn-line-height:20] text-foreground",
                    selected ? "font-bold" : "font-medium",
                  )}
                >
                  {item.name}
                </Text>
                <Text className="text-sm font-semibold text-muted-foreground">
                  +{item.dialCode}
                </Text>
                {selected ? (
                  <Icon className="size-[18px] text-primary" name="Check" />
                ) : (
                  <View className="size-[18px]" />
                )}
              </Pressable>
            )
          }}
        />
      </Modal>
    </View>
  )
}
