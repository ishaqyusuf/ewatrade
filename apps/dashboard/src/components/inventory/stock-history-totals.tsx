"use client"
import { useStockCategoryNames } from "@/components/inventory/stock-history-filters"
import { useInventoryLedgerParams } from "@/hooks/use-inventory-ledger-params"
import { useMobileOverlay } from "@/hooks/use-mobile-overlay"
import { useStockHistoryCategoryParams } from "@/hooks/use-stock-history-filter-params"
import {
  stockHistoryTotalsInput,
  stockNetChangeText,
  stockTotalsFromText,
  stockTotalsScopeNote,
} from "@/lib/inventory-labels"
import { useTRPC } from "@/trpc/client"
import { cn } from "@/utils"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import {
  ArrowDown01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useId, useState } from "react"

/**
 * Net change for the Store and category filter, between the toolbar and the
 * Stock history list. Search and the change group narrow only the list.
 * It starts closed, and is not added up, until opened or a category is
 * picked: most visits only need the list.
 */
export function StockHistoryTotals({
  storeId,
  storeLabel,
}: {
  storeId?: string
  storeLabel: string
}) {
  const trpc = useTRPC()
  const id = useId()
  const mobile = useMobileOverlay()
  const [chosenOpen, setOpen] = useState<boolean | null>(null)
  const [all, setAll] = useState(false)
  const { params } = useInventoryLedgerParams()
  const { filter } = useStockHistoryCategoryParams()
  const open =
    chosenOpen ?? (filter.uncategorized || filter.categoryNameIds.length > 0)
  const nameOf = useStockCategoryNames(filter.categoryNameIds)
  const totals = useQuery(
    trpc.inventory.operationTotals.queryOptions(
      stockHistoryTotalsInput({ storeId, categories: filter }),
      { enabled: open },
    ),
  )
  const scope = filter.uncategorized
    ? "Uncategorized"
    : filter.categoryNameIds.length
      ? filter.categoryNameIds.map(nameOf).join(" + ")
      : "All changes"
  const note = stockTotalsScopeNote({
    q: params.q,
    filter: params.filter,
    categories: filter.uncategorized
      ? "uncategorized"
      : filter.categoryNameIds.length
        ? "names"
        : "none",
    storeLabel,
  })
  const rows = totals.data?.rows ?? []
  const limit = mobile ? 2 : 3
  const shown = all ? rows : rows.slice(0, limit)
  return (
    <section
      aria-label="Net change"
      className="overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              "size-4 shrink-0 transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="font-medium">Net change</span>
          <span className="truncate text-muted-foreground">
            {scope} · {storeLabel}
          </span>
        </button>
        {open && totals.data ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {stockTotalsFromText(totals.data)}
          </span>
        ) : null}
      </div>
      <div id={id} hidden={!open} className="border-t border-border">
        {note ? (
          <p className="flex items-start gap-2 bg-[var(--hover)] px-4 py-2 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              className="mt-0.5 size-3.5 shrink-0"
            />
            <span>{note}</span>
          </p>
        ) : null}
        {totals.isPending ? (
          <output className="block px-4 py-3 text-sm text-muted-foreground">
            Adding up changes…
          </output>
        ) : totals.isError ? (
          <div role="alert" className="px-4 py-3 text-sm">
            Could not add up these changes.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => void totals.refetch()}
            >
              Try again
            </button>
          </div>
        ) : !rows.length ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            {filter.uncategorized || filter.categoryNameIds.length
              ? "No changes with these categories."
              : "No stock changes yet."}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {shown.map((row) => {
                const net = compareExactDecimals(row.netCanonicalQuantity, "0")
                return (
                  <li
                    key={`${row.storeId}:${row.variantId}:${row.configurationVersionId}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 px-4 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_8rem]"
                  >
                    <span className="min-w-0 truncate">
                      {row.productName ?? "Product"}
                      {row.variantName && row.variantName !== row.productName
                        ? ` · ${row.variantName}`
                        : ""}
                      {storeId ? null : (
                        <span className="text-muted-foreground">
                          {" "}
                          · {row.storeName ?? "Store"}
                        </span>
                      )}
                    </span>
                    <b
                      className={cn(
                        "font-medium tabular-nums",
                        net > 0 && "text-success-foreground",
                        net < 0 && "text-danger-foreground",
                      )}
                    >
                      {stockNetChangeText(
                        row.netCanonicalQuantity,
                        row.canonicalUnitName,
                      )}
                    </b>
                    <span className="text-xs text-muted-foreground max-sm:col-span-2 sm:text-right">
                      From {row.operationCount} change
                      {row.operationCount === 1 ? "" : "s"}
                    </span>
                  </li>
                )
              })}
            </ul>
            {rows.length > limit ? (
              <button
                type="button"
                aria-expanded={all}
                onClick={() => setAll(!all)}
                className="min-h-11 w-full border-t border-border px-4 text-left text-sm underline-offset-4 hover:underline"
              >
                {all ? "Show less" : `Show all ${rows.length}`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
