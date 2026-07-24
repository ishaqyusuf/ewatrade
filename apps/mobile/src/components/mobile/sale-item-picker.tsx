import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import {
  type SaleItemPickerLine,
  getSaleItemPickerLineCounts,
} from "@/components/mobile/sale-item-picker-model"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import { hexToRgba } from "@ewatrade/utils/colors"
import { StatusBar } from "expo-status-bar"
import { useMemo, useState } from "react"
import {
  FlatList,
  Image,
  Modal as NativeModal,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export type SaleOfferingChoice = {
  balanceRevision?: number
  configurationVersionId?: string
  currencyCode: string
  disabledReason?: string
  displayName: string
  fixedPriceMinor: number | null
  id: string
  imageUrl?: string | null
  itemName: string
  kind: "product_unit" | "service"
  offeringName: string
}

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export function SaleItemAvatar({
  choice,
  size = "compact",
}: {
  choice: SaleOfferingChoice
  size?: "compact" | "large"
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)

  const avatarClassName =
    size === "large" ? "h-14 w-14 rounded-full" : "h-11 w-11 rounded-full"

  if (choice.imageUrl && failedImageUrl !== choice.imageUrl) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        className={avatarClassName}
        onError={() => setFailedImageUrl(choice.imageUrl ?? null)}
        source={{ uri: choice.imageUrl }}
      />
    )
  }

  const label = initials(choice.itemName)

  return (
    <View
      className={cn(avatarClassName, "items-center justify-center bg-muted")}
    >
      {label ? (
        <Text
          className={cn(
            "font-extrabold text-foreground",
            size === "large" ? "text-sm" : "text-xs",
          )}
        >
          {label}
        </Text>
      ) : (
        <Icon
          className="size-sm text-muted-foreground"
          name={choice.kind === "service" ? "Wrench" : "Warehouse"}
        />
      )}
    </View>
  )
}

function SaleOfferingPickerRow({
  addedCount,
  choice,
  onPress,
}: {
  addedCount: number
  choice: SaleOfferingChoice
  onPress: () => void
}) {
  const disabled = Boolean(choice.disabledReason)

  return (
    <Pressable
      accessibilityHint={choice.disabledReason}
      accessibilityLabel={`${addedCount > 0 ? "Add another" : "Add"} ${choice.displayName}, ${choice.offeringName}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        "min-h-18 flex-row items-center gap-3 border-b border-border py-4 active:bg-accent",
        disabled && "opacity-50",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <SaleItemAvatar choice={choice} />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground" numberOfLines={1}>
          {choice.displayName}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {choice.offeringName} ·{" "}
          {choice.fixedPriceMinor === null
            ? "Price not set"
            : formatMinorMoney(choice.fixedPriceMinor, choice.currencyCode)}
        </Text>
        {choice.disabledReason ? (
          <Text className="text-xs font-semibold text-destructive">
            {choice.disabledReason}
          </Text>
        ) : addedCount > 0 ? (
          <Text className="text-xs font-semibold text-primary">
            {addedCount} {addedCount === 1 ? "line" : "lines"} already in order
          </Text>
        ) : null}
      </View>
      <View
        className={cn(
          "h-9 w-9 items-center justify-center rounded-full border-2",
          "border-muted-foreground bg-transparent",
          disabled && "border-muted-foreground bg-muted",
        )}
      >
        <Icon
          className="size-sm text-muted-foreground"
          name={disabled ? "Ban" : "Plus"}
        />
      </View>
    </Pressable>
  )
}

type CompactSaleItemPickerProps = {
  choices: SaleOfferingChoice[]
  itemKind?: "service"
  lineCountsByOfferingId: Map<string, number>
  onAdd: (choice: SaleOfferingChoice) => void
  onClose: () => void
  visible: boolean
}

export function CompactSaleItemPicker({
  choices,
  itemKind,
  lineCountsByOfferingId,
  onAdd,
  onClose,
  visible,
}: CompactSaleItemPickerProps) {
  const colors = useColors()
  const insets = useSafeAreaInsets()

  return (
    <NativeModal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View
        accessibilityViewIsModal
        style={{
          flex: 1,
          justifyContent: "flex-end",
          paddingBottom: Math.max(insets.bottom, 20),
          paddingHorizontal: 8,
        }}
      >
        <RNPressable
          accessibilityLabel="Close item picker"
          accessibilityRole="button"
          onPress={onClose}
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: hexToRgba(colors.foreground, 0.38) },
          ]}
        />
        <View
          style={{
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: 32,
            borderWidth: StyleSheet.hairlineWidth,
            maxHeight: 620,
            overflow: "hidden",
          }}
        >
          <View className="items-center pb-2 pt-3">
            <View className="h-1.5 w-12 rounded-full bg-muted-foreground/25" />
          </View>
          <View className="flex-row items-center gap-3 px-5 pb-2">
            <Text className="min-w-0 flex-1 text-lg font-extrabold text-foreground">
              {itemKind === "service"
                ? "Add service"
                : "Add product or service"}
            </Text>
            <Pressable
              accessibilityLabel="Close item picker"
              className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-accent"
              haptic
              onPress={onClose}
              transition
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="px-5 pb-6">
              {choices.length === 0 ? (
                <EmptyState
                  className="bg-transparent"
                  icon="FolderPlus"
                  message="Add an active offering with a price and store availability before creating this order."
                  title="No sellable items available"
                />
              ) : (
                choices.map((choice) => (
                  <SaleOfferingPickerRow
                    addedCount={lineCountsByOfferingId.get(choice.id) ?? 0}
                    choice={choice}
                    key={choice.id}
                    onPress={() => onAdd(choice)}
                  />
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </NativeModal>
  )
}

type FullScreenSaleItemPickerProps = {
  choices: SaleOfferingChoice[]
  draft: SaleItemPickerLine<SaleOfferingChoice>[]
  hasNextPage: boolean
  isFetchingNextPage: boolean
  itemKind?: "service"
  onAdd: (choice: SaleOfferingChoice) => void
  onClose: () => void
  onFetchNextPage: () => void
  onProceed: () => void
  onQueryChange: (value: string) => void
  onRemove: (lineId: string) => void
  query: string
  searchChoiceCount: number
  visible: boolean
}

export function FullScreenSaleItemPicker({
  choices,
  draft,
  hasNextPage,
  isFetchingNextPage,
  itemKind,
  onAdd,
  onClose,
  onFetchNextPage,
  onProceed,
  onQueryChange,
  onRemove,
  query,
  searchChoiceCount,
  visible,
}: FullScreenSaleItemPickerProps) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const insets = useSafeAreaInsets()
  const lineCountsByOfferingId = useMemo(
    () => getSaleItemPickerLineCounts(draft),
    [draft],
  )

  return (
    <NativeModal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View style={{ backgroundColor: colors.background, flex: 1 }}>
        <StatusBar
          backgroundColor={colors.background}
          style={colorScheme === "dark" ? "light" : "dark"}
        />
        <View style={{ height: insets.top }} />

        <View className="flex-row items-start justify-between gap-4 border-b border-border px-4 py-4">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xl font-extrabold text-foreground">
              {itemKind === "service"
                ? "Add services"
                : "Add products or services"}
            </Text>
            <Text className="text-sm text-muted-foreground">
              Add each item as many times as needed, then set quantities.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close item picker and discard changes"
            className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-accent"
            haptic
            onPress={onClose}
            transition
          >
            <Icon className="size-sm text-foreground" name="X" />
          </Pressable>
        </View>

        <View className="min-h-[112px] border-b border-border px-4 py-3">
          <View className="mb-2 flex-row items-center justify-between gap-3">
            <Text className="text-xs font-bold uppercase tracking-[1.2px] text-muted-foreground">
              Selected
            </Text>
            <Text className="text-xs font-bold text-primary">
              {draft.length}
            </Text>
          </View>
          {draft.length === 0 ? (
            <View className="min-h-16 justify-center">
              <Text className="text-sm text-muted-foreground">
                Tap a product or service below to add it here.
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
            >
              <View className="flex-row gap-3 pr-4">
                {draft.map((line) => (
                  <View className="w-[72px] items-center gap-1" key={line.id}>
                    <View className="relative">
                      <SaleItemAvatar choice={line.offering} size="large" />
                      <Pressable
                        accessibilityLabel={`Remove one ${line.offering.displayName} line`}
                        allowOverflow
                        className="absolute -right-2 -top-2 h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-foreground"
                        hitSlop={8}
                        haptic
                        onPress={() => onRemove(line.id)}
                      >
                        <Icon className="size-xs text-background" name="X" />
                      </Pressable>
                    </View>
                    <Text
                      className="w-full text-center text-[10px] font-bold text-foreground"
                      numberOfLines={1}
                    >
                      {line.offering.displayName}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        <FlatList
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: 104,
            paddingHorizontal: 16,
          }}
          data={choices}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(choice) => choice.id}
          ListEmptyComponent={
            <EmptyState
              className="my-8"
              icon={query ? "Search" : "FolderPlus"}
              message={
                query
                  ? "Try another product, service, unit, or variant name."
                  : "Add an active offering with a price and store availability before creating this order."
              }
              title={
                query ? "No matching items" : "No sellable items available"
              }
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <Text className="py-5 text-center text-xs font-semibold text-muted-foreground">
                Loading more items…
              </Text>
            ) : null
          }
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) onFetchNextPage()
          }}
          onEndReachedThreshold={0.35}
          renderItem={({ item }) => (
            <SaleOfferingPickerRow
              addedCount={lineCountsByOfferingId.get(item.id) ?? 0}
              choice={item}
              onPress={() => onAdd(item)}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        />

        <BottomSearchFooter
          accessibilityLabel="Search product or service"
          alwaysShowSearch
          layout="inline"
          onChangeText={onQueryChange}
          placeholder="Search items"
          totalCount={searchChoiceCount}
          value={query}
        >
          <ActionButton
            accessibilityLabel={`Proceed with ${draft.length} selected lines`}
            className="w-[112px]"
            onPress={onProceed}
            trailingIcon="ArrowRight"
          >
            Proceed
          </ActionButton>
        </BottomSearchFooter>
      </View>
    </NativeModal>
  )
}
