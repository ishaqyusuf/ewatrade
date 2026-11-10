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
  return { choices, query: items, balances }
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
