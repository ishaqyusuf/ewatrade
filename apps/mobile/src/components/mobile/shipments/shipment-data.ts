import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  type ShipmentStatus,
  shipmentRoundedMinor,
  shipmentUnstockedChoices,
} from "@ewatrade/utils/shipments"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import type { StatusPillTone } from "../green-till/kit"

export type ShipmentDetail = RouterOutputs["finance"]["shipments"]["detail"]
export type ShipmentLine = ShipmentDetail["lines"][number]
export type StockChoice = {
  balanceSourceId: string
  inventoryUnitId: string
  label: string
  offering: { id: string; revision: number; priceMinor: number } | null
}

export const SHIPMENT_PILL_TONE: Record<ShipmentStatus, StatusPillTone> = {
  DRAFT: "muted",
  EXPECTED: "info",
  PARTIALLY_RECEIVED: "warn",
  RECEIVED: "ok",
  CLOSED_SHORT: "muted",
  CANCELLED: "muted",
}

/** Formats minor units; T1's per-unit costs carry six decimal places. */
export const money = (minor: string | number, currencyCode: string) =>
  formatFinanceMoney(shipmentRoundedMinor(minor), currencyCode)

export const isOpenShipment = (status: ShipmentStatus) =>
  status === "EXPECTED" || status === "PARTIALLY_RECEIVED"

export function lineName(line: ShipmentLine) {
  if (!line.stockItem) return line.proposedName ?? line.description
  const { name, variantName } = line.stockItem
  return variantName && variantName !== name ? `${name} · ${variantName}` : name
}

/** The Store the app is working in, read fresh on mount. */
export function useCurrentStoreId() {
  const trpc = useTRPC()
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      refetchOnMount: "always",
      retry: false,
    }),
  )
  return availability.isFetchedAfterMount
    ? availability.data?.storeId
    : undefined
}

/** Store stock items a line can map to, with each one's fixed selling price. */
export function useStoreStockChoices(storeId: string | undefined) {
  const trpc = useTRPC()
  const items = useQuery(
    trpc.catalog.listItems.queryOptions(
      { kind: "product", status: "active" },
      { enabled: Boolean(storeId), retry: false },
    ),
  )
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { storeId: storeId ?? "" },
      { enabled: Boolean(storeId), retry: false },
    ),
  )
  // Only the Store's own balances; T1 refuses staff-custody or transit stock.
  const choices = useMemo(() => {
    const offerings = new Map<string, StockChoice["offering"]>()
    for (const item of items.data ?? [])
      for (const variant of item.variants)
        for (const o of variant.offerings)
          if (o.productUnit && o.fixedPriceMinor !== null)
            offerings.set(`${variant.id}:${o.productUnit.inventoryUnitId}`, {
              id: o.id,
              revision: o.revision,
              priceMinor: o.fixedPriceMinor,
            })
    return (balances.data?.rows ?? [])
      .filter((row) => row.custodyType === "STORE")
      .map((row) => ({
        balanceSourceId: row.balanceSourceId,
        inventoryUnitId: row.inventoryUnitId,
        label: `${row.productName}${row.variantName && row.variantName !== row.productName ? ` · ${row.variantName}` : ""} · ${row.inventoryUnitName}`,
        offering:
          offerings.get(`${row.variantId}:${row.inventoryUnitId}`) ?? null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [items.data, balances.data])
  // Catalog products with no stock in this Store yet, such as one just added
  // for a shipment line; choosing one creates its zero Store balance first.
  const unstocked = useMemo(
    () => shipmentUnstockedChoices(items.data ?? [], balances.data?.rows ?? []),
    [items.data, balances.data],
  )
  return { choices, unstocked, query: items, balances }
}

/** The Store balance a line maps to, creating the zero balance for a new product. */
export function useStoreBalanceFor(storeId: string | undefined) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return async (offeringId: string) => {
    const availability = await queryClient.fetchQuery(
      trpc.inventory.offeringAvailability.queryOptions(
        { offeringId, ...(storeId ? { storeId } : {}) },
        { staleTime: 0 },
      ),
    )
    return {
      balanceSourceId: availability.balanceSourceId,
      inventoryUnitId: availability.balanceUnitId,
    }
  }
}

export function useRefreshShipments() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.finance.shipments.pathKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.balanceReport.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.catalog.listItems.queryKey(),
      }),
    ])
}

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong."
