"use client"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import { Button, Field, FieldLabel, Input, SelectControl } from "@ewatrade/ui"
import {
  type CatalogUnitRelationDirection,
  catalogUnitFactorToRelation,
  catalogUnitRelationToFactor,
  transposeCatalogUnitRelation,
} from "@ewatrade/utils"
import { useState } from "react"

type Draft = Extract<
  GeneralAction,
  { action: "product_unit_configuration_draft" }
>
type Row = Omit<Draft["units"][number], "factor"> & {
  rowId: string
  count: string
  direction: CatalogUnitRelationDirection
}
/** Same exact relationship controls as Catalog's unit configuration manager. */
export function GeneralUnitEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: Draft
  disabled: boolean
  onSave: (payload: GeneralAction) => void
  onCancel: () => void
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.units.map((unit, index) => {
      const relation = catalogUnitFactorToRelation(unit.factor)
      return {
        ...unit,
        rowId: `saved-${index}`,
        count: relation.count,
        direction: relation.direction,
      }
    }),
  )
  const [precision, setPrecision] = useState(initial.canonicalBalanceScale)
  const [error, setError] = useState<string | null>(null)
  const patch = (rowId: string, change: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.rowId === rowId ? { ...row, ...change } : row)),
    )
  const main =
    rows.find((row) => row.stockBehavior === "canonical_shared")?.name ||
    "main unit"
  const changeDirection = (
    row: Row,
    direction: CatalogUnitRelationDirection,
  ) => {
    try {
      const relation = row.count.trim()
        ? transposeCatalogUnitRelation(
            { count: row.count, direction: row.direction },
            direction,
          )
        : { count: "", direction }
      patch(row.rowId, relation)
      setError(null)
    } catch {
      setError(
        "This relationship cannot be transposed exactly. Keep the current direction.",
      )
    }
  }
  const save = () => {
    if (disabled) return
    try {
      const parsed = generalActionSchema.safeParse({
        ...initial,
        canonicalBalanceScale: precision,
        units: rows.map(({ rowId: _, count, direction, ...unit }) => ({
          ...unit,
          symbol: unit.symbol?.trim() || undefined,
          factor:
            unit.stockBehavior === "canonical_shared"
              ? "1"
              : catalogUnitRelationToFactor({ count, direction }),
        })),
      })
      if (!parsed.success) {
        setError(
          parsed.error.issues[0]?.message ?? "Check the unit relationships.",
        )
        return
      }
      setError(null)
      onSave(parsed.data)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the unit relationships.",
      )
    }
  }
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <p className="text-sm text-muted-foreground">
        Save the proposed unit draft, then review it. Publishing requires a
        separate confirmation. Existing stock is never converted automatically.
      </p>
      <Field>
        <FieldLabel htmlFor="assistant-unit-precision">
          Main-unit stock precision
        </FieldLabel>
        <Input
          id="assistant-unit-precision"
          type="number"
          min={0}
          max={18}
          disabled={disabled}
          value={precision}
          onChange={(event) => setPrecision(Number(event.target.value))}
        />
      </Field>
      {rows.map((row, index) => (
        <fieldset
          key={row.rowId}
          disabled={disabled}
          className="grid min-w-0 gap-3 border border-border p-3"
        >
          <legend className="px-1 text-sm font-medium">Unit {index + 1}</legend>
          <Field>
            <FieldLabel htmlFor={`${row.rowId}-name`}>Name</FieldLabel>
            <Input
              id={`${row.rowId}-name`}
              value={row.name}
              onChange={(event) =>
                patch(row.rowId, { name: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${row.rowId}-key`}>
              Stable unit key
            </FieldLabel>
            <Input
              id={`${row.rowId}-key`}
              value={row.key}
              onChange={(event) =>
                patch(row.rowId, { key: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${row.rowId}-behavior`}>
              Stock behavior
            </FieldLabel>
            <SelectControl
              id={`${row.rowId}-behavior`}
              disabled={disabled}
              value={row.stockBehavior}
              options={[
                { value: "canonical_shared", label: "Main unit" },
                {
                  value: "alternate_transaction",
                  label: "Shared selling unit",
                },
                {
                  value: "packaged_stock",
                  label: "Independent Packaged Stock",
                },
              ]}
              onValueChange={(value) => {
                if (
                  value === "canonical_shared" ||
                  value === "alternate_transaction" ||
                  value === "packaged_stock"
                )
                  patch(row.rowId, { stockBehavior: value })
              }}
            />
          </Field>
          {row.stockBehavior === "canonical_shared" ? (
            <p className="text-sm text-muted-foreground">
              1 {row.name || "unit"} is the Main unit.
            </p>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor={`${row.rowId}-direction`}>
                  Relationship
                </FieldLabel>
                <SelectControl
                  id={`${row.rowId}-direction`}
                  disabled={disabled}
                  value={row.direction}
                  options={[
                    {
                      value: "units_per_canonical",
                      label: `${row.name || "This unit"} inside 1 ${main}`,
                    },
                    {
                      value: "canonical_per_unit",
                      label: `1 ${row.name || "unit"} contains ${main}`,
                    },
                  ]}
                  onValueChange={(value) => {
                    if (
                      value === "units_per_canonical" ||
                      value === "canonical_per_unit"
                    )
                      changeDirection(row, value)
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${row.rowId}-count`}>
                  {row.direction === "units_per_canonical"
                    ? `How many ${row.name || "units"} are in 1 ${main}?`
                    : `How many ${main} are in 1 ${row.name || "unit"}?`}
                </FieldLabel>
                <Input
                  id={`${row.rowId}-count`}
                  inputMode="decimal"
                  value={row.count}
                  onChange={(event) =>
                    patch(row.rowId, { count: event.target.value })
                  }
                />
              </Field>
            </>
          )}
          <Field>
            <FieldLabel htmlFor={`${row.rowId}-scale`}>
              Transaction precision
            </FieldLabel>
            <Input
              id={`${row.rowId}-scale`}
              type="number"
              min={0}
              max={6}
              value={row.transactionScale}
              onChange={(event) =>
                patch(row.rowId, {
                  transactionScale: Number(event.target.value),
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${row.rowId}-symbol`}>
              Symbol (optional)
            </FieldLabel>
            <Input
              id={`${row.rowId}-symbol`}
              value={row.symbol ?? ""}
              onChange={(event) =>
                patch(row.rowId, { symbol: event.target.value })
              }
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || rows.length === 1}
            onClick={() =>
              setRows((current) =>
                current.filter((unit) => unit.rowId !== row.rowId),
              )
            }
          >
            Remove unit {index + 1}
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled || rows.length >= 48}
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              rowId: crypto.randomUUID(),
              key: "",
              name: "",
              count: "1",
              direction: "units_per_canonical",
              stockBehavior: "alternate_transaction",
              transactionScale: 0,
            },
          ])
        }
      >
        Add unit
      </Button>
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
