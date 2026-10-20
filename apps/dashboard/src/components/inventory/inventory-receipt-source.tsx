"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { missingInventoryReceiptOptions } from "@/lib/inventory-receipt-options"
import {
  formatStockQuantity,
  getInventoryStatus,
  inventoryStatusLabels,
} from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"

type StockOption = { value: string; label: string; disabled?: boolean }

type BalanceRows = RouterOutputs["inventory"]["balanceReport"]["rows"]

/** "Fresh eggs · Large — 1,230 eggs in stock", plus where it is when not on the shelf. */
function stockOptionLabel(row: BalanceRows[number]) {
  const status = getInventoryStatus(row)
  return [
    row.productName,
    row.variantName && row.variantName !== row.productName
      ? ` · ${row.variantName}`
      : "",
    row.kind === "PACKAGED_STOCK" ? ` · Packed: ${row.inventoryUnitName}` : "",
    ` — ${formatStockQuantity(row.onHandQuantity, row.inventoryUnitName)} in stock`,
    status === "transit" || status === "staff"
      ? ` · ${inventoryStatusLabels[status].toLowerCase()}`
      : "",
  ].join("")
}

export function InventoryReceiptSource({
  storeId,
  productId,
  rows,
  sourceId,
  onSourceChange,
  disabled,
  allowFirstReceipt = true,
  onPreparingChange,
}: {
  storeId: string
  productId: string | null
  rows: BalanceRows
  sourceId: string
  onSourceChange(id: string): void
  disabled: boolean
  allowFirstReceipt?: boolean
  onPreparingChange?: (preparing: boolean) => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const enableOffering = useMutation(
    trpc.catalog.setOfferingAvailability.mutationOptions(),
  )
  const catalog = useQuery(
    trpc.catalog.listItems.queryOptions({ kind: "product" }, { retry: false }),
  )
  const [preparing, setPreparing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const missing = useMemo(
    () =>
      missingInventoryReceiptOptions(
        catalog.data ?? [],
        rows,
        storeId,
        productId,
      ),
    [catalog.data, rows, storeId, productId],
  )

  async function choose(value: string) {
    setError(null)
    const option = missing.find((candidate) => candidate.value === value)
    if (!option) {
      onSourceChange(value)
      return
    }
    if (!allowFirstReceipt) return
    onSourceChange("")
    setPreparing(value)
    onPreparingChange?.(true)
    try {
      if (option.needsAvailability) {
        await enableOffering.mutateAsync({
          storeId,
          offeringId: option.offeringId,
          isAvailable: true,
        })
        await queryClient.invalidateQueries({
          queryKey: trpc.catalog.listItems.queryKey(),
        })
      }
      const availability = await queryClient.fetchQuery(
        trpc.inventory.offeringAvailability.queryOptions(
          { offeringId: option.offeringId, storeId },
          { staleTime: 0, retry: false },
        ),
      )
      await queryClient.invalidateQueries({
        queryKey: trpc.inventory.balanceReport.queryKey(),
      })
      onSourceChange(availability.balanceSourceId)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "This product couldn’t be selected. Try again.",
      )
    } finally {
      setPreparing(null)
      onPreparingChange?.(false)
    }
  }

  const options = useMemo<StockOption[]>(
    () => [
      ...rows.map((row) => ({
        value: row.balanceSourceId,
        label: stockOptionLabel(row),
      })),
      ...missing.map((option) => ({
        ...option,
        disabled: !allowFirstReceipt,
        label: allowFirstReceipt
          ? option.label
          : option.label.replace(
              "none in stock yet",
              "none in stock yet; use Stock in first",
            ),
      })),
      ...(catalog.data ?? []).flatMap((item) => {
        if (!item.product) return []
        return item.variants
          .filter(
            (variant) =>
              !rows.some(
                (row) =>
                  row.productId === item.product?.id &&
                  row.variantId === variant.id,
              ) &&
              !missing.some((option) =>
                variant.offerings.some(
                  (offering) => offering.id === option.offeringId,
                ),
              ),
          )
          .map((variant) => ({
            value: `unavailable:${variant.id}`,
            label: `${item.name}${variant.name && variant.name !== item.name ? ` · ${variant.name}` : ""} — ${item.status !== "active" || variant.status !== "active" ? "not active" : "none in stock yet; use Stock in first"}`,
            disabled: true,
          }))
      }),
    ],
    [rows, missing, catalog.data, allowFirstReceipt],
  )

  return (
    <>
      <Combobox<StockOption>
        items={options}
        value={
          options.find((option) => option.value === (preparing ?? sourceId)) ??
          null
        }
        itemToStringLabel={(option) => option.label}
        isItemEqualToValue={(option, value) => option.value === value.value}
        autoHighlight
        disabled={disabled || Boolean(preparing) || catalog.isPending}
        onValueChange={(option) => {
          if (disabled || preparing || option?.disabled) return
          if (option) void choose(option.value)
          else onSourceChange("")
        }}
      >
        <ComboboxInput
          aria-label="Product"
          placeholder="Search products"
          className="w-full"
          showClear
        />
        <ComboboxContent>
          <ComboboxEmpty>No product matches. Try another name.</ComboboxEmpty>
          <ComboboxList>
            {(option: StockOption) => (
              <ComboboxItem
                key={option.value}
                value={option}
                disabled={option.disabled}
              >
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {preparing ? (
        <output aria-live="polite">Getting this product ready…</output>
      ) : null}
      {error || catalog.error ? (
        <FormFeedback appearance="dashboard">
          {error ?? catalog.error?.message}
        </FormFeedback>
      ) : null}
    </>
  )
}
