"use client"

import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"

export type ShipmentDetail = RouterOutputs["finance"]["shipments"]["detail"]
export type ShipmentLine = ShipmentDetail["lines"][number]

export type StockChoice = {
  balanceSourceId: string
  inventoryUnitId: string
  label: string
  offering: { id: string; revision: number; priceMinor: number } | null
}

export const money = (minor: string | number, currencyCode: string) =>
  formatFinanceMoney(String(minor), currencyCode)

export const OPEN_SHIPMENT = ["EXPECTED", "PARTIALLY_RECEIVED"] as const

export function lineName(line: ShipmentLine) {
  if (!line.stockItem) return line.proposedName ?? line.description
  const { name, variantName } = line.stockItem
  return variantName && variantName !== name ? `${name} · ${variantName}` : name
}

/** Store stock items a shipment line can map to, with each one's fixed selling price. */
export function useStoreStockChoices(storeId: string) {
  const trpc = useTRPC()
  const items = useQuery(
    trpc.catalog.listItems.queryOptions({ kind: "product", status: "active" }),
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

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong."
}
