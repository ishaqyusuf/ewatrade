"use client"

import type { SetupProductPayload } from "@ewatrade/assistant/setup/contracts"
import {
  setupProductVariants,
  setupSelectionsEqual,
} from "@ewatrade/assistant/setup/variants"
import { Input, MoneyInput } from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { useId } from "react"

export function setupVariantEditorRows(payload: SetupProductPayload) {
  return setupProductVariants(payload).map((row) => ({
    ...row,
    price: minorToMajorInput(row.priceMinor),
    stock: row.openingStock ?? "",
    unitPrices: [
      ...row.sellingUnits.map((unit) => ({
        unitName: unit.name,
        price: minorToMajorInput(unit.priceMinor),
      })),
      ...row.pendingUnitPrices.map((unit) => ({
        unitName: unit.unitName,
        price: minorToMajorInput(unit.priceMinor),
      })),
    ],
  }))
}

type Rows = ReturnType<typeof setupVariantEditorRows>

export function setupEditedVariants(
  payload: SetupProductPayload,
  rows: Rows,
): SetupProductPayload["variants"] {
  return rows.map((row) => {
    const previous = payload.variants?.find((variant) =>
      setupSelectionsEqual(variant.selections, row.selections),
    )
    const stockChanged = row.stock !== (row.openingStock ?? "")
    return {
      ...previous,
      selections: row.selections,
      priceMinor: majorToMinor(row.price) ?? undefined,
      sellingUnitPrices: row.unitPrices.flatMap((unit) => {
        const priceMinor = majorToMinor(unit.price)
        return priceMinor === null
          ? []
          : [{ unitName: unit.unitName, priceMinor }]
      }),
      ...(stockChanged
        ? {
            openingStock: row.stock.trim() || undefined,
            stockByUnit: undefined,
          }
        : {}),
    }
  })
}

export function SetupVariantFields({
  rows,
  unitName,
  currencyCode,
  internalUse,
  onChange,
}: {
  rows: Rows
  unitName: string
  currencyCode: string
  internalUse: boolean
  onChange: (rows: Rows) => void
}) {
  const id = useId()
  const update = (index: number, patch: Partial<Rows[number]>) =>
    onChange(
      rows.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    )
  return (
    <div className="grid gap-3 sm:col-span-2">
      {rows.map((row, index) => (
        <fieldset
          key={JSON.stringify(row.selections)}
          className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
        >
          <legend className="px-1 text-sm font-medium">{row.label}</legend>
          {!internalUse ? (
            <>
              <label
                htmlFor={`${id}-${index}-price`}
                className="grid gap-1 text-xs text-muted-foreground"
              >
                Price per {unitName.toLowerCase()}
                <MoneyInput
                  id={`${id}-${index}-price`}
                  currencyCode={currencyCode}
                  inputMode="decimal"
                  value={row.price}
                  onChange={(event) =>
                    update(index, { price: event.target.value })
                  }
                />
              </label>
              {row.unitPrices.map((unit, position) => (
                <label
                  key={unit.unitName}
                  htmlFor={`${id}-${index}-${position}-price`}
                  className="grid gap-1 text-xs text-muted-foreground"
                >
                  Price per {unit.unitName.toLowerCase()}
                  <MoneyInput
                    id={`${id}-${index}-${position}-price`}
                    currencyCode={currencyCode}
                    inputMode="decimal"
                    value={unit.price}
                    onChange={(event) =>
                      update(index, {
                        unitPrices: row.unitPrices.map((entry, at) =>
                          at === position
                            ? { ...entry, price: event.target.value }
                            : entry,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </>
          ) : null}
          <label
            htmlFor={`${id}-${index}-stock`}
            className="grid gap-1 text-xs text-muted-foreground"
          >
            In stock now ({unitName.toLowerCase()})
            <Input
              id={`${id}-${index}-stock`}
              inputMode="decimal"
              value={row.stock}
              onChange={(event) => update(index, { stock: event.target.value })}
            />
          </label>
        </fieldset>
      ))}
    </div>
  )
}
