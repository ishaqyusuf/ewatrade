"use client"

import {
  availableCatalogUnitReferences,
  resolveCatalogUnitFactors,
} from "@/lib/catalog-selling-units"
import {
  Button,
  CurrencyInput,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  SelectControl,
} from "@ewatrade/ui"
import { transposeCatalogUnitRelation } from "@ewatrade/utils"
import type { CatalogUnitRelationDirection } from "@ewatrade/utils"
import { useCatalogThemeClass } from "./catalog-appearance"
import { CatalogDetailEditor, CatalogDetailRow } from "./catalog-detail-editor"
import type { AdvancedUnitDraft } from "./catalog-form-types"

export function CatalogSellingUnitsEditor({
  active,
  canonicalName,
  currencyCode,
  onBack,
  onChange,
  onError,
  onOpen,
  units,
}: {
  active: string
  canonicalName: string
  currencyCode: string
  onBack: () => void
  onChange: (units: AdvancedUnitDraft[]) => void
  onError: (message: string | null) => void
  onOpen: (editor: string) => void
  units: AdvancedUnitDraft[]
}) {
  const themeClass = useCatalogThemeClass()
  function update(id: string, changes: Partial<AdvancedUnitDraft>) {
    onChange(
      units.map((unit) => (unit.id === id ? { ...unit, ...changes } : unit)),
    )
  }
  function factorSummary(unit: AdvancedUnitDraft) {
    try {
      return `1 ${unit.name || "unit"} = ${resolveCatalogUnitFactors(units).get(unit.id)} ${canonicalName || "main units"}`
    } catch {
      return "Complete the unit relationship to see its stock equivalent."
    }
  }
  return (
    <>
      <CatalogDetailEditor
        active={active}
        editor="units"
        title="Selling units"
        description="Sell pieces, trays or cartons. Use the main unit or an existing selling unit as the reference. Each unit has its own price."
        onBack={onBack}
      >
        <FieldGroup className="gap-2">
          {units.map((unit) => (
            <CatalogDetailRow
              key={unit.id}
              title={unit.name || "Unnamed selling unit"}
              summary={`${factorSummary(unit)} · ${unit.price ? `${currencyCode} ${unit.price}` : "Price not set"} · ${unit.stockBehavior === "packaged_stock" ? "prepared stock" : "shared stock"}`}
              onClick={() => onOpen(`unit:${unit.id}`)}
            />
          ))}
          {!units.length ? (
            <p className="text-sm text-muted-foreground">
              Example: count Eggs, sell a Tray of 30, then a Carton of 6 trays.
            </p>
          ) : null}
          <Button
            appearance="form"
            type="button"
            variant="outline"
            disabled={units.length >= 47}
            onClick={() => {
              const id = globalThis.crypto.randomUUID()
              onChange([
                ...units,
                {
                  id,
                  name: "",
                  price: "",
                  referenceId: "canonical",
                  relationCount: "",
                  relationDirection: "canonical_per_unit",
                  stockBehavior: "alternate_transaction",
                  transactionScale: 2,
                },
              ])
              onOpen(`unit:${id}`)
            }}
          >
            Add selling unit
          </Button>
        </FieldGroup>
      </CatalogDetailEditor>
      {units.map((unit) => {
        const referenceName =
          unit.referenceId === "canonical"
            ? canonicalName || "main unit"
            : units.find((candidate) => candidate.id === unit.referenceId)
                ?.name || "reference unit"
        const hasDependents = units.some(
          (candidate) => candidate.referenceId === unit.id,
        )
        return (
          <CatalogDetailEditor
            backLabel="Back to selling units"
            key={unit.id}
            active={active}
            editor={`unit:${unit.id}`}
            title={unit.name || "New selling unit"}
            description="The relationship determines stock quantity. It never calculates or copies the selling price."
            onBack={onBack}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`unit-name-${unit.id}`}>
                  Unit name
                </FieldLabel>
                <Input
                  id={`unit-name-${unit.id}`}
                  maxLength={80}
                  value={unit.name}
                  placeholder="e.g. Tray"
                  onChange={(event) =>
                    update(unit.id, { name: event.target.value })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`unit-reference-${unit.id}`}>
                  Compare with
                </FieldLabel>
                <SelectControl
                  popupClassName={themeClass}
                  id={`unit-reference-${unit.id}`}
                  value={unit.referenceId}
                  options={[
                    { value: "canonical", label: canonicalName || "Main unit" },
                    ...availableCatalogUnitReferences(units, unit.id).map(
                      (reference) => ({
                        value: reference.id,
                        label:
                          units.find(
                            (candidate) => candidate.id === reference.id,
                          )?.name || "Unnamed unit",
                      }),
                    ),
                  ]}
                  onValueChange={(referenceId) =>
                    update(unit.id, { referenceId, relationCount: "" })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`unit-direction-${unit.id}`}>
                  Relationship
                </FieldLabel>
                <SelectControl
                  popupClassName={themeClass}
                  id={`unit-direction-${unit.id}`}
                  value={unit.relationDirection}
                  options={[
                    {
                      value: "canonical_per_unit",
                      label: `1 ${unit.name || "unit"} contains ${referenceName}`,
                    },
                    {
                      value: "units_per_canonical",
                      label: `${unit.name || "Units"} inside 1 ${referenceName}`,
                    },
                  ]}
                  onValueChange={(value) => {
                    const direction = value as CatalogUnitRelationDirection
                    try {
                      const relation = unit.relationCount.trim()
                        ? transposeCatalogUnitRelation(
                            {
                              count: unit.relationCount,
                              direction: unit.relationDirection,
                            },
                            direction,
                          )
                        : { count: "", direction }
                      update(unit.id, {
                        relationCount: relation.count,
                        relationDirection: relation.direction,
                      })
                      onError(null)
                    } catch {
                      onError(
                        "This relationship cannot be transposed exactly. Keep the current direction.",
                      )
                    }
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`unit-count-${unit.id}`}>
                  {unit.relationDirection === "canonical_per_unit"
                    ? `How many ${referenceName} in 1 ${unit.name || "unit"}?`
                    : `How many ${unit.name || "units"} in 1 ${referenceName}?`}
                </FieldLabel>
                <Input
                  id={`unit-count-${unit.id}`}
                  inputMode="decimal"
                  value={unit.relationCount}
                  placeholder="e.g. 30"
                  onChange={(event) =>
                    update(unit.id, { relationCount: event.target.value })
                  }
                />
                <FieldDescription>{factorSummary(unit)}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`unit-price-${unit.id}`}>
                  Selling price (optional)
                </FieldLabel>
                <CurrencyInput
                  id={`unit-price-${unit.id}`}
                  currencyCode={currencyCode}
                  placeholder="Price not set"
                  value={unit.price}
                  onValueChange={(price) => update(unit.id, { price })}
                />
                <FieldDescription>
                  Blank stays unset. Customer choices can set separate prices
                  for this unit.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`unit-stock-${unit.id}`}>
                  Stock source
                </FieldLabel>
                <SelectControl
                  popupClassName={themeClass}
                  id={`unit-stock-${unit.id}`}
                  value={unit.stockBehavior}
                  options={[
                    {
                      value: "alternate_transaction",
                      label: "Use shared stock",
                    },
                    {
                      value: "packaged_stock",
                      label: "Prepared stock balance",
                    },
                  ]}
                  onValueChange={(value) =>
                    update(unit.id, {
                      stockBehavior:
                        value as AdvancedUnitDraft["stockBehavior"],
                    })
                  }
                />
                <FieldDescription>
                  {unit.stockBehavior === "packaged_stock"
                    ? "Keeps a separate prepared balance. Move stock into it with an explicit stock transformation; adding this unit creates no prepared stock."
                    : `Selling this unit draws from the same ${canonicalName || "main unit"} stock pool. The reference unit does not own another balance.`}
                </FieldDescription>
              </Field>
              {hasDependents ? (
                <p className="text-sm text-muted-foreground">
                  Another selling unit uses this one as its reference. Update
                  that relationship before removing this unit.
                </p>
              ) : null}
              <Button
                appearance="form"
                type="button"
                variant="ghost"
                disabled={hasDependents}
                onClick={() => {
                  onChange(
                    units.filter((candidate) => candidate.id !== unit.id),
                  )
                  onBack()
                }}
              >
                Remove this selling unit
              </Button>
            </FieldGroup>
          </CatalogDetailEditor>
        )
      })}
    </>
  )
}
