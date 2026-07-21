import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useOfflineCommandStore } from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  formatMinorMoney,
  getSaleOfferingDisabledReasons,
} from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type CatalogItem = RouterOutputs["catalog"]["listItems"][number]

function flatten(
  items: CatalogItem[],
  storeId: string | undefined,
  kind?: "service",
) {
  if (!storeId) return []

  return items.flatMap((item) =>
    item.variants.flatMap((variant) =>
      item.kind === kind || !kind
        ? variant.offerings.flatMap((offering) => {
            if (
              offering.status !== "active" ||
              offering.pricingPolicy !== "fixed" ||
              !offering.stores.some(
                (row) => row.storeId === storeId && row.isAvailable,
              )
            )
              return []
            const inventoryUnit =
              item.product?.currentUnitConfiguration?.units.find(
                (unit) => unit.id === offering.productUnit?.inventoryUnitId,
              )
            const balance = item.product?.stockBalances.find(
              (row) =>
                row.storeId === storeId &&
                row.variantId === variant.id &&
                (inventoryUnit?.stockBehavior === "packaged_stock"
                  ? row.kind === "packaged_stock" &&
                    row.inventoryUnitId ===
                      offering.productUnit?.inventoryUnitId
                  : row.kind === "shared_pool"),
            )
            const disabledReasons = getSaleOfferingDisabledReasons({
              fixedPriceMinor: offering.fixedPriceMinor,
              kind:
                offering.kind === "product_unit" ? "product_unit" : "service",
              onHandQuantity: balance?.onHandQuantity,
              reservedQuantity: balance?.reservedQuantity,
            })
            return [
              {
                balanceRevision: balance?.revision,
                configurationVersionId:
                  item.product?.currentUnitConfiguration?.id,
                currencyCode: offering.currencyCode,
                displayName:
                  item.variants.length > 1
                    ? `${item.name} · ${variant.name}`
                    : item.name,
                disabledReason: disabledReasons.join(" · ") || undefined,
                fixedPriceMinor: offering.fixedPriceMinor,
                id: offering.id,
                kind: offering.kind,
                offeringName: offering.name,
              },
            ]
          })
        : [],
    ),
  )
}

export function CreateSaleContent({
  attendantName: _attendantName,
  itemKind,
  onComplete,
  presentation: _presentation,
}: {
  attendantName?: string
  itemKind?: "service"
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const queueCommand = useOfflineCommandStore((state) => state.queueCommand)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const catalog = useQuery(
    trpc.catalog.listItems.queryOptions(itemKind ? { kind: itemKind } : {}, {
      retry: false,
    }),
  )
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, { retry: false }),
  )
  const allRows = useMemo(
    () => flatten(catalog.data ?? [], availability.data?.storeId, itemKind),
    [availability.data?.storeId, catalog.data, itemKind],
  )
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query
      ? allRows.filter((offering) =>
          `${offering.displayName} ${offering.offeringName}`
            .toLowerCase()
            .includes(query),
        )
      : allRows
  }, [allRows, search])
  const mutation = useMutation(
    trpc.orders.create.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
          ),
        ])
        onComplete?.()
      },
    }),
  )
  const submit = () => {
    const lines = allRows.flatMap((offering) => {
      const quantity = quantities[offering.id]?.trim()
      return quantity &&
        !offering.disabledReason &&
        offering.fixedPriceMinor !== null
        ? [
            {
              expectedBalanceRevision:
                offering.kind === "product_unit"
                  ? offering.balanceRevision
                  : undefined,
              expectedConfigurationVersionId:
                offering.kind === "product_unit"
                  ? offering.configurationVersionId
                  : undefined,
              expectedFixedPriceMinor: offering.fixedPriceMinor,
              offeringId: offering.id,
              quantity,
            },
          ]
        : []
    })
    if (lines.length === 0) {
      setError("Select at least one item and enter its quantity.")
      return
    }
    const payload = {
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      lines,
    }
    if (isOffline) {
      queueCommand({
        dependencyClientIds: [],
        eventVersion: 1,
        payload: { kind: "commercial_order", ...payload },
      })
      onComplete?.()
      return
    }
    mutation.mutate({
      clientOrderId: `order-${Crypto.randomUUID()}`,
      schemaVersion: 1,
      ...payload,
    })
  }
  return (
    <KeyboardAwareScrollView
      className="flex-1"
      contentContainerClassName="gap-5 px-4 pb-12"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      {isOffline ? (
        <StatusBanner
          icon="Wind"
          message="The order will be provisional until its Offering, price, configuration, and balance snapshots are accepted during sync."
          title="Offline order"
          tone="warning"
        />
      ) : null}
      {error ? (
        <StatusBanner
          icon="AlertCircle"
          message={error}
          title="Could not create order"
          tone="destructive"
        />
      ) : null}
      <FormField
        autoCapitalize="none"
        label="Search"
        leadingIcon="Search"
        onChangeText={setSearch}
        placeholder="Product or service"
        value={search}
      />
      <View className="gap-3">
        {rows.map((offering) => {
          const disabled = Boolean(offering.disabledReason)
          const selected = !disabled && quantities[offering.id] !== undefined
          return (
            <View
              className="gap-3 rounded-2xl border border-border bg-card p-4"
              key={offering.id}
            >
              <Pressable
                accessibilityHint={offering.disabledReason}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled }}
                className={
                  disabled
                    ? "min-h-11 flex-row items-center justify-between gap-3 opacity-60"
                    : "min-h-11 flex-row items-center justify-between gap-3"
                }
                disabled={disabled}
                haptic
                onPress={() =>
                  setQuantities((current) => {
                    if (selected) {
                      const next = { ...current }
                      delete next[offering.id]
                      return next
                    }
                    return { ...current, [offering.id]: "1" }
                  })
                }
              >
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-bold text-foreground">
                    {offering.displayName}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {offering.offeringName} ·{" "}
                    {offering.fixedPriceMinor === null
                      ? "Price not set"
                      : formatMinorMoney(
                          offering.fixedPriceMinor,
                          offering.currencyCode,
                        )}
                  </Text>
                  {offering.disabledReason ? (
                    <Text className="text-xs font-semibold text-destructive">
                      {offering.disabledReason}
                    </Text>
                  ) : null}
                </View>
                <Icon
                  className={
                    selected
                      ? "size-sm text-primary"
                      : "size-sm text-muted-foreground"
                  }
                  name={
                    disabled ? "Ban" : selected ? "CircleCheck" : "CheckSquare"
                  }
                />
              </Pressable>
              {selected ? (
                <FormField
                  keyboardType="decimal-pad"
                  label="Quantity"
                  onChangeText={(value) =>
                    setQuantities((current) => ({
                      ...current,
                      [offering.id]: value,
                    }))
                  }
                  value={quantities[offering.id]}
                />
              ) : null}
            </View>
          )
        })}
      </View>
      {catalog.isLoading || availability.isLoading ? (
        <StatusBanner icon="Loader2" message="Loading Offerings." />
      ) : rows.length === 0 ? (
        <StatusBanner
          icon="Info"
          message="No Catalog offerings match this search."
          title="No items"
        />
      ) : null}
      <View className="gap-3 rounded-2xl border border-border bg-muted/30 p-4">
        <FormField
          label="Customer name"
          onChangeText={setCustomerName}
          value={customerName}
        />
        <FormField
          keyboardType="phone-pad"
          label="Phone"
          onChangeText={setCustomerPhone}
          value={customerPhone}
        />
      </View>
      <ActionButton
        isLoading={mutation.isPending}
        loadingLabel="Confirming"
        onPress={submit}
      >
        {isOffline ? "Queue order" : "Confirm order"}
      </ActionButton>
    </KeyboardAwareScrollView>
  )
}
