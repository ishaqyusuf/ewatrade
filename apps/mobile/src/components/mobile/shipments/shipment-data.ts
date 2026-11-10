import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ShipmentStatus } from "@ewatrade/utils/shipments"
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

export const money = (minor: string | number, currencyCode: string) =>
  formatFinanceMoney(String(minor), currencyCode)

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
  const choices = useMemo(() => {
    const result: StockChoice[] = []
    for (const item of items.data ?? []) {
      for (const balance of item.product?.stockBalances ?? []) {
        if (balance.storeId !== storeId) continue
        const variant = item.variants.find((v) => v.id === balance.variantId)
        const offering = variant?.offerings.find(
          (o) =>
            o.productUnit?.inventoryUnitId === balance.inventoryUnitId &&
            o.fixedPriceMinor !== null,
        )
        const variantText =
          balance.variantName && balance.variantName !== item.name
            ? ` · ${balance.variantName}`
            : ""
        result.push({
          balanceSourceId: balance.id,
          inventoryUnitId: balance.inventoryUnitId,
          label: `${item.name}${variantText} · ${balance.inventoryUnitName}`,
          offering:
            offering && offering.fixedPriceMinor !== null
              ? {
                  id: offering.id,
                  revision: offering.revision,
                  priceMinor: offering.fixedPriceMinor,
                }
              : null,
        })
      }
    }
    return result.sort((a, b) => a.label.localeCompare(b.label))
  }, [items.data, storeId])
  return { choices, query: items }
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
