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
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { FlatList, View } from "react-native"

type CatalogKindFilter = "all" | "product" | "service"
type CatalogItem = RouterOutputs["catalog"]["listItems"][number]

type CatalogRow = {
  detail: string
  id: string
  kind: "product" | "service"
  name: string
  priceLabel: string
  unitName: string
}

type CatalogItemsContentProps = {
  onAddItem: () => void
  onComplete?: () => void
}

function mapCatalogItem(item: CatalogItem): CatalogRow {
  const defaultVariant =
    item.variants.find((variant) => variant.isDefault) ?? item.variants[0]
  const offering = defaultVariant?.offerings[0]
  const currencyCode = offering?.currencyCode ?? "NGN"
  const priceLabel =
    offering?.pricingPolicy === "fixed" && offering.fixedPriceMinor !== null
      ? formatMinorMoney(offering.fixedPriceMinor, currencyCode)
      : "Quote"

  if (item.kind === "service") {
    return {
      detail: `${priceLabel} · No inventory`,
      id: item.id,
      kind: item.kind,
      name: item.name,
      priceLabel,
      unitName: offering?.name ?? "Service",
    }
  }

  const canonicalUnit =
    item.product?.currentUnitConfiguration?.units.find(
      (unit) => unit.stockBehavior === "canonical_shared",
    ) ?? item.product?.currentUnitConfiguration?.units[0]
  const balance = item.product?.stockBalances[0]
  const unitName = balance?.inventoryUnitName ?? canonicalUnit?.name ?? "unit"

  return {
    detail: `${balance?.onHandQuantity ?? "0"} ${unitName} available · ${priceLabel}`,
    id: item.id,
    kind: item.kind,
    name: item.name,
    priceLabel,
    unitName,
  }
}

function CatalogItemRow({ item }: { item: CatalogRow }) {
  return (
    <SecondaryOperationalRow
      detail={item.detail}
      icon={item.kind === "service" ? "Wrench" : "Warehouse"}
      title={item.name}
      trailing={
        <StatusBadge
          label={item.kind === "service" ? "Service" : "Product"}
          tone={item.kind === "service" ? "primary" : "success"}
        />
      }
    />
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
  const [kindFilter, setKindFilter] = useState<CatalogKindFilter>("all")
  const [query, setQuery] = useState("")
  const itemsQuery = useQuery(
    trpc.catalog.listItems.queryOptions(
      { kind: kindFilter === "all" ? undefined : kindFilter },
      { retry: false },
    ),
  )
  const rows = useMemo(
    () => (itemsQuery.data ?? []).map(mapCatalogItem),
    [itemsQuery.data],
  )
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
          message={
            itemsQuery.isPending
              ? "Loading catalog items."
              : "Add a Product or Service to start your Catalog."
          }
          title={itemsQuery.isPending ? "Loading" : "No catalog items"}
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
            description="Products track stock. Services stay outside inventory."
            icon="Warehouse"
            title="Catalog items"
          />

          {itemsQuery.isError ? (
            <StatusBanner
              actionLabel="Try again"
              icon="AlertCircle"
              message={itemsQuery.error.message}
              onActionPress={() => void itemsQuery.refetch()}
              tone="destructive"
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
