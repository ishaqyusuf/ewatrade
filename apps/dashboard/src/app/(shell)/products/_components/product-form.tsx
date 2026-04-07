"use client"

import { cn } from "@/utils"
import { Button } from "@ewatrade/ui"
import {
  Add01Icon,
  ArrowLeft01Icon,
  Delete01Icon,
  Package01Icon,
  PencilEdit01Icon,
  TickDouble01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type VariantRow = {
  tempId: string
  variantId?: string  // present when editing an existing variant
  name: string
  sku: string
  price: string         // user input (major units, e.g. "5000")
  compareAtPrice: string
  optionSummary: string
  isDefault: boolean
  isActive: boolean
}

type ExistingProduct = {
  id: string
  name: string
  description: string | null
  sku: string | null
  listPriceMinor: number
  salePriceMinor: number | null
  status: string
  isMarketplaceListed: boolean
  isPublished: boolean
  variants: {
    id: string
    name: string
    sku: string
    optionSummary: string | null
    priceMinor: number
    compareAtMinor: number | null
    isDefault: boolean
    isActive: boolean
  }[]
}

type Props = {
  mode: "create" | "edit"
  currencyCode: string
  initialData?: ExistingProduct
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMajor(minor: number): string {
  return (minor / 100).toString()
}

function toMinor(input: string): number {
  const val = parseFloat(input)
  return isNaN(val) ? 0 : Math.round(val * 100)
}

function newVariantRow(overrides: Partial<VariantRow> = {}): VariantRow {
  return {
    tempId: crypto.randomUUID(),
    name: "",
    sku: "",
    price: "",
    compareAtPrice: "",
    optionSummary: "",
    isDefault: false,
    isActive: true,
    ...overrides,
  }
}

function buildVariantsFromProduct(product: ExistingProduct): VariantRow[] {
  return product.variants.map((v) => ({
    tempId: v.id,
    variantId: v.id,
    name: v.name,
    sku: v.sku,
    price: toMajor(v.priceMinor),
    compareAtPrice: v.compareAtMinor ? toMajor(v.compareAtMinor) : "",
    optionSummary: v.optionSummary ?? "",
    isDefault: v.isDefault,
    isActive: v.isActive,
  }))
}

const FIELD =
  "h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10 w-full"

const LABEL = "text-sm font-medium"

const HINT = "text-xs text-muted-foreground"

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductForm({ mode, currencyCode, initialData }: Props) {
  const router = useRouter()

  // ── Base fields state
  const [name, setName] = useState(initialData?.name ?? "")
  const [description, setDescription] = useState(
    initialData?.description ?? "",
  )
  const [productSku, setProductSku] = useState(initialData?.sku ?? "")
  const [listPrice, setListPrice] = useState(
    initialData ? toMajor(initialData.listPriceMinor) : "",
  )
  const [salePrice, setSalePrice] = useState(
    initialData?.salePriceMinor ? toMajor(initialData.salePriceMinor) : "",
  )
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE" | "ARCHIVED">(
    (initialData?.status as "DRAFT" | "ACTIVE" | "ARCHIVED") ?? "DRAFT",
  )
  const [isMarketplaceListed, setIsMarketplaceListed] = useState(
    initialData?.isMarketplaceListed ?? false,
  )

  // ── Variants state
  const hasMultipleVariants =
    initialData ? initialData.variants.length > 1 || (initialData.variants[0] && initialData.variants[0].name !== "Default") : false

  const [useVariants, setUseVariants] = useState(hasMultipleVariants)
  const [variants, setVariants] = useState<VariantRow[]>(
    initialData
      ? buildVariantsFromProduct(initialData)
      : [newVariantRow({ name: "Default", isDefault: true })],
  )

  // ── UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Variant row helpers
  const updateVariant = useCallback(
    (tempId: string, field: keyof VariantRow, value: string | boolean) => {
      setVariants((rows) =>
        rows.map((r) => (r.tempId === tempId ? { ...r, [field]: value } : r)),
      )
    },
    [],
  )

  function addVariant() {
    setVariants((rows) => [
      ...rows,
      newVariantRow({ isDefault: rows.length === 0 }),
    ])
  }

  function removeVariant(tempId: string) {
    setVariants((rows) => {
      const filtered = rows.filter((r) => r.tempId !== tempId)
      // Ensure at least one is default
      if (filtered.length > 0 && !filtered.some((r) => r.isDefault)) {
        filtered[0] = { ...filtered[0], isDefault: true }
      }
      return filtered
    })
  }

  function setDefaultVariant(tempId: string) {
    setVariants((rows) =>
      rows.map((r) => ({ ...r, isDefault: r.tempId === tempId })),
    )
  }

  function toggleUseVariants(checked: boolean) {
    setUseVariants(checked)
    if (!checked) {
      // Collapse to single default variant
      setVariants([
        newVariantRow({
          name: "Default",
          isDefault: true,
          sku: productSku || "",
          price: listPrice,
        }),
      ])
    } else {
      // Start with one empty variant row
      setVariants([newVariantRow({ isDefault: true })])
    }
  }

  // ── Derived validation
  const canSubmit =
    name.trim() &&
    listPrice &&
    !isNaN(parseFloat(listPrice)) &&
    parseFloat(listPrice) >= 0 &&
    variants.length > 0 &&
    variants.every((v) => v.name.trim() && v.sku.trim() && v.price)

  // ── Build payload variants
  function buildVariantsPayload() {
    if (!useVariants) {
      // Single default variant
      return [
        {
          name: "Default",
          sku: productSku.trim() || `${name.trim().toLowerCase().replace(/\s+/g, "-")}-default`,
          priceMinor: toMinor(listPrice),
          ...(salePrice ? { compareAtMinor: toMinor(salePrice) } : {}),
          isDefault: true,
        },
      ]
    }
    return variants.map((v) => ({
      name: v.name.trim(),
      sku: v.sku.trim(),
      optionSummary: v.optionSummary.trim() || undefined,
      priceMinor: toMinor(v.price),
      ...(v.compareAtPrice ? { compareAtMinor: toMinor(v.compareAtPrice) } : {}),
      isDefault: v.isDefault,
    }))
  }

  // ── Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      sku: !useVariants && productSku.trim() ? productSku.trim() : undefined,
      listPriceMinor: toMinor(listPrice),
      salePriceMinor: salePrice ? toMinor(salePrice) : undefined,
      status,
      isMarketplaceListed,
      variants: buildVariantsPayload(),
    }

    try {
      const url =
        mode === "create"
          ? "/api/products"
          : `/api/products/${initialData!.id}`
      const method = mode === "create" ? "POST" : "PATCH"

      // For edit mode, split into product update + variant handling
      if (mode === "edit") {
        const productPayload = {
          name: payload.name,
          description: payload.description ?? null,
          sku: payload.sku ?? null,
          listPriceMinor: payload.listPriceMinor,
          salePriceMinor: payload.salePriceMinor ?? null,
          status: payload.status,
          isMarketplaceListed: payload.isMarketplaceListed,
        }
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productPayload),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError((body as { error?: string }).error ?? "Failed to update product.")
          return
        }

        // Update existing variants
        for (const v of variants) {
          if (v.variantId) {
            await fetch(`/api/products/${initialData!.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                variantOp: "update",
                data: {
                  variantId: v.variantId,
                  name: v.name.trim(),
                  sku: v.sku.trim(),
                  optionSummary: v.optionSummary.trim() || null,
                  priceMinor: toMinor(v.price),
                  compareAtMinor: v.compareAtPrice ? toMinor(v.compareAtPrice) : null,
                  isDefault: v.isDefault,
                  isActive: v.isActive,
                },
              }),
            })
          } else {
            // New variant added during edit
            await fetch(`/api/products/${initialData!.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                variantOp: "add",
                data: {
                  name: v.name.trim(),
                  sku: v.sku.trim(),
                  optionSummary: v.optionSummary.trim() || undefined,
                  priceMinor: toMinor(v.price),
                  compareAtMinor: v.compareAtPrice ? toMinor(v.compareAtPrice) : undefined,
                  isDefault: v.isDefault,
                },
              }),
            })
          }
        }

        router.push("/products")
        router.refresh()
        return
      }

      // Create mode
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError((body as { error?: string }).error ?? "Failed to save product.")
        return
      }

      router.push("/products")
      router.refresh()
    } catch {
      setError("Network error. Please check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  const currencySymbols: Record<string, string> = {
    NGN: "₦", USD: "$", GHS: "₵", KES: "KSh", ZAR: "R", EGP: "E£",
  }
  const currSymbol = currencySymbols[currencyCode] ?? currencyCode

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Back link + header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/products"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
            Products
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "create" ? "New product" : "Edit product"}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/products")}
            className="h-9 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || !canSubmit}
            className="h-9 rounded-xl"
          >
            <HugeiconsIcon
              icon={mode === "create" ? Add01Icon : TickDouble01Icon}
              className="size-4"
            />
            {loading
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
                ? "Create product"
                : "Save changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left column: main fields */}
        <div className="flex flex-col gap-5">
          {/* Basic info card */}
          <Card title="Product info" icon={Package01Icon}>
            <div className="flex flex-col gap-4">
              <Field label="Name" required hint="What customers will see in your store.">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ankara Print Tote Bag"
                  className={FIELD}
                />
              </Field>

              <Field label="Description" hint="Optional. Displayed on the product page.">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the product…"
                  rows={4}
                  className={cn(
                    FIELD,
                    "h-auto resize-none py-2.5 leading-relaxed",
                  )}
                />
              </Field>
            </div>
          </Card>

          {/* Pricing card */}
          <Card title="Pricing" icon={PencilEdit01Icon}>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="List price"
                required
                hint={`Price shown to customers (${currencyCode}).`}
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {currSymbol}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value)}
                    placeholder="0"
                    className={cn(FIELD, "pl-7")}
                  />
                </div>
              </Field>

              <Field
                label="Sale price"
                hint="Optional. Shown as the crossed-out compare price."
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {currSymbol}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    placeholder="0"
                    className={cn(FIELD, "pl-7")}
                  />
                </div>
              </Field>
            </div>

            {!useVariants && (
              <Field label="SKU" hint="Stock Keeping Unit — your internal product code.">
                <input
                  type="text"
                  value={productSku}
                  onChange={(e) => setProductSku(e.target.value)}
                  placeholder="e.g. TOTE-ANK-001"
                  className={FIELD}
                />
              </Field>
            )}
          </Card>

          {/* Variants card */}
          <Card title="Variants">
            <div className="flex flex-col gap-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={useVariants}
                  onChange={(e) => toggleUseVariants(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border/70 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">This product has variants</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Add different options like Size, Color, or Material — each
                    with its own SKU and price.
                  </p>
                </div>
              </label>

              {useVariants && (
                <VariantsEditor
                  variants={variants}
                  currSymbol={currSymbol}
                  onUpdate={updateVariant}
                  onAdd={addVariant}
                  onRemove={removeVariant}
                  onSetDefault={setDefaultVariant}
                />
              )}
            </div>
          </Card>
        </div>

        {/* Right column: status + settings */}
        <div className="flex flex-col gap-5">
          <Card title="Status">
            <div className="flex flex-col gap-3">
              {(
                [
                  {
                    value: "DRAFT",
                    label: "Draft",
                    desc: "Not visible to customers.",
                  },
                  {
                    value: "ACTIVE",
                    label: "Active",
                    desc: "Visible and purchasable.",
                  },
                  {
                    value: "ARCHIVED",
                    label: "Archived",
                    desc: "Hidden from store.",
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                    status === opt.value
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/70 hover:bg-muted/30",
                  )}
                >
                  <input
                    type="radio"
                    name="status"
                    value={opt.value}
                    checked={status === opt.value}
                    onChange={() => setStatus(opt.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </Card>

          <Card title="Marketplace">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={isMarketplaceListed}
                onChange={(e) => setIsMarketplaceListed(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border/70 accent-primary"
              />
              <div>
                <p className="text-sm font-medium">List on marketplace</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Make this product discoverable to buyers browsing the ewatrade
                  marketplace.
                </p>
              </div>
            </label>
          </Card>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

// ── Variants editor sub-component ─────────────────────────────────────────────

type VariantsEditorProps = {
  variants: VariantRow[]
  currSymbol: string
  onUpdate: (tempId: string, field: keyof VariantRow, value: string | boolean) => void
  onAdd: () => void
  onRemove: (tempId: string) => void
  onSetDefault: (tempId: string) => void
}

function VariantsEditor({
  variants,
  currSymbol,
  onUpdate,
  onAdd,
  onRemove,
  onSetDefault,
}: VariantsEditorProps) {
  return (
    <div className="flex flex-col gap-3">
      {variants.map((v, idx) => (
        <div
          key={v.tempId}
          className={cn(
            "rounded-xl border p-4 transition-colors",
            v.isDefault ? "border-primary/30 bg-primary/5" : "border-border/70",
            !v.isActive && "opacity-60",
          )}
        >
          {/* Row header */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Variant {idx + 1}
            </span>
            <div className="flex items-center gap-2">
              {!v.isDefault && (
                <button
                  type="button"
                  onClick={() => onSetDefault(v.tempId)}
                  className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Set default
                </button>
              )}
              {v.isDefault && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Default
                </span>
              )}
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(v.tempId)}
                  className="flex size-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <HugeiconsIcon icon={Delete01Icon} className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required>
              <input
                type="text"
                required
                value={v.name}
                onChange={(e) => onUpdate(v.tempId, "name", e.target.value)}
                placeholder="e.g. Small / Red"
                className={FIELD}
              />
            </Field>
            <Field label="SKU" required>
              <input
                type="text"
                required
                value={v.sku}
                onChange={(e) => onUpdate(v.tempId, "sku", e.target.value)}
                placeholder="e.g. PROD-S-RED"
                className={FIELD}
              />
            </Field>
            <Field label="Price" required>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currSymbol}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={v.price}
                  onChange={(e) => onUpdate(v.tempId, "price", e.target.value)}
                  placeholder="0"
                  className={cn(FIELD, "pl-7")}
                />
              </div>
            </Field>
            <Field label="Compare at">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currSymbol}
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={v.compareAtPrice}
                  onChange={(e) =>
                    onUpdate(v.tempId, "compareAtPrice", e.target.value)
                  }
                  placeholder="0"
                  className={cn(FIELD, "pl-7")}
                />
              </div>
            </Field>
            <div className="col-span-2">
              <Field label="Option summary" hint="e.g. Size: S, Color: Red">
                <input
                  type="text"
                  value={v.optionSummary}
                  onChange={(e) =>
                    onUpdate(v.tempId, "optionSummary", e.target.value)
                  }
                  placeholder="Size: Small"
                  className={FIELD}
                />
              </Field>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 rounded-xl border border-dashed border-border/70 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
      >
        <HugeiconsIcon icon={Add01Icon} className="size-4" />
        Add variant
      </button>
    </div>
  )
}

// ── Utility sub-components ────────────────────────────────────────────────────

function Card({
  title,
  icon,
  children,
}: {
  title: string
  // biome-ignore lint/suspicious/noExplicitAny: HugeIcons icon data type
  icon?: any
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        {icon && (
          <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
        )}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={LABEL}>
        {label}{" "}
        {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  )
}
