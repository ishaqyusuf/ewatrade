import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsProduct,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { FlatList, View } from "react-native"

type CatalogKindFilter = "all" | "product" | "service"
type ProductionCatalogItem = RouterOutputs["retailOps"]["catalogItems"][number]

type CatalogRow = {
  detail: string
  id: string
  kind: "product" | "service"
  name: string
  priceMinor: number
  source: "local" | "production"
  stockLabel?: string
  unitName: string
}

type CatalogItemsContentProps = {
  onAddItem: () => void
  onComplete?: () => void
}

function getCurrencyCode() {
  const state = useBusinessStore.getState()
  return (
    state.businesses.find((business) => business.id === state.activeBusinessId)
      ?.currency ?? "NGN"
  )
}

function mapLocalCatalogItem(item: RetailOpsProduct): CatalogRow {
  const kind = item.kind ?? "product"

  return {
    detail:
      kind === "service"
        ? item.service?.estimatedTurnaroundHours
          ? `Tracked · about ${item.service.estimatedTurnaroundHours}h`
          : item.service?.fulfillmentMode === "immediate"
            ? "Immediate fulfillment"
            : "Priced service"
        : `${item.currentStock ?? item.startingStock ?? 0} ${item.unitName} available`,
    id: `local-${item.id}`,
    kind,
    name: item.name,
    priceMinor: item.priceMinor,
    source: "local",
    stockLabel:
      kind === "product"
        ? `${item.currentStock ?? item.startingStock ?? 0} in stock`
        : undefined,
    unitName: item.unitName,
  }
}

function mapProductionCatalogItem(item: ProductionCatalogItem): CatalogRow {
  const defaultVariant =
    item.variants.find((variant) => variant.isDefault) ??
    item.variants[0] ??
    null
  const serviceDetail =
    item.service?.fulfillmentMode === "tracked"
      ? item.service.estimatedTurnaroundHours
        ? `Tracked · about ${item.service.estimatedTurnaroundHours}h`
        : "Tracked fulfillment"
      : "Immediate fulfillment"

  return {
    detail:
      item.kind === "service"
        ? serviceDetail
        : `${defaultVariant?.availableQuantity ?? 0} ${defaultVariant?.name ?? "units"} available`,
    id: `production-${item.id}`,
    kind: item.kind,
    name: item.name,
    priceMinor: defaultVariant?.priceMinor ?? 0,
    source: "production",
    stockLabel:
      item.kind === "product"
        ? `${defaultVariant?.availableQuantity ?? 0} in stock`
        : undefined,
    unitName: defaultVariant?.name ?? "Standard",
  }
}

function CatalogItemRow({ item }: { item: CatalogRow }) {
  return (
    <SecondaryOperationalRow
      detail={`${item.detail} · ${formatMinorMoney(item.priceMinor, getCurrencyCode())} per ${item.unitName}`}
      icon={item.kind === "service" ? "Wrench" : "Warehouse"}
      title={item.name}
      trailing={
        <StatusBadge
          label={item.kind === "service" ? "Service" : "Product"}
          tone={item.kind === "service" ? "primary" : "success"}
        />
      }
    >
      {item.source === "local" ? (
        <StatusBadge label="Saved on device" tone="warning" />
      ) : null}
    </SecondaryOperationalRow>
  )
}

function KindFilter({
  active,
  label,
  onPress,
}: {
  active: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className={
        active
          ? "rounded-full bg-primary px-4 py-2"
          : "rounded-full bg-muted px-4 py-2"
      }
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={
          active
            ? "text-xs font-bold text-primary-foreground"
            : "text-xs font-bold text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function CatalogItemsContent({
  onAddItem,
  onComplete,
}: CatalogItemsContentProps) {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const allLocalItems = useRetailOpsStore((state) => state.products)
  const [kindFilter, setKindFilter] = useState<CatalogKindFilter>("all")
  const [query, setQuery] = useState("")
  const productionItemsQuery = useQuery(
    trpc.retailOps.catalogItems.queryOptions(
      {
        kind: kindFilter === "all" ? undefined : kindFilter,
      },
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )
  const localItems = useMemo(
    () =>
      allLocalItems.filter(
        (item) =>
          (!activeBusinessId ||
            (item.businessId ?? activeBusinessId) === activeBusinessId) &&
          (kindFilter === "all" || (item.kind ?? "product") === kindFilter),
      ),
    [activeBusinessId, allLocalItems, kindFilter],
  )
  const rows = useMemo(() => {
    const localRows = localItems.map(mapLocalCatalogItem)

    if (isOfflineMode || !productionItemsQuery.data) return localRows

    const localRemoteIds = new Set(
      localItems.flatMap((item) => (item.remoteId ? [item.remoteId] : [])),
    )

    return [
      ...productionItemsQuery.data
        .filter((item) => !localRemoteIds.has(item.id))
        .map(mapProductionCatalogItem),
      ...localRows,
    ]
  }, [isOfflineMode, localItems, productionItemsQuery.data])
  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) return rows

    return rows.filter((item) =>
      [item.name, item.kind, item.unitName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [query, rows])
  const isLocalFallback = isOfflineMode || productionItemsQuery.isError

  return (
    <FlatList<CatalogRow>
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 220 }}
      data={visibleRows}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <EmptyState
          className="mx-4"
          icon="Warehouse"
          message="Add a priced Product or Service item to make it available at checkout."
          title="No catalog items found"
        />
      }
      ListFooterComponent={
        <View className="gap-3 px-4 pt-4 pb-8">
          <ActionButton onPress={onAddItem}>Add item</ActionButton>
          {onComplete ? (
            <ActionButton onPress={onComplete} variant="outline">
              Done
            </ActionButton>
          ) : null}
        </View>
      }
      ListHeaderComponent={
        <View className="gap-5 px-4 pt-1 pb-4">
          <SecondarySheetHeader
            description="Products track stock. Services keep a price but never show or change inventory."
            icon="Warehouse"
            title="Catalog items"
          />

          {isLocalFallback ? (
            <StatusBanner
              icon="Wind"
              message="Only items already saved on this device are available until the connection returns. New Services stay online-first."
              title={isOfflineMode ? "Offline catalog" : "Local fallback"}
              tone="warning"
            />
          ) : null}

          <View className="flex-row flex-wrap gap-2">
            <KindFilter
              active={kindFilter === "all"}
              label="All"
              onPress={() => setKindFilter("all")}
            />
            <KindFilter
              active={kindFilter === "product"}
              label="Products"
              onPress={() => setKindFilter("product")}
            />
            <KindFilter
              active={kindFilter === "service"}
              label="Services"
              onPress={() => setKindFilter("service")}
            />
          </View>

          <FormField
            autoCapitalize="words"
            label="Find item"
            leadingIcon="Search"
            onChangeText={setQuery}
            placeholder="Search name, type, or unit"
            value={query}
          />
        </View>
      }
      renderItem={({ item }) => (
        <View className="px-4">
          <CatalogItemRow item={item} />
        </View>
      )}
    />
  )
}
