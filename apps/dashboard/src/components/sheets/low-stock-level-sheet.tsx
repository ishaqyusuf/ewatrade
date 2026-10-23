"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import type { InventoryBalance } from "@/components/tables/inventory/columns"
import {
  normalizeQuantityInput,
  plainQuantityError,
} from "@/lib/inventory-quantity"
import { formatStockQuantity, pluralizeUnitName } from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import { Button, ControlField, Input, Sheet } from "@ewatrade/ui"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { SheetFrame } from "./sheet-frame"

/** A Product's Running low level: one setting, saved explicitly. */
export function LowStockLevelSheet({
  record,
  onClose,
}: { record: InventoryBalance | null; onClose: () => void }) {
  return (
    <Sheet
      open={Boolean(record)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {record ? (
        <LevelForm
          key={record.balanceSourceId}
          record={record}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  )
}

function LevelForm({
  record,
  onClose,
}: { record: InventoryBalance; onClose: () => void }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [level, setLevel] = useState(record.lowStockLevel ?? "")
  const [error, setError] = useState<string | null>(null)
  const unit = record.inventoryUnitName
  const unitWord = pluralizeUnitName(unit).toLowerCase()
  const save = useMutation(
    trpc.inventory.setLowStockLevel.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.inventory.balanceReport.queryKey(),
        })
        onClose()
      },
      onError: (failure) => setError(failure.message),
    }),
  )
  function submit(remove = false) {
    setError(null)
    if (remove) {
      save.mutate({ productId: record.productId, lowStockLevel: null })
      return
    }
    const typed = normalizeQuantityInput(level)
    if (!typed) {
      setError(`Enter a number of ${unitWord}, or choose Remove level.`)
      return
    }
    try {
      const value = parseExactDecimal(typed, {
        allowZero: true,
        maxScale: record.inventoryUnitTransactionScale,
      })
      save.mutate({ productId: record.productId, lowStockLevel: value })
    } catch (failure) {
      setError(
        plainQuantityError(
          failure instanceof Error ? failure.message : "",
          pluralizeUnitName(unit),
        ),
      )
    }
  }
  const packed = record.kind === "PACKAGED_STOCK"
  return (
    <SheetFrame
      title="Low-stock level"
      description={record.productName}
      closeDisabled={save.isPending}
      footer={
        <>
          {record.lowStockLevel != null ? (
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => submit(true)}
            >
              Remove level
            </Button>
          ) : null}
          <Button disabled={save.isPending} onClick={() => submit()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 text-sm">
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
        <p className="text-muted-foreground">
          {record.productName} shows as Running low when stock free to sell is
          at or below this number. It never stops a sale.
        </p>
        <ControlField
          label="Running low at"
          description={
            packed
              ? `In ${unitWord}. Packs kept separately are not checked against this level.`
              : `In ${unitWord}, for every variant of this Product. Free to sell now: ${formatStockQuantity(record.availableQuantity, unit)}.`
          }
        >
          <div className="flex items-center gap-2">
            <Input
              inputMode="decimal"
              value={level}
              maxLength={40}
              className="max-w-40"
              placeholder="e.g. 360"
              onChange={(event) => setLevel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit()
              }}
            />
            <span className="text-muted-foreground">{unitWord}</span>
          </div>
        </ControlField>
      </div>
    </SheetFrame>
  )
}
