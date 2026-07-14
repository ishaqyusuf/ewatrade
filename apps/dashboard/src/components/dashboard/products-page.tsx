"use client"

import { DashboardSheet } from "@/components/dashboard/dashboard-sheet"
import { DashboardTable } from "@/components/dashboard/dashboard-table"
import {
  type ProductCatalogItem,
  formatMinorCurrency,
  getDefaultProductUnit,
  parseMajorCurrencyToMinor,
} from "@/lib/product-catalog"
import { cn } from "@/utils"
import { Badge, Button } from "@ewatrade/ui"
import {
  Add01Icon,
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

type ProductsResponse = {
  products: ProductCatalogItem[]
  store: {
    currencyCode: string
    id: string
    name: string
  }
}

type FormState = {
  description: string
  imageUrl: string
  name: string
  openingStockQuantity: string
  price: string
  primaryUnitName: string
  status: "ACTIVE" | "ARCHIVED" | "DRAFT"
  variantConversionMultiplier: string
  variantName: string
  variantOpeningStockQuantity: string
  variantPrice: string
}

const emptyForm: FormState = {
  description: "",
  imageUrl: "",
  name: "",
  openingStockQuantity: "0",
  price: "",
  primaryUnitName: "Unit",
  status: "ACTIVE",
  variantConversionMultiplier: "",
  variantName: "",
  variantOpeningStockQuantity: "0",
  variantPrice: "",
}

function statusTone(status: string) {
  if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700"
  if (status === "DRAFT") return "bg-amber-50 text-amber-700"
  return "bg-muted text-muted-foreground"
}

function toMajorPrice(value: number) {
  return (value / 100).toString()
}

function getProductFormState(product: ProductCatalogItem): FormState {
  const defaultUnit = getDefaultProductUnit(product)

  return {
    ...emptyForm,
    description: product.description ?? "",
    name: product.name,
    price: defaultUnit ? toMajorPrice(defaultUnit.priceMinor) : "",
    primaryUnitName: defaultUnit?.name ?? "Unit",
    status:
      product.status === "ARCHIVED" || product.status === "DRAFT"
        ? product.status
        : "ACTIVE",
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

export function ProductsPage({
  initialProducts,
  store,
}: {
  initialProducts: ProductCatalogItem[]
  store: ProductsResponse["store"]
}) {
  const [products, setProducts] = useState(initialProducts)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [sheetMode, setSheetMode] = useState<"create" | "edit" | null>(null)
  const [selectedProduct, setSelectedProduct] =
    useState<ProductCatalogItem | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setIsLoading(true)

      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set("search", search.trim())
        if (status) params.set("status", status)

        const response = await fetch(`/api/products?${params.toString()}`, {
          signal: controller.signal,
        })
        const result = (await response.json()) as
          | ProductsResponse
          | { error?: string }

        if (!response.ok) {
          throw new Error(
            "error" in result && result.error
              ? result.error
              : "Product list failed.",
          )
        }

        setProducts((result as ProductsResponse).products)
      } catch (fetchError) {
        if (!controller.signal.aborted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Product list failed.",
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
  }, [search, status])

  const summary = useMemo(() => {
    const active = products.filter((product) => product.status === "ACTIVE")
    const unitCount = products.reduce(
      (total, product) => total + product.units.length,
      0,
    )
    const stockCount = products.reduce(
      (total, product) =>
        total +
        product.units.reduce((sum, unit) => sum + unit.onHandQuantity, 0),
      0,
    )

    return {
      active: active.length,
      stockCount,
      total: products.length,
      unitCount,
    }
  }, [products])

  function openCreate() {
    setError(null)
    setNotice(null)
    setSelectedProduct(null)
    setForm(emptyForm)
    setSheetMode("create")
  }

  function openEdit(product: ProductCatalogItem) {
    setError(null)
    setNotice(null)
    setSelectedProduct(product)
    setForm(getProductFormState(product))
    setSheetMode("edit")
  }

  async function refreshProducts() {
    const response = await fetch("/api/products")
    const result = (await response.json()) as ProductsResponse

    if (response.ok) {
      setProducts(result.products)
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    const priceMinor = parseMajorCurrencyToMinor(form.price)
    const openingStockQuantity = Number(form.openingStockQuantity || 0)
    const variantPriceMinor = parseMajorCurrencyToMinor(form.variantPrice)
    const hasVariant = form.variantName.trim() || form.variantPrice.trim()

    if (!priceMinor) {
      setError("Enter a valid product price.")
      return
    }

    if (!Number.isInteger(openingStockQuantity) || openingStockQuantity < 0) {
      setError("Opening stock must be zero or more.")
      return
    }

    if (hasVariant && (!form.variantName.trim() || !variantPriceMinor)) {
      setError("Variant name and price are both required.")
      return
    }

    setIsSaving(true)

    try {
      const payload = {
        description: form.description.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        name: form.name.trim(),
        openingStockQuantity,
        priceMinor,
        primaryUnitName: form.primaryUnitName.trim(),
        status: form.status,
        variants:
          sheetMode === "create" && hasVariant && variantPriceMinor
            ? [
                {
                  conversionMultiplier: form.variantConversionMultiplier
                    ? Number(form.variantConversionMultiplier)
                    : undefined,
                  name: form.variantName.trim(),
                  openingStockQuantity: Number(
                    form.variantOpeningStockQuantity || 0,
                  ),
                  priceMinor: variantPriceMinor,
                },
              ]
            : [],
      }
      const response = await fetch(
        sheetMode === "edit" && selectedProduct
          ? `/api/products/${selectedProduct.id}`
          : "/api/products",
        {
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
          method: sheetMode === "edit" ? "PATCH" : "POST",
        },
      )
      const result = (await response.json()) as { error?: string }

      if (!response.ok) {
        throw new Error(result.error ?? "Product save failed.")
      }

      await refreshProducts()
      setSheetMode(null)
      setNotice(sheetMode === "edit" ? "Product updated." : "Product created.")
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Product save failed.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <HugeiconsIcon icon={Package01Icon} className="size-4" />
            Products
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
          <p className="text-sm text-muted-foreground">{store.name}</p>
        </div>
        <Button type="button" className="gap-2 rounded-lg" onClick={openCreate}>
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          New product
        </Button>
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Products", summary.total],
          ["Active", summary.active],
          ["Units", summary.unitCount],
          ["On hand", summary.stockCount],
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
              placeholder="Search catalog"
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="md:w-[180px]"
            aria-label="Product status"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </div>

        <DashboardTable
          rows={products}
          isLoading={isLoading}
          getRowKey={(product) => product.id}
          emptyState={
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <HugeiconsIcon
                  icon={Package01Icon}
                  className="size-5 text-muted-foreground"
                />
              </div>
              <div>
                <p className="text-sm font-medium">No products found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a catalog item or adjust the current filters.
                </p>
              </div>
            </div>
          }
          columns={[
            {
              header: "Product",
              key: "product",
              render: (product) => {
                const defaultUnit = getDefaultProductUnit(product)

                return (
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <HugeiconsIcon
                        icon={Package01Icon}
                        className="size-5 text-muted-foreground"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {product.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {defaultUnit?.name ?? "Unit"} · {product.slug}
                      </p>
                    </div>
                  </div>
                )
              },
            },
            {
              header: "Price",
              key: "price",
              render: (product) => {
                const defaultUnit = getDefaultProductUnit(product)

                return defaultUnit
                  ? formatMinorCurrency(
                      defaultUnit.priceMinor,
                      product.currencyCode,
                    )
                  : "—"
              },
            },
            {
              header: "Stock",
              key: "stock",
              render: (product) => (
                <span>
                  {product.units.reduce(
                    (total, unit) => total + unit.onHandQuantity,
                    0,
                  )}
                </span>
              ),
            },
            {
              header: "Units",
              key: "units",
              render: (product) => (
                <span className="text-muted-foreground">
                  {product.units.length}
                </span>
              ),
            },
            {
              header: "Status",
              key: "status",
              render: (product) => (
                <Badge
                  className={cn("rounded-full", statusTone(product.status))}
                >
                  {product.status.toLowerCase()}
                </Badge>
              ),
            },
            {
              header: "Price history",
              key: "history",
              render: (product) => {
                const latest = product.priceHistory[0]

                return latest ? (
                  <span className="text-muted-foreground">
                    {formatMinorCurrency(
                      latest.priceMinor,
                      product.currencyCode,
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No changes</span>
                )
              },
            },
            {
              className: "text-right",
              header: "",
              key: "actions",
              render: (product) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(product)}
                  aria-label={`Edit ${product.name}`}
                >
                  <HugeiconsIcon icon={Edit02Icon} className="size-4" />
                </Button>
              ),
            },
          ]}
        />
      </section>

      <DashboardSheet
        open={sheetMode !== null}
        onClose={() => setSheetMode(null)}
        title={sheetMode === "edit" ? "Edit product" : "New product"}
        description={selectedProduct?.name}
      >
        <form className="grid gap-4" onSubmit={submitForm}>
          <Field label="Name">
            <TextInput
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </Field>

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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary unit">
              <TextInput
                value={form.primaryUnitName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    primaryUnitName: event.target.value,
                  }))
                }
                required
              />
            </Field>
            <Field label={`Price (${store.currencyCode})`}>
              <TextInput
                inputMode="decimal"
                value={form.price}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
                required
              />
            </Field>
          </div>

          {sheetMode === "create" ? (
            <>
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
              <div className="grid gap-4 rounded-lg border border-border p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Variant unit">
                    <TextInput
                      value={form.variantName}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          variantName: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label={`Variant price (${store.currencyCode})`}>
                    <TextInput
                      inputMode="decimal"
                      value={form.variantPrice}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          variantPrice: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Variant stock">
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
                  <Field label="Conversion">
                    <TextInput
                      inputMode="decimal"
                      value={form.variantConversionMultiplier}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          variantConversionMultiplier: event.target.value,
                        }))
                      }
                    />
                  </Field>
                </div>
              </div>
            </>
          ) : (
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as FormState["status"],
                  }))
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setSheetMode(null)}
            >
              Cancel
            </Button>
            <Button type="submit" className="rounded-lg" disabled={isSaving}>
              {isSaving ? "Saving" : "Save"}
            </Button>
          </div>
        </form>
      </DashboardSheet>
    </div>
  )
}
