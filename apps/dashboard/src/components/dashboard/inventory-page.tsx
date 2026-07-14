"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { DashboardTable } from "@/components/dashboard/dashboard-table"
import {
  type InventoryStockState,
  type InventoryUnitRow,
  type StockMovementRow,
  filterInventoryRows,
  formatMovementType,
  formatSignedQuantity,
} from "@/lib/inventory-operations"
import { formatMinorCurrency } from "@/lib/product-catalog"
import { cn } from "@/utils"
import { Badge, Button } from "@ewatrade/ui"
import {
  Add01Icon,
  Archive01Icon,
  Edit02Icon,
  Package01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type {
  FormEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import { useEffect, useMemo, useState } from "react"

type InventoryResponse = {
  inventory: InventoryUnitRow[]
  movements: StockMovementRow[]
  store: {
    currencyCode: string
    id: string
    name: string
  }
}

type SheetMode = "adjustment" | "conversion" | "intake"

type OperationForm = {
  direction: "decrease" | "increase"
  note: string
  productVariantId: string
  quantity: string
  reason: "correction" | "damage" | "found_stock" | "loss"
  sourceName: string
  targetProductVariantId: string
  targetQuantity: string
}

const emptyForm: OperationForm = {
  direction: "increase",
  note: "",
  productVariantId: "",
  quantity: "",
  reason: "correction",
  sourceName: "",
  targetProductVariantId: "",
  targetQuantity: "",
}

function stateTone(state: InventoryStockState) {
  if (state === "available") return "bg-emerald-50 text-emerald-700"
  if (state === "low") return "bg-amber-50 text-amber-700"

  return "bg-destructive/10 text-destructive"
}

function stateLabel(state: InventoryStockState) {
  if (state === "available") return "available"
  if (state === "low") return "low stock"

  return "out of stock"
}

function movementTone(direction: StockMovementRow["direction"]) {
  return direction === "in"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-muted text-muted-foreground"
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </div>
  )
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[88px] rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className,
      )}
    />
  )
}

function getQuantity(value: string) {
  const quantity = Number(value)

  return Number.isInteger(quantity) && quantity > 0 ? quantity : null
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function InventoryPage({
  initialInventory,
  initialMovements,
  store,
}: {
  initialInventory: InventoryUnitRow[]
  initialMovements: StockMovementRow[]
  store: InventoryResponse["store"]
}) {
  const [inventory, setInventory] = useState(initialInventory)
  const [movements, setMovements] = useState(initialMovements)
  const [search, setSearch] = useState("")
  const [state, setState] = useState<InventoryStockState | "">("")
  const [movementUnitId, setMovementUnitId] = useState("")
  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null)
  const [form, setForm] = useState<OperationForm>(emptyForm)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setIsLoading(true)

      try {
        const params = new URLSearchParams()
        if (movementUnitId) params.set("productVariantId", movementUnitId)

        const response = await fetch(`/api/inventory?${params.toString()}`, {
          signal: controller.signal,
        })
        const result = (await response.json()) as
          | InventoryResponse
          | { error?: string }

        if (!response.ok) {
          throw new Error(
            "error" in result && result.error
              ? result.error
              : "Inventory refresh failed.",
          )
        }

        setInventory((result as InventoryResponse).inventory)
        setMovements((result as InventoryResponse).movements)
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Inventory refresh failed.",
          )
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 250)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [movementUnitId])

  const visibleInventory = useMemo(
    () => filterInventoryRows(inventory, { search, state }),
    [inventory, search, state],
  )
  const selectedUnit = inventory.find(
    (unit) => unit.unitId === form.productVariantId,
  )
  const conversionTargets = inventory.filter(
    (unit) =>
      unit.unitId !== form.productVariantId &&
      (!selectedUnit || unit.productId === selectedUnit.productId),
  )
  const summary = useMemo(() => {
    const onHand = inventory.reduce(
      (total, unit) => total + unit.onHandQuantity,
      0,
    )
    const low = inventory.filter((unit) => unit.state === "low").length
    const out = inventory.filter((unit) => unit.state === "out").length

    return {
      low,
      movements: movements.length,
      onHand,
      out,
      units: inventory.length,
    }
  }, [inventory, movements])

  function openSheet(mode: SheetMode, unit?: InventoryUnitRow) {
    setError(null)
    setNotice(null)
    setSheetMode(mode)
    setForm({
      ...emptyForm,
      productVariantId: unit?.unitId ?? inventory[0]?.unitId ?? "",
      targetProductVariantId: "",
    })
  }

  async function refreshInventory() {
    const params = new URLSearchParams()
    if (movementUnitId) params.set("productVariantId", movementUnitId)

    const response = await fetch(`/api/inventory?${params.toString()}`)
    const result = (await response.json()) as InventoryResponse

    if (response.ok) {
      setInventory(result.inventory)
      setMovements(result.movements)
    }
  }

  async function submitOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (!form.productVariantId) {
      setError("Choose a product unit.")
      return
    }

    const quantity = getQuantity(form.quantity)

    if (!quantity) {
      setError("Enter a whole quantity greater than zero.")
      return
    }

    if (sheetMode === "conversion") {
      const targetQuantity = getQuantity(form.targetQuantity)

      if (!targetQuantity || !form.targetProductVariantId) {
        setError("Choose a target unit and quantity.")
        return
      }

      if (form.productVariantId === form.targetProductVariantId) {
        setError("Choose different source and target units.")
        return
      }
    }

    setIsSaving(true)

    try {
      const payload =
        sheetMode === "intake"
          ? {
              note: form.note.trim() || undefined,
              operation: "intake",
              productVariantId: form.productVariantId,
              quantity,
              sourceName: form.sourceName.trim() || undefined,
            }
          : sheetMode === "adjustment"
            ? {
                direction: form.direction,
                note: form.note.trim() || undefined,
                operation: "adjustment",
                productVariantId: form.productVariantId,
                quantity,
                reason: form.reason,
                sourceName: form.sourceName.trim() || undefined,
              }
            : {
                note: form.note.trim() || undefined,
                operation: "conversion",
                sourceProductVariantId: form.productVariantId,
                sourceQuantity: quantity,
                targetProductVariantId: form.targetProductVariantId,
                targetQuantity: Number(form.targetQuantity),
              }
      const response = await fetch("/api/inventory", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(result.error ?? "Inventory operation failed.")
      }

      await refreshInventory()
      setSheetMode(null)
      setNotice("Inventory updated.")
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Inventory operation failed.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <HugeiconsIcon icon={Archive01Icon} className="size-4" />
            Inventory
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Stock operations
          </h1>
          <p className="text-sm text-muted-foreground">{store.name}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-lg"
            onClick={() => openSheet("adjustment")}
          >
            <HugeiconsIcon icon={Edit02Icon} className="size-4" />
            Adjustment
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-lg"
            onClick={() => openSheet("conversion")}
          >
            <HugeiconsIcon icon={Archive01Icon} className="size-4" />
            Conversion
          </Button>
          <Button
            type="button"
            className="gap-2 rounded-lg"
            onClick={() => openSheet("intake")}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Stock intake
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Units", summary.units],
          ["On hand", summary.onHand],
          ["Low stock", summary.low],
          ["Out", summary.out],
          ["Movements", summary.movements],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-background p-4"
          >
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search inventory"
              className="pl-9"
            />
          </div>
          <Select
            value={state}
            onChange={(event) =>
              setState(event.target.value as InventoryStockState | "")
            }
            className="md:w-[180px]"
            aria-label="Stock state"
          >
            <option value="">All stock states</option>
            <option value="available">Available</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
        </div>

        <DashboardTable
          rows={visibleInventory}
          isLoading={isLoading}
          getRowKey={(row) => row.unitId}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <HugeiconsIcon
                  icon={Archive01Icon}
                  className="size-5 text-muted-foreground"
                />
              </div>
              <div>
                <p className="text-sm font-medium">No inventory found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create products or adjust the current filters.
                </p>
              </div>
            </div>
          }
          columns={[
            {
              header: "Product",
              key: "product",
              render: (row) => (
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <HugeiconsIcon
                      icon={Package01Icon}
                      className="size-5 text-muted-foreground"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {row.productName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.unitName} - {row.sku ?? row.productSlug}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              header: "On hand",
              key: "onHand",
              render: (row) => row.onHandQuantity,
            },
            {
              header: "Available",
              key: "available",
              render: (row) => (
                <span>
                  {row.availableQuantity}
                  {row.reservedQuantity ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({row.reservedQuantity} reserved)
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              header: "Reorder",
              key: "reorder",
              render: (row) => (
                <span className="text-muted-foreground">
                  {row.reorderPoint ?? "Not set"}
                </span>
              ),
            },
            {
              header: "Price",
              key: "price",
              render: (row) =>
                formatMinorCurrency(row.priceMinor, row.currencyCode),
            },
            {
              header: "State",
              key: "state",
              render: (row) => (
                <Badge className={cn("rounded-full", stateTone(row.state))}>
                  {stateLabel(row.state)}
                </Badge>
              ),
            },
            {
              className: "text-right",
              header: "",
              key: "actions",
              render: (row) => (
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openSheet("intake", row)}
                    aria-label={`Record intake for ${row.productName}`}
                  >
                    <HugeiconsIcon icon={Add01Icon} className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openSheet("adjustment", row)}
                    aria-label={`Adjust ${row.productName}`}
                  >
                    <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Movement history
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Latest stock ledger entries for the selected store.
            </p>
          </div>
          <Select
            value={movementUnitId}
            onChange={(event) => setMovementUnitId(event.target.value)}
            className="md:w-[280px]"
            aria-label="Movement product unit"
          >
            <option value="">All product units</option>
            {inventory.map((unit) => (
              <option key={unit.unitId} value={unit.unitId}>
                {unit.productName} - {unit.unitName}
              </option>
            ))}
          </Select>
        </div>

        <DashboardTable
          rows={movements}
          isLoading={isLoading}
          getRowKey={(row) => row.id}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <HugeiconsIcon
                  icon={Archive01Icon}
                  className="size-5 text-muted-foreground"
                />
              </div>
              <div>
                <p className="text-sm font-medium">No stock movements found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Record stock intake, adjustment, or conversion activity.
                </p>
              </div>
            </div>
          }
          columns={[
            {
              header: "Date",
              key: "date",
              render: (row) => (
                <span className="text-muted-foreground">
                  {formatDateTime(row.happenedAt)}
                </span>
              ),
            },
            {
              header: "Product",
              key: "product",
              render: (row) => (
                <div>
                  <p className="font-medium text-foreground">
                    {row.product.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.unit.name}
                  </p>
                </div>
              ),
            },
            {
              header: "Type",
              key: "type",
              render: (row) => formatMovementType(row.type),
            },
            {
              header: "Quantity",
              key: "quantity",
              render: (row) => (
                <Badge
                  className={cn("rounded-full", movementTone(row.direction))}
                >
                  {formatSignedQuantity(row.signedQuantity)}
                </Badge>
              ),
            },
            {
              header: "On hand",
              key: "onHand",
              render: (row) => row.onHandQuantity ?? "Not tracked",
            },
            {
              header: "Source",
              key: "source",
              render: (row) => (
                <span className="text-muted-foreground">
                  {row.sourceName ?? row.externalId}
                </span>
              ),
            },
          ]}
        />
      </section>

      <DashboardSheet
        open={sheetMode !== null}
        onClose={() => setSheetMode(null)}
        title={
          sheetMode === "intake"
            ? "Stock intake"
            : sheetMode === "adjustment"
              ? "Stock adjustment"
              : "Unit conversion"
        }
        description={selectedUnit?.productName}
      >
        <form className="grid gap-4" onSubmit={submitOperation}>
          <Field
            label={
              sheetMode === "conversion"
                ? "Source product unit"
                : "Product unit"
            }
          >
            <Select
              value={form.productVariantId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  productVariantId: event.target.value,
                  targetProductVariantId: "",
                }))
              }
              required
            >
              <option value="">Choose a product unit</option>
              {inventory.map((unit) => (
                <option key={unit.unitId} value={unit.unitId}>
                  {unit.productName} - {unit.unitName}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={sheetMode === "conversion" ? "Source quantity" : "Quantity"}
          >
            <TextInput
              inputMode="numeric"
              value={form.quantity}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  quantity: event.target.value,
                }))
              }
              required
            />
          </Field>

          {sheetMode === "conversion" ? (
            <>
              <Field label="Target product unit">
                <Select
                  value={form.targetProductVariantId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      targetProductVariantId: event.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Choose a target unit</option>
                  {conversionTargets.map((unit) => (
                    <option key={unit.unitId} value={unit.unitId}>
                      {unit.productName} - {unit.unitName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Target quantity">
                <TextInput
                  inputMode="numeric"
                  value={form.targetQuantity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      targetQuantity: event.target.value,
                    }))
                  }
                  required
                />
              </Field>
            </>
          ) : null}

          {sheetMode === "adjustment" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Direction">
                <Select
                  value={form.direction}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      direction: event.target
                        .value as OperationForm["direction"],
                    }))
                  }
                >
                  <option value="increase">Increase</option>
                  <option value="decrease">Decrease</option>
                </Select>
              </Field>
              <Field label="Reason">
                <Select
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value as OperationForm["reason"],
                    }))
                  }
                >
                  <option value="correction">Correction</option>
                  <option value="damage">Damage</option>
                  <option value="found_stock">Found stock</option>
                  <option value="loss">Loss</option>
                </Select>
              </Field>
            </div>
          ) : null}

          {sheetMode !== "conversion" ? (
            <Field label="Source">
              <TextInput
                value={form.sourceName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sourceName: event.target.value,
                  }))
                }
                placeholder={
                  sheetMode === "intake" ? "Supplier, transfer, production" : ""
                }
              />
            </Field>
          ) : null}

          <Field label="Notes">
            <TextArea
              value={form.note}
              onChange={(event) =>
                setForm((current) => ({ ...current, note: event.target.value }))
              }
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setSheetMode(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-lg"
              disabled={isSaving || inventory.length === 0}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DashboardSheet>
    </div>
  )
}
