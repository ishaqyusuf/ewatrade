import { ClassicHelperRow } from "@/components/mobile/appearances/classic/catalog-helper-picker"
import { FormField } from "@/components/mobile/form-field"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { shouldShowListSearch } from "@/lib/list-pagination"
import {
  findBusinessProfile,
  getRecommendedCatalogSetupHelperKeys,
  rankCatalogSetupHelpersForBusinessProfile,
} from "@ewatrade/utils/business-profiles"
import {
  type CatalogSetupHelper,
  listCatalogSetupHelpers,
} from "@ewatrade/utils/catalog-setup-helpers"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { useEffect, useMemo, useRef, useState } from "react"
import { Keyboard, Modal as NativeModal, Platform, View } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type {
  CatalogSetupHelperPickerProps,
  HelperPickerRow,
} from "./catalog-helper-model"

export function CatalogSetupHelperPicker({
  businessProfileKey,
  kind,
  onClose,
  onSelect,
  selectedKey,
  visible,
  disabled = false,
}: CatalogSetupHelperPickerProps) {
  const [query, setQuery] = useState("")
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const pending = useRef<{
    helper: CatalogSetupHelper | null
    kind: typeof kind
    profileKey: typeof businessProfileKey
  } | null>(null)
  const current = useRef({ disabled, kind, businessProfileKey, onSelect })
  current.current = { disabled, kind, businessProfileKey, onSelect }
  const businessProfile = findBusinessProfile(businessProfileKey)
  const recommendations = useMemo(
    () =>
      new Set(
        getRecommendedCatalogSetupHelperKeys({
          kind,
          profileKey: businessProfileKey,
        }),
      ),
    [kind, businessProfileKey],
  )
  const allHelpers = useMemo(() => listCatalogSetupHelpers({ kind }), [kind])
  const helpers = useMemo(
    () =>
      rankCatalogSetupHelpersForBusinessProfile(
        listCatalogSetupHelpers({ kind, query }),
        businessProfileKey,
      ),
    [kind, query, businessProfileKey],
  )
  const personalized = helpers.filter((helper) =>
    recommendations.has(helper.key),
  )
  const others = helpers.filter((helper) => !recommendations.has(helper.key))
  const patterns = others.filter(
    (helper) => helper.classification === "pattern",
  )
  const examples = others.filter(
    (helper) => helper.classification === "example",
  )
  const highlightedKey =
    personalized[0]?.key ??
    patterns.find((helper) => helper.recommended)?.key ??
    patterns[0]?.key
  const rows: HelperPickerRow[] = [
    ...group("personal", "For your business", personalized, true),
    ...group("patterns", "Common setups", patterns, false),
    ...group("examples", "Examples", examples, false),
  ]
  const kindLabel = kind === "product" ? "Product" : "Service"
  const showSearch = shouldShowListSearch(allHelpers.length)
  function group(
    key: string,
    label: string,
    choices: CatalogSetupHelper[],
    isPersonalized: boolean,
  ): HelperPickerRow[] {
    return choices.length
      ? [
          { type: "heading", key, label },
          ...choices.map(
            (helper): HelperPickerRow => ({
              type: "helper",
              key: helper.key,
              helper,
              personalized: isPersonalized,
            }),
          ),
        ]
      : []
  }
  function finishSelection() {
    const selected = pending.current
    pending.current = null
    if (
      !selected ||
      current.current.disabled ||
      selected.kind !== current.current.kind ||
      selected.profileKey !== current.current.businessProfileKey
    )
      return
    current.current.onSelect(selected.helper)
  }
  function close() {
    pending.current = null
    Keyboard.dismiss()
    onClose()
  }
  function select(helper: CatalogSetupHelper | null) {
    if (disabled || pending.current) return
    pending.current = { helper, kind, profileKey: businessProfileKey }
    Keyboard.dismiss()
    onClose()
  }
  useEffect(() => {
    if (visible) return
    setQuery("")
    // RN emits onDismiss only on iOS. Android removes its native Dialog when
    // visible becomes false; dispatch on the following frame after that commit.
    if (Platform.OS !== "ios") {
      const frame = requestAnimationFrame(finishSelection)
      return () => cancelAnimationFrame(frame)
    }
  }, [visible])
  useEffect(
    () => () => {
      pending.current = null
    },
    [],
  )
  return (
    <NativeModal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
      onDismiss={finishSelection}
    >
      <VariableContextProvider
        value={{
          "--helper-top": insets.top,
          "--helper-bottom": insets.bottom + 24,
        }}
      >
        <View className="flex-1 bg-background">
          <StatusBar
            backgroundColor={colors.background}
            style={colorScheme === "dark" ? "light" : "dark"}
          />
          <View className="pt-[var(--helper-top)]">
            <View className="flex-row items-start gap-4 border-b border-border px-5 py-4">
              <View className="min-w-0 flex-1 gap-2">
                <Text
                  accessibilityRole="header"
                  className="text-xl font-extrabold text-foreground"
                >
                  {kindLabel + " setups"}
                </Text>
                <Text className="text-sm [-rn-line-height:20] text-muted-foreground">
                  {businessProfile && personalized.length
                    ? businessProfile.title +
                      " starting points appear first. Review every detail before saving."
                    : "Choose a starting point. Review every detail before saving."}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close quick setup"
                onPress={close}
                haptic
                className="size-11 items-center justify-center rounded-full bg-muted active:bg-accent"
              >
                <Icon name="X" className="size-sm text-foreground" />
              </Pressable>
            </View>
          </View>
          {showSearch ? (
            <View className="border-b border-border px-4 py-3">
              <FormField
                accessibilityLabel={"Search " + kindLabel + " setups"}
                autoCapitalize="none"
                autoCorrect={false}
                label="Search setups"
                leadingIcon="Search"
                onChangeText={setQuery}
                maxLength={160}
                placeholder={"Search " + kindLabel.toLowerCase() + " setups"}
                value={query}
                variant="search"
              />
            </View>
          ) : null}
          <FlatList
            className="flex-1"
            contentContainerClassName="pb-[var(--helper-bottom)]"
            data={rows}
            keyExtractor={(row) => row.key}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  selected: selectedKey === null,
                  disabled,
                }}
                disabled={disabled}
                onPress={() => select(null)}
                haptic
                className="mx-4 my-4 min-h-20 gap-2 rounded-2xl border border-border bg-card px-4 py-4"
              >
                <View className="flex-row items-center gap-3">
                  <Icon name="FilePenLine" className="size-sm text-primary" />
                  <Text className="min-w-0 flex-1 font-extrabold text-foreground">
                    Start blank
                  </Text>
                  {selectedKey === null ? (
                    <Icon name="Check" className="size-sm text-primary" />
                  ) : null}
                </View>
                <Text className="text-xs [-rn-line-height:18] text-muted-foreground">
                  {kind === "product"
                    ? "Enter the Product, units, and options yourself."
                    : "Enter the Service and work settings yourself."}
                </Text>
              </Pressable>
            }
            renderItem={({ item }) =>
              item.type === "heading" ? (
                <Text
                  accessibilityRole="header"
                  className="border-b border-border px-5 pb-3 pt-4 text-xs font-bold uppercase tracking-[1px] text-muted-foreground"
                >
                  {item.label}
                </Text>
              ) : (
                <ClassicHelperRow
                  helper={item.helper}
                  highlighted={item.key === highlightedKey}
                  personalized={item.personalized}
                  selected={item.key === selectedKey}
                  disabled={disabled}
                  onPress={() => select(item.helper)}
                />
              )
            }
            ListEmptyComponent={
              <Text className="px-5 py-12 text-center text-sm text-muted-foreground">
                No quick setups match “{query.trim()}”.
              </Text>
            }
          />
        </View>
      </VariableContextProvider>
    </NativeModal>
  )
}
