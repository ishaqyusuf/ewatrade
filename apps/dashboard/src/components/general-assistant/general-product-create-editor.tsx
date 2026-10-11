"use client"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  MoneyInput,
} from "@ewatrade/ui"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils"
import { useState } from "react"
type Action = Extract<GeneralAction, { action: "product_create" }>

/** Packs and options: one price per unit and a stock count for each option. */
export function GeneralProductCreateEditor({
  initial,
  currencyCode,
  disabled,
  onSave,
  onCancel,
}: {
  initial: Action
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const unit = initial.canonicalUnitName
  const packs = initial.sellingUnits ?? []
  const variants = initial.variants ?? []
  const [name, setName] = useState(initial.name)
  const [rows, setRows] = useState(
    variants.map((variant) => ({
      prices: [
        minorToMajorInput(variant.priceMinor),
        ...packs.map((pack) =>
          minorToMajorInput(
            variant.sellingUnitPrices?.find(
              (price) => price.unitName === pack.name,
            )?.priceMinor,
          ),
        ),
      ],
      stock: variant.openingStock ?? "",
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const units = [unit, ...packs.map((pack) => pack.name)]
  const label = (index: number) =>
    variants[index]?.selections.map((entry) => entry.value).join(" / ") ||
    initial.name
  const setRow = (index: number, next: Partial<(typeof rows)[number]>) =>
    setRows((current) =>
      current.map((row, at) => (at === index ? { ...row, ...next } : row)),
    )
  function save() {
    if (disabled) return
    try {
      const next = rows.map((row, index) => {
        const minor = row.prices.map((price, at) => {
          const value = majorToMinor(price)
          if (value === null)
            throw Error(`Enter a price for ${label(index)} per ${units[at]}.`)
          return value
        })
        return {
          selections: variants[index]?.selections ?? [],
          priceMinor: minor[0],
          sellingUnitPrices: packs.flatMap((pack, at) => {
            const priceMinor = minor[at + 1]
            return priceMinor === undefined
              ? []
              : [{ unitName: pack.name, priceMinor }]
          }),
          openingStock: row.stock.trim() || undefined,
        }
      })
      const parsed = generalActionSchema.safeParse({
        ...initial,
        name,
        variants: next,
      })
      if (!parsed.success)
        throw Error(
          parsed.error.issues[0]?.message ?? "Check the product fields.",
        )
      setError(null)
      onSave(parsed.data)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Check the product fields.",
      )
    }
  }
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="product-create-name">Name</FieldLabel>
          <Input
            id="product-create-name"
            value={name}
            maxLength={160}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {rows.map((row, index) => (
          <fieldset
            // biome-ignore lint/suspicious/noArrayIndexKey: rows follow the saved option order
            key={index}
            className="grid gap-3 rounded-lg border px-3 py-3"
          >
            <legend className="px-1 text-sm font-medium">{label(index)}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {units.map((unitName, at) => (
                <Field key={unitName}>
                  <FieldLabel htmlFor={`product-create-${index}-${at}`}>
                    Price per {unitName}
                  </FieldLabel>
                  <MoneyInput
                    id={`product-create-${index}-${at}`}
                    currencyCode={currencyCode}
                    value={row.prices[at] ?? ""}
                    disabled={disabled}
                    onChange={(event) =>
                      setRow(index, {
                        prices: row.prices.map((price, other) =>
                          other === at ? event.target.value : price,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
              <Field>
                <FieldLabel htmlFor={`product-create-${index}-stock`}>
                  Opening stock ({unit})
                </FieldLabel>
                <Input
                  id={`product-create-${index}-stock`}
                  inputMode="decimal"
                  value={row.stock}
                  placeholder="None"
                  disabled={disabled}
                  onChange={(event) =>
                    setRow(index, { stock: event.target.value })
                  }
                />
              </Field>
            </div>
          </fieldset>
        ))}
      </FieldGroup>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={disabled}>
          Save draft
        </Button>
      </div>
    </form>
  )
}
