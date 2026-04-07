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
import { useCallback, useEffect, useMemo, useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single option axis, e.g. { name: "Size", values: ["S", "M", "L"] } */
type OptionGroup = {
  tempId: string
  name: string
  rawValues: string // comma-separated user input, e.g. "S, M, L"
}

/** A generated variant row — one per combination of option values */
type VariantRow = {
  /** Key is stable across regenerations as long as the combination stays the same */
  comboKey: string
  /** variantId is present when editing an existing DB variant */
  variantId?: string
  name: string
  sku: string
  price: string
  compareAtPrice: string
  isDefault: boolean
  isActive: boolean
  /** Resolved selected options, e.g. { "Size": "M", "Color": "Red" } */
  selectedOptions: Record<string, string>
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
  options: {
    id: string
    name: string
    position: number
    values: { id: string; value: string; position: number }[]
  }[]
  variants: {
    id: string
    name: string
    sku: string
    optionSummary: string | null
    priceMinor: number
    compareAtMinor: number | null
    isDefault: boolean
    isActive: boolean
    selectedOptions: {
      optionValue: { id: string; value: string; option: { name: string } }
    }[]
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

/** Parse comma-separated value string into trimmed, non-empty array */
function parseValues(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
}

/** Generate the Cartesian product of multiple value arrays */
function cartesian(arrays: string[][]): string[][] {
  if (arrays.length === 0) return [[]]
  const [first, ...rest] = arrays
  const restCombos = cartesian(rest)
  return first.flatMap((v) => restCombos.map((combo) => [v, ...combo]))
}

/** Build a stable key from a combination: "S|Red" */
function comboKey(values: string[]): string {
  return values.join("|")
}

/** Build a human-readable variant name: "S / Red" */
function comboName(values: string[]): string {
  return values.join(" / ")
}

const FIELD =
  "h-10 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10 w-full"

const LABEL = "text-sm font-medium"
const HINT = "text-xs text-muted-foreground"

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductForm({ mode, currencyCode, initialData }: Props) {
  const router = useRouter()

  // ── Base fields
  const [name, setName] = useState(initialData?.name ?? "")
  const [description, setDescription] = useState(initialData?.description ?? "")
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

  // ── Variant toggle
  const initialHasVariants =
    !!initialData &&
    (initialData.options.length > 0 ||
      initialData.variants.length > 1 ||
      (initialData.variants[0] && initialData.variants[0].name !== "Default"))

  const [useVariants, setUseVariants] = useState(initialHasVariants)

  // ── Option groups
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>(() => {
    if (initialData && initialData.options.length > 0) {
      return initialData.options.map((o) => ({
        tempId: o.id,
        name: o.name,
        rawValues: o.values.map((v) => v.value).join(", "),
      }))
    }
    return [{ tempId: crypto.randomUUID(), name: "", rawValues: "" }]
  })

  // ── Variant rows (keyed by comboKey for stable updates)
  const [variantOverrides, setVariantOverrides] = useState<
    Map<string, { sku: string; price: string; compareAtPrice: string; isDefault: boolean; variantId?: string }>
  >(() => {
    const map = new Map()
    if (initialData) {
      for (const v of initialData.variants) {
        const selectedVals = v.selectedOptions.map((so) => so.optionValue.value)
        const key =
          selectedVals.length > 0
            ? comboKey(selectedVals)
            : v.name === "Default"
              ? "__simple__"
              : comboKey([v.name])
        map.set(key, {
          sku: v.sku,
          price: toMajor(v.priceMinor),
          compareAtPrice: v.compareAtMinor ? toMajor(v.compareAtMinor) : "",
          isDefault: v.isDefault,
          variantId: v.id,
        })
      }
    }
    return map
  })

  // ── UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Derived: generated variant rows from current option groups
  const generatedVariants = useMemo<VariantRow[]>(() => {
    if (!useVariants) return []

    const validGroups = optionGroups.filter(
      (g) => g.name.trim() && parseValues(g.rawValues).length > 0,
    )
    if (validGroups.length === 0) return []

    const axes = validGroups.map((g) => parseValues(g.rawValues))
    const combos = cartesian(axes)

    return combos.map((combo, idx) => {
      const key = comboKey(combo)
      const override = variantOverrides.get(key)
      const selectedOptions: Record<string, string> = {}
      for (let i = 0; i < validGroups.length; i++) {
        selectedOptions[validGroups[i].name.trim()] = combo[i]
      }
      return {
        comboKey: key,
        variantId: override?.variantId,
        name: comboName(combo),
        sku: override?.sku ?? "",
        price: override?.price ?? (listPrice || ""),
        compareAtPrice: override?.compareAtPrice ?? "",
        isDefault: override?.isDefault ?? idx === 0,
        isActive: true,
        selectedOptions,
      }
    })
  }, [optionGroups, useVariants, variantOverrides, listPrice])

  // Sync default price into overrides for newly-added combos
  // (so existing overrides are not clobbered)
  useEffect(() => {
    if (!useVariants) return
    setVariantOverrides((prev) => {
      const next = new Map(prev)
      for (const v of generatedVariants) {
        if (!next.has(v.comboKey)) {
          next.set(v.comboKey, {
            sku: "",
            price: listPrice || "",
            compareAtPrice: "",
            isDefault: v.isDefault,
          })
        }
      }
      return next
    })
  // intentionally only runs when generatedVariants length changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedVariants.length, useVariants])

  // ── Option group helpers
  const addOptionGroup = useCallback(() => {
    if (optionGroups.length >= 3) return
    setOptionGroups((prev) => [
      ...prev,
      { tempId: crypto.randomUUID(), name: "", rawValues: "" },
    ])
  }, [optionGroups.length])

  const removeOptionGroup = useCallback((tempId: string) => {
    setOptionGroups((prev) => prev.filter((g) => g.tempId !== tempId))
  }, [])

  const updateOptionGroup = useCallback(
    (tempId: string, field: "name" | "rawValues", value: string) => {
      setOptionGroups((prev) =>
        prev.map((g) => (g.tempId === tempId ? { ...g, [field]: value } : g)),
      )
    },
    [],
  )

  // ── Variant override helpers
  const updateVariantOverride = useCallback(
    (
      key: string,
      field: "sku" | "price" | "compareAtPrice" | "isDefault",
      value: string | boolean,
    ) => {
      setVariantOverrides((prev) => {
        const next = new Map(prev)
        const existing = next.get(key) ?? { sku: "", price: "", compareAtPrice: "", isDefault: false }
        if (field === "isDefault") {
          // Clear default on all others
          for (const [k, v] of next.entries()) {
            next.set(k, { ...v, isDefault: false })
          }
          next.set(key, { ...existing, isDefault: true })
        } else {
          next.set(key, { ...existing, [field]: value })
        }
        return next
      })
    },
    [],
  )

  // ── Validation
  const validGroups =
    useVariants
      ? optionGroups.filter(
          (g) => g.name.trim() && parseValues(g.rawValues).length > 0,
        )
      : []

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false
    if (!listPrice || isNaN(parseFloat(listPrice))) return false
    if (!useVariants) return true // simple product always valid if name+price set
    if (validGroups.length === 0) return false
    // All generated variants need a SKU
    return generatedVariants.every((v) => {
      const ov = variantOverrides.get(v.comboKey)
      return ov?.sku?.trim()
    })
  }, [name, listPrice, useVariants, validGroups, generatedVariants, variantOverrides])

  // ── Toggle use-variants
  function toggleUseVariants(checked: boolean) {
    setUseVariants(checked)
    if (!checked) {
      setOptionGroups([{ tempId: crypto.randomUUID(), name: "", rawValues: "" }])
      setVariantOverrides(new Map())
    }
  }

  // ── Build API payload
  function buildOptionsPayload() {
    return validGroups.map((g) => ({
      name: g.name.trim(),
      values: parseValues(g.rawValues),
    }))
  }

  function buildVariantsPayload() {
    if (!useVariants) {
      return [
        {
          name: "Default",
          sku:
            productSku.trim() ||
            `${name.trim().toLowerCase().replace(/\s+/g, "-")}-default`,
          priceMinor: toMinor(listPrice),
          compareAtMinor: salePrice ? toMinor(salePrice) : undefined,
          isDefault: true,
        },
      ]
    }
    return generatedVariants.map((v) => {
      const ov = variantOverrides.get(v.comboKey)
      return {
        name: v.name,
        sku: ov?.sku?.trim() ?? "",
        optionSummary: Object.entries(v.selectedOptions)
          .map(([k, val]) => `${k}: ${val}`)
          .join(" / "),
        priceMinor: toMinor(ov?.price ?? listPrice),
        compareAtMinor:
          ov?.compareAtPrice ? toMinor(ov.compareAtPrice) : undefined,
        isDefault: ov?.isDefault ?? v.isDefault,
        selectedOptions: v.selectedOptions,
      }
    })
  }

  // ── Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === "create") {
        const payload = {
          name: name.trim(),
          description: description.trim() || undefined,
          sku: !useVariants && productSku.trim() ? productSku.trim() : undefined,
          listPriceMinor: toMinor(listPrice),
          salePriceMinor: salePrice ? toMinor(salePrice) : undefined,
          status,
          isMarketplaceListed,
          options: useVariants ? buildOptionsPayload() : undefined,
          variants: buildVariantsPayload(),
        }

        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError((body as { error?: string }).error ?? "Failed to create product.")
          return
        }
      } else {
        // Edit: update base product fields
        const productPayload = {
          name: name.trim(),
          description: description.trim() || null,
          sku: !useVariants && productSku.trim() ? productSku.trim() : null,
          listPriceMinor: toMinor(listPrice),
          salePriceMinor: salePrice ? toMinor(salePrice) : null,
          status,
          isMarketplaceListed,
        }
        const res = await fetch(`/api/products/${initialData!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productPayload),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError((body as { error?: string }).error ?? "Failed to update product.")
          return
        }

        // Update each existing variant
        for (const v of generatedVariants) {
          const ov = variantOverrides.get(v.comboKey)
          if (!ov) continue
          if (v.variantId) {
            await fetch(`/api/products/${initialData!.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                variantOp: "update",
                data: {
                  variantId: v.variantId,
                  name: v.name,
                  sku: ov.sku.trim(),
                  optionSummary: Object.entries(v.selectedOptions)
                    .map(([k, val]) => `${k}: ${val}`)
                    .join(" / ") || null,
                  priceMinor: toMinor(ov.price),
                  compareAtMinor: ov.compareAtPrice
                    ? toMinor(ov.compareAtPrice)
                    : null,
                  isDefault: ov.isDefault,
                  isActive: true,
                },
              }),
            })
          } else if (ov.sku.trim()) {
            // New combo added during edit
            await fetch(`/api/products/${initialData!.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                variantOp: "add",
                data: {
                  name: v.name,
                  sku: ov.sku.trim(),
                  optionSummary: Object.entries(v.selectedOptions)
                    .map(([k, val]) => `${k}: ${val}`)
                    .join(" / ") || undefined,
                  priceMinor: toMinor(ov.price),
                  compareAtMinor: ov.compareAtPrice
                    ? toMinor(ov.compareAtPrice)
                    : undefined,
                  isDefault: ov.isDefault,
                },
              }),
            })
          }
        }
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
      {/* Header */}
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
        {/* ── Left column ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          {/* Product info */}
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

              <Field label="Description" hint="Displayed on the product page.">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the product…"
                  rows={4}
                  className={cn(FIELD, "h-auto resize-none py-2.5 leading-relaxed")}
                />
              </Field>
            </div>
          </Card>

          {/* Pricing */}
          <Card title="Pricing" icon={PencilEdit01Icon}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="List price" required hint={`Base price (${currencyCode}).`}>
                <PriceInput
                  symbol={currSymbol}
                  value={listPrice}
                  onChange={setListPrice}
                />
              </Field>
              <Field
                label="Sale price"
                hint="Optional compare-at / original price."
              >
                <PriceInput
                  symbol={currSymbol}
                  value={salePrice}
                  onChange={setSalePrice}
                />
              </Field>
            </div>

            {!useVariants && (
              <Field label="SKU" hint="Your internal product code.">
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

          {/* Variants */}
          <Card title="Options &amp; Variants">
            <div className="flex flex-col gap-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={useVariants}
                  onChange={(e) => toggleUseVariants(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border/70 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">
                    This product has multiple options
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    e.g. different sizes, colors, or materials. Each combination
                    becomes a variant with its own SKU and price.
                  </p>
                </div>
              </label>

              {useVariants && (
                <OptionGroupsEditor
                  groups={optionGroups}
                  onAdd={addOptionGroup}
                  onRemove={removeOptionGroup}
                  onUpdate={updateOptionGroup}
                  maxGroups={3}
                />
              )}

              {useVariants && generatedVariants.length > 0 && (
                <VariantMatrix
                  variants={generatedVariants}
                  overrides={variantOverrides}
                  currSymbol={currSymbol}
                  onUpdate={updateVariantOverride}
                />
              )}
            </div>
          </Card>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          <Card title="Status">
            <div className="flex flex-col gap-3">
              {(
                [
                  { value: "DRAFT", label: "Draft", desc: "Not visible to customers." },
                  { value: "ACTIVE", label: "Active", desc: "Visible and purchasable." },
                  { value: "ARCHIVED", label: "Archived", desc: "Hidden from store." },
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
                  Make this product discoverable to buyers on the ewatrade
                  marketplace.
                </p>
              </div>
            </label>
          </Card>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}

// ── OptionGroupsEditor ────────────────────────────────────────────────────────

type OptionGroupsEditorProps = {
  groups: OptionGroup[]
  maxGroups: number
  onAdd: () => void
  onRemove: (tempId: string) => void
  onUpdate: (tempId: string, field: "name" | "rawValues", value: string) => void
}

function OptionGroupsEditor({
  groups,
  maxGroups,
  onAdd,
  onRemove,
  onUpdate,
}: OptionGroupsEditorProps) {
  const FIELD_SM =
    "h-9 rounded-xl border border-border/70 bg-background px-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Option groups
      </p>

      {groups.map((g, idx) => {
        const parsedCount = parseValues(g.rawValues).length
        return (
          <div
            key={g.tempId}
            className="flex items-start gap-3 rounded-xl border border-border/70 p-3"
          >
            <div className="flex flex-1 flex-col gap-2">
              <div className="grid grid-cols-[140px_1fr] gap-2">
                <input
                  type="text"
                  value={g.name}
                  onChange={(e) => onUpdate(g.tempId, "name", e.target.value)}
                  placeholder={["Size", "Color", "Material"][idx] ?? "Option"}
                  className={FIELD_SM}
                />
                <input
                  type="text"
                  value={g.rawValues}
                  onChange={(e) => onUpdate(g.tempId, "rawValues", e.target.value)}
                  placeholder="S, M, L, XL"
                  className={FIELD_SM}
                />
              </div>
              {parsedCount > 0 && (
                <div className="flex flex-wrap gap-1">
                  {parseValues(g.rawValues).map((v) => (
                    <span
                      key={v}
                      className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {groups.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(g.tempId)}
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <HugeiconsIcon icon={Delete01Icon} className="size-3.5" />
              </button>
            )}
          </div>
        )
      })}

      {groups.length < maxGroups && (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-xl border border-dashed border-border/70 px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Add another option
        </button>
      )}
    </div>
  )
}

// ── VariantMatrix ─────────────────────────────────────────────────────────────

type VariantMatrixProps = {
  variants: VariantRow[]
  overrides: Map<string, { sku: string; price: string; compareAtPrice: string; isDefault: boolean; variantId?: string }>
  currSymbol: string
  onUpdate: (
    key: string,
    field: "sku" | "price" | "compareAtPrice" | "isDefault",
    value: string | boolean,
  ) => void
}

function VariantMatrix({
  variants,
  overrides,
  currSymbol,
  onUpdate,
}: VariantMatrixProps) {
  const CELL =
    "h-9 w-full rounded-xl border border-border/70 bg-background px-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {variants.length} variant{variants.length !== 1 ? "s" : ""} generated
        </p>
        <p className="text-xs text-muted-foreground">
          Fill in a SKU for each — price defaults to the list price above.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/30">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Variant
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                SKU <span className="text-destructive">*</span>
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Price
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Compare at
              </th>
              <th className="w-16 px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                Default
              </th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const ov = overrides.get(v.comboKey)
              return (
                <tr
                  key={v.comboKey}
                  className={cn(
                    "border-b border-border/50 last:border-0",
                    ov?.isDefault && "bg-primary/5",
                  )}
                >
                  <td className="px-3 py-2">
                    <span className="font-medium">{v.name}</span>
                    {ov?.variantId && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        (saved)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      required
                      value={ov?.sku ?? ""}
                      onChange={(e) =>
                        onUpdate(v.comboKey, "sku", e.target.value)
                      }
                      placeholder="SKU-001"
                      className={cn(CELL, !ov?.sku?.trim() && "border-destructive/40")}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {currSymbol}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={ov?.price ?? ""}
                        onChange={(e) =>
                          onUpdate(v.comboKey, "price", e.target.value)
                        }
                        placeholder="0"
                        className={cn(CELL, "pl-6")}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {currSymbol}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={ov?.compareAtPrice ?? ""}
                        onChange={(e) =>
                          onUpdate(v.comboKey, "compareAtPrice", e.target.value)
                        }
                        placeholder="0"
                        className={cn(CELL, "pl-6")}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name="default-variant"
                      checked={ov?.isDefault ?? false}
                      onChange={() => onUpdate(v.comboKey, "isDefault", true)}
                      className="accent-primary"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function PriceInput({
  symbol,
  value,
  onChange,
}: {
  symbol: string
  value: string
  onChange: (v: string) => void
}) {
  const FIELD_BASE =
    "h-10 rounded-xl border border-border/70 bg-background text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-4 focus:ring-primary/10 w-full"
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {symbol}
      </span>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className={cn(FIELD_BASE, "pl-7")}
      />
    </div>
  )
}

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
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  )
}
