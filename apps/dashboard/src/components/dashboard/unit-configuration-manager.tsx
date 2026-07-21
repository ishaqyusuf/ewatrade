"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  type CatalogUnitRelationDirection,
  catalogUnitFactorToRelation,
  catalogUnitRelationToFactor,
  transposeCatalogUnitRelation,
} from "@ewatrade/utils"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"

type EditableUnit = {
  key: string
  name: string
  relationCount: string
  relationDirection: CatalogUnitRelationDirection
  stockBehavior: "alternate_transaction" | "canonical_shared" | "packaged_stock"
  symbol: string
  transactionScale: number
  unitDefinitionId?: string
}

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

function blankUnit(index: number): EditableUnit {
  return {
    key: `unit-${index + 1}`,
    name: "",
    relationCount: "1",
    relationDirection: "units_per_canonical",
    stockBehavior: "alternate_transaction",
    symbol: "",
    transactionScale: 0,
  }
}

export function UnitConfigurationManager({
  productId,
  productName,
  onClose,
}: {
  productId: string
  productName: string
  onClose: () => void
}) {
  const trpc = useTRPC()
  const configurations = useQuery(
    trpc.catalog.listUnitConfigurations.queryOptions(
      { productId },
      { retry: false },
    ),
  )
  const [units, setUnits] = useState<EditableUnit[]>([])
  const [canonicalBalanceScale, setCanonicalBalanceScale] = useState(0)
  const [stockTransitionOperationId, setStockTransitionOperationId] =
    useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const draft = useMemo(
    () => configurations.data?.find((row) => row.status === "draft") ?? null,
    [configurations.data],
  )
  const current = useMemo(
    () => configurations.data?.find((row) => row.status === "current") ?? null,
    [configurations.data],
  )

  useEffect(() => {
    const editable = draft ?? current
    if (!editable) return
    setCanonicalBalanceScale(editable.canonicalBalanceScale)
    setUnits(
      editable.units.map((unit) => {
        const relation = catalogUnitFactorToRelation(unit.factor)

        return {
          key: unit.key,
          name: unit.name,
          relationCount: relation.count,
          relationDirection: relation.direction,
          stockBehavior: unit.stockBehavior,
          symbol: unit.symbol ?? "",
          transactionScale: unit.transactionScale,
          unitDefinitionId: unit.unitDefinitionId ?? undefined,
        }
      }),
    )
  }, [current, draft])

  const createDraft = useMutation(
    trpc.catalog.createUnitConfigurationDraft.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: () => {
        setError(null)
        setNotice("Draft created from the Current configuration.")
        void configurations.refetch()
      },
    }),
  )
  const updateDraft = useMutation(
    trpc.catalog.updateUnitConfigurationDraft.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: () => {
        setError(null)
        setNotice(
          "Draft saved. Existing transactions still use their snapshots.",
        )
        void configurations.refetch()
      },
    }),
  )
  const publishDraft = useMutation(
    trpc.catalog.publishUnitConfiguration.mutationOptions({
      onError: (failure) => setError(failure.message),
      onSuccess: () => {
        setError(null)
        setNotice("Draft published as the Current unit configuration.")
        setStockTransitionOperationId("")
        void configurations.refetch()
      },
    }),
  )

  const patchUnit = (index: number, patch: Partial<EditableUnit>) =>
    setUnits((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    )

  const mainUnitName =
    units.find((unit) => unit.stockBehavior === "canonical_shared")?.name ||
    "main unit"

  const changeRelationDirection = (
    index: number,
    nextDirection: CatalogUnitRelationDirection,
  ) => {
    const unit = units[index]
    if (!unit || unit.stockBehavior === "canonical_shared") return
    if (!unit.relationCount.trim()) {
      patchUnit(index, { relationDirection: nextDirection })
      return
    }

    try {
      const relation = transposeCatalogUnitRelation(
        {
          count: unit.relationCount,
          direction: unit.relationDirection,
        },
        nextDirection,
      )
      patchUnit(index, {
        relationCount: relation.count,
        relationDirection: relation.direction,
      })
      setError(null)
    } catch {
      setError(
        "This relationship cannot be transposed exactly. Keep the current direction.",
      )
    }
  }

  const saveDraft = () => {
    if (!draft) return

    try {
      updateDraft.mutate({
        canonicalBalanceScale,
        configurationId: draft.id,
        units: units.map((unit) => ({
          factor:
            unit.stockBehavior === "canonical_shared"
              ? "1"
              : catalogUnitRelationToFactor({
                  count: unit.relationCount,
                  direction: unit.relationDirection,
                }),
          key: unit.key,
          name: unit.name,
          stockBehavior: unit.stockBehavior,
          symbol: unit.symbol || undefined,
          transactionScale: unit.transactionScale,
          unitDefinitionId: unit.unitDefinitionId,
        })),
      })
    } catch (relationError) {
      setError(
        relationError instanceof Error
          ? relationError.message
          : "Review the unit relationships.",
      )
    }
  }

  return (
    <section className="grid gap-5 rounded-xl border border-border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{productName}</p>
          <h2 className="text-lg font-semibold">Unit configuration versions</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            One Main unit anchors stock. Shared selling units affect its
            balance; Packaged Stock keeps an independent balance.
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(configurations.data ?? []).map((row) => (
          <span
            className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize"
            key={row.id}
          >
            Version {row.version} · {row.status}
          </span>
        ))}
      </div>

      {!draft ? (
        <Button
          className="w-fit"
          disabled={createDraft.isPending || !current}
          onClick={() => createDraft.mutate({ productId })}
        >
          Create editable Draft
        </Button>
      ) : (
        <>
          <label className="grid max-w-xs gap-1.5 text-sm">
            <span className="font-medium">Main-unit stock precision</span>
            <input
              className={fieldClass}
              max={18}
              min={0}
              type="number"
              value={canonicalBalanceScale}
              onChange={(event) =>
                setCanonicalBalanceScale(Number(event.target.value))
              }
            />
          </label>

          <div className="grid gap-3">
            {units.map((unit, index) => (
              <div
                className="grid gap-2 rounded-lg border border-border p-3 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_1.2fr_0.8fr_1.3fr_auto]"
                key={`${unit.key}:${index}`}
              >
                <input
                  aria-label={`Unit ${index + 1} name`}
                  className={fieldClass}
                  placeholder="Unit name"
                  value={unit.name}
                  onChange={(event) =>
                    patchUnit(index, { name: event.target.value })
                  }
                />
                <input
                  aria-label={`Unit ${index + 1} key`}
                  className={fieldClass}
                  placeholder="Stable key"
                  value={unit.key}
                  onChange={(event) =>
                    patchUnit(index, {
                      key: event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-"),
                    })
                  }
                />
                {unit.stockBehavior === "canonical_shared" ? (
                  <div className="flex h-10 items-center rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground">
                    Main unit
                  </div>
                ) : (
                  <select
                    aria-label={`Unit ${index + 1} relationship direction`}
                    className={fieldClass}
                    value={unit.relationDirection}
                    onChange={(event) =>
                      changeRelationDirection(
                        index,
                        event.target.value as CatalogUnitRelationDirection,
                      )
                    }
                  >
                    <option value="units_per_canonical">
                      {unit.name || "This unit"} inside 1 {mainUnitName}
                    </option>
                    <option value="canonical_per_unit">
                      1 {unit.name || "unit"} contains {mainUnitName}
                    </option>
                  </select>
                )}
                <input
                  aria-label={
                    unit.stockBehavior === "canonical_shared"
                      ? `Unit ${index + 1} main-unit count`
                      : unit.relationDirection === "units_per_canonical"
                        ? `How many ${unit.name || "of this unit"} are in 1 ${mainUnitName}?`
                        : `How many ${mainUnitName} are in 1 ${unit.name || "of this unit"}?`
                  }
                  className={fieldClass}
                  disabled={unit.stockBehavior === "canonical_shared"}
                  inputMode="decimal"
                  placeholder="Count"
                  value={
                    unit.stockBehavior === "canonical_shared"
                      ? "1"
                      : unit.relationCount
                  }
                  onChange={(event) =>
                    patchUnit(index, { relationCount: event.target.value })
                  }
                />
                <input
                  aria-label={`Unit ${index + 1} precision`}
                  className={fieldClass}
                  max={6}
                  min={0}
                  type="number"
                  value={unit.transactionScale}
                  onChange={(event) =>
                    patchUnit(index, {
                      transactionScale: Number(event.target.value),
                    })
                  }
                />
                <select
                  aria-label={`Unit ${index + 1} stock behavior`}
                  className={fieldClass}
                  value={unit.stockBehavior}
                  onChange={(event) =>
                    patchUnit(index, {
                      stockBehavior: event.target
                        .value as EditableUnit["stockBehavior"],
                    })
                  }
                >
                  <option value="canonical_shared">Main unit</option>
                  <option value="alternate_transaction">
                    Shared selling unit
                  </option>
                  <option value="packaged_stock">
                    Independent Packaged Stock
                  </option>
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={units.length === 1}
                  onClick={() =>
                    setUnits((rows) =>
                      rows.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                >
                  Remove
                </Button>
                <p className="text-xs text-muted-foreground lg:col-span-2 xl:col-span-7">
                  {unit.stockBehavior === "canonical_shared"
                    ? `1 ${unit.name || "unit"} is the Main unit.`
                    : unit.relationDirection === "units_per_canonical"
                      ? `How many ${unit.name || "of this unit"} are in 1 ${mainUnitName}?`
                      : `How many ${mainUnitName} are in 1 ${unit.name || "of this unit"}?`}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setUnits((rows) => [...rows, blankUnit(rows.length)])
              }
            >
              Add unit
            </Button>
            <Button
              disabled={
                updateDraft.isPending ||
                units.some(
                  (unit) =>
                    !unit.name ||
                    !unit.key ||
                    (unit.stockBehavior !== "canonical_shared" &&
                      !unit.relationCount),
                )
              }
              onClick={saveDraft}
            >
              Save Draft
            </Button>
          </div>

          <div className="grid gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              If balances exist and unit meaning changed, publishing requires
              the ID of an explicit Stock Transition operation. The server
              rejects semantic changes without it.
            </p>
            <input
              className={`${fieldClass} max-w-xl`}
              placeholder="Stock Transition operation ID, only when required"
              value={stockTransitionOperationId}
              onChange={(event) =>
                setStockTransitionOperationId(event.target.value)
              }
            />
            <Button
              className="w-fit"
              disabled={publishDraft.isPending}
              onClick={() =>
                publishDraft.mutate({
                  configurationId: draft.id,
                  stockTransitionOperationId:
                    stockTransitionOperationId.trim() || undefined,
                })
              }
            >
              Publish Draft
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
