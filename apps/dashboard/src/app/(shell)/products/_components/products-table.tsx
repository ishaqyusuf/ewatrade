"use client"

import { cn } from "@/utils"
import {
  Archive01Icon,
  CheckmarkSquare01Icon,
  Delete01Icon,
  EyeIcon,
  FilterIcon,
  MoreHorizontalIcon,
  Package01Icon,
  PencilEdit01Icon,
  TaskAdd01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductRow = {
  id: string
  name: string
  slug: string
  sku: string | null
  status: "DRAFT" | "ACTIVE" | "ARCHIVED"
  listPriceMinor: number
  salePriceMinor: number | null
  currencyCode: string
  isPublished: boolean
  isMarketplaceListed: boolean
  createdAt: string
  _count: { variants: number }
  variants: { inventoryItem: { onHandQuantity: number } | null }[]
}

type Props = {
  products: ProductRow[]
  currencyCode: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(minor: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(minor / 100)
  } catch {
    return `${currencyCode} ${(minor / 100).toLocaleString()}`
  }
}

function totalStock(
  variants: { inventoryItem: { onHandQuantity: number } | null }[],
): number {
  return variants.reduce(
    (sum, v) => sum + (v.inventoryItem?.onHandQuantity ?? 0),
    0,
  )
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
}

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  ARCHIVED: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
}

type StatusFilter = "ALL" | "DRAFT" | "ACTIVE" | "ARCHIVED"

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductsTable({ products, currencyCode }: Props) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const filtered =
    statusFilter === "ALL"
      ? products
      : products.filter((p) => p.status === statusFilter)

  const allSelected =
    filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id))
  const someSelected = filtered.some((p) => selectedIds.has(p.id))

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkAction(action: "publish" | "archive" | "delete") {
    if (selectedIds.size === 0) return
    const confirmed =
      action === "delete"
        ? window.confirm(
            `Delete ${selectedIds.size} product${selectedIds.size > 1 ? "s" : ""}? Products with order history cannot be deleted and will be skipped.`,
          )
        : true
    if (!confirmed) return

    setBulkLoading(true)
    try {
      await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action }),
      })
      setSelectedIds(new Set())
      router.refresh()
    } finally {
      setBulkLoading(false)
    }
  }

  async function quickAction(
    productId: string,
    action: "publish" | "archive" | "delete",
  ) {
    setOpenMenuId(null)
    if (action === "delete") {
      const ok = window.confirm(
        "Delete this product? Products with order history cannot be deleted.",
      )
      if (!ok) return
      await fetch(`/api/products/${productId}`, { method: "DELETE" })
    } else {
      await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "publish"
            ? { status: "ACTIVE", isPublished: true }
            : { status: "ARCHIVED", isPublished: false },
        ),
      })
    }
    router.refresh()
  }

  const counts = {
    ALL: products.length,
    ACTIVE: products.filter((p) => p.status === "ACTIVE").length,
    DRAFT: products.filter((p) => p.status === "DRAFT").length,
    ARCHIVED: products.filter((p) => p.status === "ARCHIVED").length,
  }

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: `All (${counts.ALL})` },
    { key: "ACTIVE", label: `Active (${counts.ACTIVE})` },
    { key: "DRAFT", label: `Draft (${counts.DRAFT})` },
    { key: "ARCHIVED", label: `Archived (${counts.ARCHIVED})` },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Status filter tabs */}
      <div className="flex items-center gap-1 border-b border-border/70">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setStatusFilter(tab.key)
              setSelectedIds(new Set())
            }}
            className={cn(
              "relative px-3 pb-2.5 pt-0.5 text-sm font-medium transition-colors",
              statusFilter === tab.key
                ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background px-4 py-2.5 shadow-sm">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => bulkAction("publish")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              <HugeiconsIcon icon={EyeIcon} className="size-3.5" />
              Publish
            </button>
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => bulkAction("archive")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20"
            >
              <HugeiconsIcon icon={Archive01Icon} className="size-3.5" />
              Archive
            </button>
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => bulkAction("delete")}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <HugeiconsIcon icon={Delete01Icon} className="size-3.5" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState statusFilter={statusFilter} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-muted/30">
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-border/70 accent-primary"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Product
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Price
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Variants
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Stock
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <HugeiconsIcon
                    icon={FilterIcon}
                    className="size-3.5"
                    title="Marketplace listed"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Added
                </th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const stock = totalStock(product.variants)
                const isSelected = selectedIds.has(product.id)

                return (
                  <tr
                    key={product.id}
                    className={cn(
                      "border-b border-border/50 last:border-0 transition-colors",
                      isSelected
                        ? "bg-primary/5"
                        : "hover:bg-muted/30",
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(product.id)}
                        className="h-4 w-4 cursor-pointer rounded border-border/70 accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${product.id}`}
                        className="group flex flex-col"
                      >
                        <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                          {product.name}
                        </span>
                        {product.sku && (
                          <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {product.sku}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">
                        {formatPrice(product.listPriceMinor, product.currencyCode)}
                      </span>
                      {product.salePriceMinor != null && (
                        <span className="ml-1.5 text-xs text-muted-foreground line-through">
                          {formatPrice(
                            product.salePriceMinor,
                            product.currencyCode,
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_CLASSES[product.status],
                        )}
                      >
                        {STATUS_LABELS[product.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {product._count.variants}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "tabular-nums",
                          stock === 0 ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {stock}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {product.isMarketplaceListed ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          Listed
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {new Date(product.createdAt).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(
                              openMenuId === product.id ? null : product.id,
                            )
                          }}
                          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <HugeiconsIcon
                            icon={MoreHorizontalIcon}
                            className="size-4"
                          />
                        </button>

                        {openMenuId === product.id && (
                          <>
                            {/* Backdrop */}
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenMenuId(null)}
                            />
                            <div className="absolute right-0 top-8 z-20 min-w-40 overflow-hidden rounded-xl border border-border/70 bg-background py-1 shadow-lg">
                              <Link
                                href={`/products/${product.id}`}
                                onClick={() => setOpenMenuId(null)}
                                className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted"
                              >
                                <HugeiconsIcon
                                  icon={PencilEdit01Icon}
                                  className="size-3.5 text-muted-foreground"
                                />
                                Edit
                              </Link>
                              {product.status !== "ACTIVE" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    quickAction(product.id, "publish")
                                  }
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted"
                                >
                                  <HugeiconsIcon
                                    icon={EyeIcon}
                                    className="size-3.5 text-muted-foreground"
                                  />
                                  Publish
                                </button>
                              )}
                              {product.status !== "ARCHIVED" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    quickAction(product.id, "archive")
                                  }
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted"
                                >
                                  <HugeiconsIcon
                                    icon={Archive01Icon}
                                    className="size-3.5 text-muted-foreground"
                                  />
                                  Archive
                                </button>
                              )}
                              <div className="my-1 border-t border-border/70" />
                              <button
                                type="button"
                                onClick={() =>
                                  quickAction(product.id, "delete")
                                }
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                              >
                                <HugeiconsIcon
                                  icon={Delete01Icon}
                                  className="size-3.5"
                                />
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ statusFilter }: { statusFilter: StatusFilter }) {
  const messages: Record<StatusFilter, { title: string; sub: string }> = {
    ALL: {
      title: "No products yet",
      sub: "Add your first product to start selling.",
    },
    ACTIVE: {
      title: "No active products",
      sub: "Publish a draft to make it visible on your store.",
    },
    DRAFT: {
      title: "No drafts",
      sub: "All your products are published or archived.",
    },
    ARCHIVED: {
      title: "No archived products",
      sub: "Archived products will appear here.",
    },
  }
  const msg = messages[statusFilter]

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/70 bg-background py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
        <HugeiconsIcon icon={Package01Icon} className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-foreground">{msg.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{msg.sub}</p>
      </div>
      {statusFilter === "ALL" && (
        <Link
          href="/products/new"
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <HugeiconsIcon icon={TaskAdd01Icon} className="size-4" />
          Add product
        </Link>
      )}
    </div>
  )
}
