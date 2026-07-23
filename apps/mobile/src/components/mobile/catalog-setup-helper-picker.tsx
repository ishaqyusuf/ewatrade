import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
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
  type CatalogSetupHelperKind,
  listCatalogSetupHelpers,
} from "@ewatrade/utils/catalog-setup-helpers"
import { StatusBar } from "expo-status-bar"
import { useEffect, useMemo, useState } from "react"
import { Modal as NativeModal, ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type CatalogSetupHelperPickerProps = {
  businessProfileKey?: string | null
  kind: CatalogSetupHelperKind
  onClose: () => void
  onSelect: (helper: CatalogSetupHelper | null) => void
  selectedKey: string | null
  visible: boolean
}

function HelperRow({
  helper,
  onPress,
  personalized,
  selected,
}: {
  helper: CatalogSetupHelper
  onPress: () => void
  personalized: boolean
  selected: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="gap-2 border-b border-border px-5 py-5 active:bg-muted"
      haptic
      onPress={onPress}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 font-extrabold text-foreground">
          {helper.title}
        </Text>
        {selected ? (
          <View className="rounded-full bg-primary px-3 py-1">
            <Text className="text-xs font-bold text-primary-foreground">
              Selected
            </Text>
          </View>
        ) : personalized ? (
          <View className="rounded-full bg-primary/10 px-3 py-1">
            <Text className="text-xs font-bold text-primary">
              For your business
            </Text>
          </View>
        ) : helper.recommended ? (
          <View className="rounded-full bg-muted px-3 py-1">
            <Text className="text-xs font-bold text-muted-foreground">
              Recommended
            </Text>
          </View>
        ) : null}
      </View>
      <Text className="text-sm leading-6 text-muted-foreground">
        {helper.description}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {helper.tags.map((tag) => (
          <View className="rounded-full bg-muted px-3 py-1" key={tag}>
            <Text className="text-xs text-muted-foreground">{tag}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  )
}

export function CatalogSetupHelperPicker({
  businessProfileKey,
  kind,
  onClose,
  onSelect,
  selectedKey,
  visible,
}: CatalogSetupHelperPickerProps) {
  const [query, setQuery] = useState("")
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const businessProfile = findBusinessProfile(businessProfileKey)
  const recommendedHelperKeys = useMemo(
    () =>
      getRecommendedCatalogSetupHelperKeys({
        kind,
        profileKey: businessProfileKey,
      }),
    [businessProfileKey, kind],
  )
  const recommendedHelperKeySet = useMemo(
    () => new Set(recommendedHelperKeys),
    [recommendedHelperKeys],
  )
  const helpers = useMemo(
    () =>
      rankCatalogSetupHelpersForBusinessProfile(
        listCatalogSetupHelpers({ kind, query }),
        businessProfileKey,
      ),
    [businessProfileKey, kind, query],
  )
  const showSearch = shouldShowListSearch(
    listCatalogSetupHelpers({ kind }).length,
  )
  const personalizedHelpers = helpers.filter((helper) =>
    recommendedHelperKeySet.has(helper.key),
  )
  const remainingHelpers = helpers.filter(
    (helper) => !recommendedHelperKeySet.has(helper.key),
  )
  const patterns = remainingHelpers.filter(
    (helper) => helper.classification === "pattern",
  )
  const examples = remainingHelpers.filter(
    (helper) => helper.classification === "example",
  )

  useEffect(() => {
    if (!visible) setQuery("")
  }, [visible])

  const close = () => {
    setQuery("")
    onClose()
  }

  return (
    <NativeModal
      animationType="slide"
      onRequestClose={close}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        <StatusBar
          backgroundColor={colors.background}
          style={colorScheme === "dark" ? "light" : "dark"}
        />
        <View style={{ height: insets.top }} />
        <View className="flex-row items-start justify-between gap-4 border-b border-border px-5 py-4">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xl font-extrabold text-foreground">
              Choose a quick setup
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {businessProfile
                ? `${businessProfile.title} suggestions appear first. Review and edit before saving.`
                : "Pick a starting point, then review and edit it before saving."}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close quick setup"
            className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-accent"
            haptic
            onPress={close}
          >
            <Icon className="size-sm text-foreground" name="X" />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName={showSearch ? "pb-32" : "pb-8"}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selectedKey === null }}
            className="gap-1 border-b border-border px-5 py-5 active:bg-muted"
            haptic
            onPress={() => onSelect(null)}
          >
            <View className="flex-row items-center justify-between gap-3">
              <Text className="font-extrabold text-foreground">
                Start blank
              </Text>
              {selectedKey === null ? (
                <View className="rounded-full bg-primary px-3 py-1">
                  <Text className="text-xs font-bold text-primary-foreground">
                    Selected
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="text-sm leading-5 text-muted-foreground">
              Enter the item, units, options, and work settings yourself.
            </Text>
          </Pressable>

          {personalizedHelpers.length > 0 ? (
            <View>
              <Text className="border-b border-border px-5 py-3 text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                For your business
              </Text>
              {personalizedHelpers.map((helper) => (
                <HelperRow
                  helper={helper}
                  key={helper.key}
                  onPress={() => onSelect(helper)}
                  personalized
                  selected={selectedKey === helper.key}
                />
              ))}
            </View>
          ) : null}

          {patterns.length > 0 ? (
            <View>
              <Text className="border-b border-border px-5 py-3 text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                Setups
              </Text>
              {patterns.map((helper) => (
                <HelperRow
                  helper={helper}
                  key={helper.key}
                  onPress={() => onSelect(helper)}
                  personalized={recommendedHelperKeySet.has(helper.key)}
                  selected={selectedKey === helper.key}
                />
              ))}
            </View>
          ) : null}

          {examples.length > 0 ? (
            <View>
              <Text className="border-b border-border px-5 py-3 text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                Examples
              </Text>
              {examples.map((helper) => (
                <HelperRow
                  helper={helper}
                  key={helper.key}
                  onPress={() => onSelect(helper)}
                  personalized={recommendedHelperKeySet.has(helper.key)}
                  selected={selectedKey === helper.key}
                />
              ))}
            </View>
          ) : null}

          {helpers.length === 0 ? (
            <Text className="px-5 py-12 text-center text-sm text-muted-foreground">
              No quick setups match “{query.trim()}”.
            </Text>
          ) : null}
        </ScrollView>

        {showSearch ? (
          <BottomSearchFooter
            accessibilityLabel="Search templates"
            label="Search templates"
            onChangeText={setQuery}
            placeholder="Search units or business examples"
            totalCount={listCatalogSetupHelpers({ kind }).length}
            value={query}
          />
        ) : null}
      </View>
    </NativeModal>
  )
}
