import { ActionButton } from "@/components/mobile/action-button"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { useSaveOfferingBarcode } from "@/components/mobile/catalog-item/save-offering-barcode"
import { FloatingSearchField } from "@/components/mobile/floating-search-field"
import { RowDivider } from "@/components/mobile/green-till/kit"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useDeferredValue, useMemo, useState } from "react"
import {
  FlatList,
  Modal as NativeModal,
  View as NativeView,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export type LinkOption = {
  catalogItemId: string
  offeringId: string
  itemName: string
  optionName: string
  priceLabel: string
  barcode: string | null
}

type Group = { id: string; name: string; options: LinkOption[] }

/**
 * Workshop Mobile Quality 02 Create sale v3, direction 01 "Grouped by item":
 * a full screen for attaching a scanned code to one goods option. Services,
 * Add buttons and the sale's own controls are absent; picking an option asks
 * for confirmation in a floating sheet before anything is saved.
 */
export function LinkBarcodeScreen({
  code,
  onClose,
  onLinked,
}: {
  code: string
  onClose: () => void
  onLinked: (option: LinkOption) => void
}) {
  const trpc = useTRPC()
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const query = useDeferredValue(search.trim())
  const [pick, setPick] = useState<LinkOption | null>(null)
  const [error, setError] = useState("")
  const { save, saving } = useSaveOfferingBarcode()
  const items = useInfiniteQuery(
    trpc.catalog.listItemsPage.infiniteQueryOptions(
      {
        kind: "product",
        limit: 30,
        query: query || undefined,
        sort: { field: "name", direction: "asc" },
        status: "active",
      },
      { getNextPageParam: (page) => page.nextCursor, retry: false },
    ),
  )
  const groups = useMemo<Group[]>(
    () =>
      (items.data?.pages ?? []).flatMap((page) =>
        page.items.flatMap((item) => {
          const variants = item.variants.filter((v) => v.status === "active")
          const options = variants.flatMap((variant) =>
            variant.offerings
              .filter((o) => o.status === "active" && o.productUnit)
              .map(
                (offering): LinkOption => ({
                  catalogItemId: item.id,
                  offeringId: offering.id,
                  itemName: item.name,
                  optionName:
                    variants.length > 1
                      ? `${variant.name} · ${offering.name}`
                      : offering.name,
                  priceLabel:
                    offering.fixedPriceMinor === null
                      ? "Price not set"
                      : formatMinorMoney(
                          offering.fixedPriceMinor,
                          offering.currencyCode,
                        ),
                  barcode: offering.productUnit?.barcode ?? null,
                }),
              ),
          )
          return options.length
            ? [{ id: item.id, name: item.name, options }]
            : []
        }),
      ),
    [items.data],
  )
  const optionCount = groups.reduce((n, g) => n + g.options.length, 0)

  const confirm = async () => {
    if (!pick) return
    setError("")
    try {
      await save({
        catalogItemId: pick.catalogItemId,
        offeringId: pick.offeringId,
        barcode: code,
      })
      onLinked(pick)
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "The barcode could not be linked. Try again.",
      )
    }
  }

  return (
    <NativeModal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={pick ? () => setPick(null) : onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
      visible
    >
      <MobileWorkflowChrome
        closeLabel="Close Link barcode"
        hideHeader={false}
        keyboardBottomOffset={0}
        onClose={onClose}
        title="Link barcode"
      >
        <View className="flex-1">
          <FlatList
            contentContainerStyle={{
              gap: 12,
              paddingBottom: insets.bottom + 96,
              paddingHorizontal: 16,
            }}
            data={groups}
            keyExtractor={(group) => group.id}
            keyboardShouldPersistTaps="handled"
            onEndReached={() => {
              if (items.hasNextPage && !items.isFetchingNextPage)
                void items.fetchNextPage()
            }}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <View className="gap-3">
                <View className="flex-row items-center gap-3 rounded-[18px] bg-card px-4 py-3">
                  <Icon
                    className="size-[22px] text-muted-foreground"
                    name="BarcodeScan"
                  />
                  <View className="min-w-0 flex-1">
                    <Text className="text-[11px] font-extrabold tracking-[0.3px] text-muted-foreground">
                      SCANNED CODE
                    </Text>
                    <Text className="text-base font-extrabold tabular-nums text-foreground">
                      {code}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-baseline justify-between">
                  <Text className="text-xs font-extrabold tracking-[0.3px] text-muted-foreground">
                    GOODS
                  </Text>
                  {optionCount ? (
                    <Text className="text-xs font-extrabold tabular-nums text-muted-foreground">
                      {`${optionCount} ${optionCount === 1 ? "option" : "options"}`}
                    </Text>
                  ) : null}
                </View>
                {items.error ? (
                  <StatusBanner
                    actionLabel="Try again"
                    message={items.error.message}
                    onActionPress={() => void items.refetch()}
                    title="Goods could not load"
                    tone="warning"
                  />
                ) : null}
              </View>
            }
            ListEmptyComponent={
              items.isLoading ? (
                <SkeletonGroup accessibilityLabel="Loading goods">
                  <View className="gap-2.5 rounded-[20px] bg-card p-3.5">
                    {[0.6, 0.45, 0.7].map((width) => (
                      <View
                        key={width}
                        className="flex-row items-center gap-2.5"
                      >
                        <Skeleton height={36} radius={11} width={36} />
                        <Skeleton
                          height={14}
                          radius={4}
                          width={`${width * 100}%`}
                        />
                      </View>
                    ))}
                  </View>
                </SkeletonGroup>
              ) : items.error ? null : (
                <Text className="py-6 text-center text-sm text-muted-foreground">
                  {query ? "No goods match" : "No goods yet"}
                </Text>
              )
            }
            renderItem={({ item: group }) => (
              <View className="overflow-hidden rounded-[20px] bg-card">
                <View className="relative flex-row items-center gap-2.5 px-3.5 py-3">
                  <View className="size-9 items-center justify-center rounded-[11px] bg-accent">
                    <Text className="text-sm font-extrabold text-accent-foreground">
                      {Array.from(group.name.trim())[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                  <Text
                    className="min-w-0 flex-1 text-[15px] font-extrabold text-foreground"
                    numberOfLines={1}
                  >
                    {group.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {`${group.options.length} ${group.options.length === 1 ? "option" : "options"}`}
                  </Text>
                  <RowDivider />
                </View>
                {group.options.map((option, index) => (
                  <Pressable
                    key={option.offeringId}
                    accessibilityLabel={`Link to ${option.itemName}, ${option.optionName}${option.barcode ? `, has barcode ${option.barcode}` : ""}`}
                    accessibilityRole="button"
                    className="relative flex-row items-center gap-3 py-3 pl-[60px] pr-3.5"
                    haptic
                    onPress={() => {
                      setError("")
                      setPick(option)
                    }}
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-bold text-foreground">
                        {option.optionName}
                      </Text>
                      <Text className="text-xs tabular-nums text-muted-foreground">
                        {option.barcode
                          ? `${option.priceLabel} · ${option.barcode}`
                          : option.priceLabel}
                      </Text>
                    </View>
                    <Icon
                      className="size-[18px] text-muted-foreground"
                      name="ChevronRight"
                    />
                    {index < group.options.length - 1 ? <RowDivider /> : null}
                  </Pressable>
                ))}
              </View>
            )}
          />
          <NativeView
            pointerEvents="box-none"
            style={{
              bottom: insets.bottom + 12,
              left: 16,
              position: "absolute",
              right: 16,
            }}
          >
            <FloatingSearchField
              accessibilityLabel="Search goods by name"
              focused={searchFocused}
              maxLength={80}
              onBlur={() => setSearchFocused(false)}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              placeholder="Search goods"
              value={search}
            />
          </NativeView>
          {pick ? (
            <LinkConfirm
              code={code}
              error={error}
              onCancel={() => setPick(null)}
              onConfirm={() => void confirm()}
              option={pick}
              saving={saving}
            />
          ) : null}
        </View>
      </MobileWorkflowChrome>
    </NativeModal>
  )
}

/** Floating confirmation over the list (a native modal hosts this screen). */
function LinkConfirm({
  code,
  error,
  onCancel,
  onConfirm,
  option,
  saving,
}: {
  code: string
  error: string
  onCancel: () => void
  onConfirm: () => void
  option: LinkOption
  saving: boolean
}) {
  const insets = useSafeAreaInsets()
  return (
    <>
      <Pressable
        accessibilityLabel="Close"
        className="absolute inset-0 bg-overlay"
        disabled={saving}
        onPress={onCancel}
      />
      <NativeView
        style={{
          bottom: Math.max(20, insets.bottom + 12),
          left: 8,
          position: "absolute",
          right: 8,
        }}
      >
        <View
          accessibilityRole="alert"
          className="gap-3 rounded-[32px] bg-card px-5 pb-5 pt-3"
        >
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="text-lg font-extrabold text-foreground">
            {`Link ${code} to ${option.itemName} · ${option.optionName}?`}
          </Text>
          <View className="flex-row items-center gap-3 rounded-[16px] bg-muted px-3 py-2.5">
            <View className="size-9 items-center justify-center rounded-[11px] bg-accent">
              <Text className="text-sm font-extrabold text-accent-foreground">
                {Array.from(option.itemName.trim())[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-bold text-foreground">
                {`${option.itemName} · ${option.optionName}`}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {option.priceLabel}
              </Text>
            </View>
          </View>
          {option.barcode ? (
            <StatusBanner
              icon="AlertCircle"
              message={`This replaces its barcode ${option.barcode}. Each option keeps one barcode.`}
              tone="warning"
            />
          ) : null}
          {error ? (
            <StatusBanner
              icon="AlertCircle"
              message={error}
              tone="destructive"
            />
          ) : null}
          <ActionButton icon="Link" isLoading={saving} onPress={onConfirm}>
            Link and add to sale
          </ActionButton>
          <ActionButton disabled={saving} onPress={onCancel} variant="outline">
            Cancel
          </ActionButton>
        </View>
      </NativeView>
    </>
  )
}
