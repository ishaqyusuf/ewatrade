"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { DashboardTable } from "@/components/dashboard/dashboard-table"
import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Button, CurrencyInput } from "@ewatrade/ui"
import {
  Add01Icon,
  Edit02Icon,
  Package01Icon,
  Search01Icon,
  ToolsIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type {
  FormEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import { useMemo, useState } from "react"

type CatalogItem = RouterOutputs["retailOps"]["catalogItems"][number]
type CatalogItemKind = CatalogItem["kind"]

type CatalogForm = {
  category: string
  description: string
  estimatedTurnaroundHours: string
  fulfillmentMode: "immediate" | "tracked"
  imageUrl: string
  instructions: string
  kind: CatalogItemKind
  name: string
  openingStockQuantity: string
  price: string
  primaryUnitName: string
  variantConversionMultiplier: string
  variantName: string
  variantOpeningStockQuantity: string
  variantPrice: string
}

type StoreSummary = {
  currencyCode: string
  id: string
  name: string
}

const emptyForm: CatalogForm = {
  category: "",
  description: "",
  estimatedTurnaroundHours: "48",
  fulfillmentMode: "tracked",
  imageUrl: "",
  instructions: "",
  kind: "product",
  name: "",
  openingStockQuantity: "0",
  price: "",
  primaryUnitName: "Unit",
  variantConversionMultiplier: "",
  variantName: "",
  variantOpeningStockQuantity: "0",
  variantPrice: "",
}

function parseMajorCurrencyToMinor(value: string) {
  const parsed = Number(value.replaceAll(",", "").trim())
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

function formatMinorCurrency(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(value / 100)
}

function getDefaultVariant(item: CatalogItem) {
  return (
    item.variants.find((variant) => variant.isDefault) ??
    item.variants[0] ??
    null
  )
}

function getEditForm(item: CatalogItem): CatalogForm {
  const variant = getDefaultVariant(item)

  return {
    ...emptyForm,
    category: item.category ?? "",
    description: item.description ?? "",
    estimatedTurnaroundHours:
      item.service?.estimatedTurnaroundHours?.toString() ?? "",
    fulfillmentMode: item.service?.fulfillmentMode ?? "tracked",
    imageUrl: item.imageUrl ?? "",
    instructions: item.service?.instructions ?? "",
    kind: item.kind,
    name: item.name,
    price: variant ? (variant.priceMinor / 100).toString() : "",
    primaryUnitName: variant?.name ?? "Unit",
  }
}

function Field({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Every Field call supplies its form control as the child.
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </label>
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

export function CatalogItemsPage({ store }: { store: StoreSummary }) {
  const trpc = useTRPC()
  const [search, setSearch] = useState("")
  const [kindFilter, setKindFilter] = useState<CatalogItemKind | "">("")
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null)
  const [sheetMode, setSheetMode] = useState<"create" | "edit" | null>(null)
  const [form, setForm] = useState<CatalogForm>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const itemsQuery = useQuery(
    trpc.retailOps.catalogItems.queryOptions(
      { kind: kindFilter || undefined, storeId: store.id },
      { retry: false },
    ),
  )
  const items = itemsQuery.data ?? []
  const refreshItems = () => void itemsQuery.refetch()

  const createMutation = useMutation(
    trpc.retailOps.createCatalogItem.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: () => {
        setForm(emptyForm)
        setSheetMode(null)
        setNotice("Catalog item created.")
        refreshItems()
      },
    }),
  )
  const updateMutation = useMutation(
    trpc.retailOps.updateCatalogItem.mutationOptions({
      onError: (mutationError) => setError(mutationError.message),
      onSuccess: () => {
        setSelectedItem(null)
        setSheetMode(null)
        setNotice("Catalog item updated.")
        refreshItems()
      },
    }),
  )

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items

    return items.filter((item) =>
      [
        item.category ?? "",
        item.description ?? "",
        item.kind,
        item.name,
        item.slug,
        ...item.variants.map((variant) => variant.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    )
  }, [items, search])

  const summary = useMemo(
    () => ({
      products: items.filter((item) => item.kind === "product").length,
      services: items.filter((item) => item.kind === "service").length,
      total: items.length,
      trackedServices: items.filter(
        (item) =>
          item.kind === "service" &&
          item.service?.fulfillmentMode === "tracked",
      ).length,
    }),
    [items],
  )

  function openCreate() {
    setError(null)
    setNotice(null)
    setSelectedItem(null)
    setForm(emptyForm)
    setSheetMode("create")
  }

  function openEdit(item: CatalogItem) {
    setError(null)
    setNotice(null)
    setSelectedItem(item)
    setForm(getEditForm(item))
    setSheetMode("edit")
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const priceMinor = parseMajorCurrencyToMinor(form.price)
    if (!form.name.trim() || priceMinor === null) {
      setError("Enter an item name and a valid price.")
      return
    }

    const estimatedTurnaroundHours = form.estimatedTurnaroundHours.trim()
      ? Number(form.estimatedTurnaroundHours)
      : undefined
    if (
      form.kind === "service" &&
      estimatedTurnaroundHours !== undefined &&
      (!Number.isInteger(estimatedTurnaroundHours) ||
        estimatedTurnaroundHours < 1)
    ) {
      setError("Turnaround hours must be a whole number greater than zero.")
      return
    }

    if (sheetMode === "edit" && selectedItem) {
      updateMutation.mutate({
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        imageUrl: form.imageUrl.trim() || null,
        itemId: selectedItem.id,
        kind: selectedItem.kind,
        name: form.name.trim(),
        priceMinor,
        service:
          selectedItem.kind === "service"
            ? {
                estimatedTurnaroundHours: estimatedTurnaroundHours ?? null,
                fulfillmentMode: form.fulfillmentMode,
                instructions: form.instructions.trim() || null,
              }
            : undefined,
        storeId: store.id,
      })
      return
    }

    const openingStockQuantity = Number(form.openingStockQuantity || 0)
    const hasVariant = Boolean(
      form.variantName.trim() || form.variantPrice.trim(),
    )
    const variantPriceMinor = hasVariant
      ? parseMajorCurrencyToMinor(form.variantPrice)
      : null
    const variantOpeningStockQuantity = Number(
      form.variantOpeningStockQuantity || 0,
    )
    if (
      form.kind === "product" &&
      (!Number.isInteger(openingStockQuantity) || openingStockQuantity < 0)
    ) {
      setError("Opening stock must be a whole number of zero or more.")
      return
    }
    if (
      hasVariant &&
      (!form.variantName.trim() || variantPriceMinor === null)
    ) {
      setError("Variant name and price are both required.")
      return
    }
    if (
      form.kind === "product" &&
      hasVariant &&
      (!Number.isInteger(variantOpeningStockQuantity) ||
        variantOpeningStockQuantity < 0)
    ) {
      setError("Variant stock must be a whole number of zero or more.")
      return
    }
    if (
      form.kind === "product" &&
      form.variantConversionMultiplier.trim() &&
      (!Number.isFinite(Number(form.variantConversionMultiplier)) ||
        Number(form.variantConversionMultiplier) <= 0)
    ) {
      setError("Variant conversion must be greater than zero.")
      return
    }

    createMutation.mutate({
      category: form.category.trim() || undefined,
      description: form.description.trim() || undefined,
      kind: form.kind,
      imageUrl: form.imageUrl.trim() || undefined,
      name: form.name.trim(),
      openingStockQuantity:
        form.kind === "product" ? openingStockQuantity : undefined,
      priceMinor,
      primaryUnitName:
        form.kind === "product"
          ? form.primaryUnitName.trim() || "Unit"
          : undefined,
      service:
        form.kind === "service"
          ? {
              estimatedTurnaroundHours,
              fulfillmentMode: form.fulfillmentMode,
              instructions: form.instructions.trim() || undefined,
            }
          : undefined,
      storeId: store.id,
      variants:
        hasVariant && variantPriceMinor !== null
          ? [
              {
                conversionMultiplier:
                  form.kind === "product" &&
                  form.variantConversionMultiplier.trim()
                    ? Number(form.variantConversionMultiplier)
                    : undefined,
                name: form.variantName.trim(),
                openingStockQuantity:
                  form.kind === "product"
                    ? variantOpeningStockQuantity
                    : undefined,
                priceMinor: variantPriceMinor,
              },
            ]
          : [],
    })
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <HugeiconsIcon icon={Package01Icon} className="size-4" />
            Catalog
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Items</h1>
          <p className="text-sm text-muted-foreground">
            Products keep stock. Services are priced without stock.
          </p>
        </div>
        <Button type="button" className="gap-2 rounded-lg" onClick={openCreate}>
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Add item
        </Button>
      </div>

      {error || itemsQuery.error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? itemsQuery.error?.message}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["All items", summary.total],
          ["Products", summary.products],
          ["Services", summary.services],
          ["Tracked services", summary.trackedServices],
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
              placeholder="Search items"
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Item type"
            value={kindFilter}
            onChange={(event) =>
              setKindFilter(event.target.value as CatalogItemKind | "")
            }
            className="md:w-[180px]"
          >
            <option value="">All item types</option>
            <option value="product">Products</option>
            <option value="service">Services</option>
          </Select>
        </div>

        <DashboardTable
          rows={filteredItems}
          isLoading={itemsQuery.isLoading}
          getRowKey={(item) => item.id}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <HugeiconsIcon
                  icon={Package01Icon}
                  className="size-5 text-muted-foreground"
                />
              </div>
              <div>
                <p className="text-sm font-medium">No items found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a Product or Service, or adjust the filters.
                </p>
              </div>
            </div>
          }
          columns={[
            {
              header: "Item",
              key: "item",
              render: (item) => (
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <HugeiconsIcon
                      icon={item.kind === "service" ? ToolsIcon : Package01Icon}
                      className="size-5 text-muted-foreground"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {item.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.category || item.slug}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              header: "Type",
              key: "type",
              render: (item) => (
                <Badge
                  className={cn(
                    "rounded-full",
                    item.kind === "service"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-violet-50 text-violet-700",
                  )}
                >
                  {item.kind === "service" ? "Service" : "Product"}
                </Badge>
              ),
            },
            {
              header: "Price",
              key: "price",
              render: (item) => {
                const variant = getDefaultVariant(item)
                return variant
                  ? formatMinorCurrency(variant.priceMinor, item.currencyCode)
                  : "—"
              },
            },
            {
              header: "Stock",
              key: "stock",
              render: (item) =>
                item.kind === "service" ? (
                  <span className="text-muted-foreground">Not tracked</span>
                ) : (
                  item.variants.reduce(
                    (total, variant) =>
                      total + (variant.availableQuantity ?? 0),
                    0,
                  )
                ),
            },
            {
              header: "Fulfillment",
              key: "fulfillment",
              render: (item) =>
                item.kind === "service" ? (
                  <span className="capitalize text-muted-foreground">
                    {item.service?.fulfillmentMode ?? "tracked"}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Inventory</span>
                ),
            },
            {
              className: "text-right",
              header: "Action",
              key: "action",
              render: (item) => (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-lg"
                  onClick={() => openEdit(item)}
                >
                  <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                  Edit
                </Button>
              ),
            },
          ]}
        />
      </section>

      <DashboardSheet
        open={sheetMode !== null}
        onClose={() => setSheetMode(null)}
        title={sheetMode === "edit" ? "Edit item" : "Add item"}
        description={
          sheetMode === "edit"
            ? selectedItem?.name
            : "Choose the item type, then enter its details."
        }
      >
        <form className="grid gap-4" onSubmit={submitForm}>
          <fieldset className="grid gap-2" disabled={sheetMode === "edit"}>
            <legend className="text-sm font-medium text-foreground">
              Item type
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["product", "service"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={form.kind === kind}
                  className={cn(
                    "rounded-lg border px-3 py-3 text-left transition",
                    form.kind === kind
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:bg-muted/50",
                  )}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      kind,
                      primaryUnitName:
                        kind === "product" ? current.primaryUnitName : "Unit",
                    }))
                  }
                >
                  <span className="block text-sm font-medium capitalize">
                    {kind}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {kind === "product" ? "Keeps stock" : "Priced, no stock"}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <Field label="Name">
            <TextInput
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <TextInput
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label={`Price (${store.currencyCode})`}>
              <CurrencyInput
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                currencyCode={store.currencyCode}
                value={form.price}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, price: value }))
                }
                required
              />
            </Field>
          </div>

          <Field label="Description">
            <TextArea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </Field>

          <Field label="Image URL">
            <TextInput
              type="url"
              value={form.imageUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  imageUrl: event.target.value,
                }))
              }
            />
          </Field>

          {form.kind === "product" ? (
            <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
              <Field label="Primary unit">
                <TextInput
                  value={form.primaryUnitName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      primaryUnitName: event.target.value,
                    }))
                  }
                  disabled={sheetMode === "edit"}
                  required
                />
              </Field>
              <Field label="Opening stock">
                <TextInput
                  inputMode="numeric"
                  value={form.openingStockQuantity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      openingStockQuantity: event.target.value,
                    }))
                  }
                  disabled={sheetMode === "edit"}
                />
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Ongoing stock changes belong in Inventory.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 rounded-lg border border-border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Fulfillment">
                  <Select
                    value={form.fulfillmentMode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        fulfillmentMode: event.target.value as
                          | "immediate"
                          | "tracked",
                      }))
                    }
                  >
                    <option value="tracked">Tracked job</option>
                    <option value="immediate">Immediate</option>
                  </Select>
                </Field>
                <Field label="Turnaround (hours)">
                  <TextInput
                    inputMode="numeric"
                    value={form.estimatedTurnaroundHours}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        estimatedTurnaroundHours: event.target.value,
                      }))
                    }
                    placeholder="48"
                  />
                </Field>
              </div>
              <Field label="Service instructions">
                <TextArea
                  value={form.instructions}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      instructions: event.target.value,
                    }))
                  }
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                Services have a selling price but never create or consume stock.
              </p>
            </div>
          )}

          {sheetMode === "create" ? (
            <div className="grid gap-4 rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium">Optional priced variant</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use variants for size, package, unit, or service level.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Variant name">
                  <TextInput
                    value={form.variantName}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        variantName: event.target.value,
                      }))
                    }
                    placeholder={
                      form.kind === "service" ? "Express" : "Half bag"
                    }
                  />
                </Field>
                <Field label={`Variant price (${store.currencyCode})`}>
                  <CurrencyInput
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                    currencyCode={store.currencyCode}
                    value={form.variantPrice}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        variantPrice: value,
                      }))
                    }
                  />
                </Field>
              </div>
              {form.kind === "product" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Variant opening stock">
                    <TextInput
                      inputMode="numeric"
                      value={form.variantOpeningStockQuantity}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          variantOpeningStockQuantity: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Conversion multiplier">
                    <TextInput
                      inputMode="decimal"
                      value={form.variantConversionMultiplier}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          variantConversionMultiplier: event.target.value,
                        }))
                      }
                      placeholder="0.5"
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            {sheetMode === "edit" && selectedItem ? (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto rounded-lg"
                disabled={isSaving}
                onClick={() =>
                  updateMutation.mutate({
                    itemId: selectedItem.id,
                    kind: selectedItem.kind,
                    status: "archived",
                    storeId: store.id,
                  })
                }
              >
                Archive item
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setSheetMode(null)}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-lg" disabled={isSaving}>
              {isSaving ? "Saving" : "Save item"}
            </Button>
          </div>
        </form>
      </DashboardSheet>
    </div>
  )
}
