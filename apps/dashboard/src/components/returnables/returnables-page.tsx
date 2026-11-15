"use client"

import { PageTitleHeading } from "@/components/dashboard/page-title"
import { MetricCard } from "@/components/reports/metric-card"
import { ScrollableContent } from "@/components/scrollable-content"
import {
  Alert,
  AlertDescription,
  Button,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from "@ewatrade/ui"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowTurnBackwardIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { useState } from "react"
import {
  RecordReturnDialog,
  type RecordReturnTarget,
} from "./record-return-dialog"
import { ReturnableBadge } from "./returnable-badge"
import {
  RETURNABLES_LATE_DAYS,
  daysOut,
  daysOutLabel,
  returnableCount,
  useReturnableBalances,
  useReturnableItems,
  useReturnableSummary,
} from "./use-returnables"

/** Every customer still holding returnables, biggest first. */
export function ReturnablesPage({
  canSeeStatements,
}: {
  canSeeStatements: boolean
}) {
  const balances = useReturnableBalances({})
  const [lateOnly, setLateOnly] = useState(false)
  const [target, setTarget] = useState<RecordReturnTarget | null>(null)
  const rows = balances.data ?? []
  const isLate = (row: (typeof rows)[number]) =>
    daysOut(row.oldestOutAt) > RETURNABLES_LATE_DAYS
  const shown = lateOnly ? rows.filter(isLate) : rows
  const itemNames = [...new Set(rows.map((row) => row.itemName))]
  const customers = new Set(rows.map((row) => row.customerId)).size
  const late = rows.filter(isLate)

  return (
    <ScrollableContent>
      <div className="flex min-w-0 flex-col gap-6 py-6">
        <header className="grid gap-3">
          <Link
            href="/customers"
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            Customers
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PageTitleHeading title="Returnables" />
            {rows.length ? (
              <Button onClick={() => setTarget({})}>
                <HugeiconsIcon
                  icon={ArrowTurnBackwardIcon}
                  className="size-4"
                />
                Record return
              </Button>
            ) : null}
          </div>
        </header>

        {balances.isError ? (
          <Alert appearance="dashboard" variant="destructive" role="alert">
            <AlertDescription>Couldn’t load returnables.</AlertDescription>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void balances.refetch()}
            >
              Try again
            </Button>
          </Alert>
        ) : balances.isPending ? (
          <output className="grid gap-3" aria-label="Loading returnables">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </output>
        ) : !rows.length ? (
          <div className="grid justify-items-center gap-2 rounded-xl border border-border px-4 py-10 text-center">
            <ReturnableBadge />
            <p className="font-semibold">Nothing out with customers</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Crates and other returnables sent with orders show here until they
              come back.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {itemNames.map((name) => (
                <MetricCard
                  key={name}
                  label={`${name} out`}
                  value={rows
                    .filter((row) => row.itemName === name)
                    .reduce((sum, row) => sum + row.out, 0)}
                />
              ))}
              <MetricCard
                label="Customers holding"
                value={customers}
                hint={
                  late.length
                    ? `${late.length} over ${RETURNABLES_LATE_DAYS} days`
                    : undefined
                }
              />
            </div>
            <ToggleGroup
              value={[lateOnly ? "late" : "all"]}
              onValueChange={(values) => {
                if (values.length) setLateOnly(values[0] === "late")
              }}
              variant="outline"
              aria-label="Filter returnables"
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="late">
                {`Over ${RETURNABLES_LATE_DAYS} days`}
              </ToggleGroupItem>
            </ToggleGroup>
            <section
              aria-label="Customers holding returnables"
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <div
                aria-hidden="true"
                className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_6rem_9.5rem] gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground md:grid"
              >
                <span>Customer</span>
                <span>Item</span>
                <span className="text-right">Out</span>
                <span className="text-right">Oldest</span>
                <span />
              </div>
              {shown.length ? (
                <ul className="divide-y divide-border">
                  {shown.map((row) => {
                    const days = daysOut(row.oldestOutAt)
                    return (
                      <li
                        key={`${row.customerId}:${row.catalogItemId}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_6rem_9.5rem]"
                      >
                        <div className="min-w-0">
                          {canSeeStatements ? (
                            <Link
                              href={`/customers/${encodeURIComponent(row.customerId)}/statement`}
                              className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                            >
                              {row.customerName}
                            </Link>
                          ) : (
                            <p className="truncate text-sm font-medium">
                              {row.customerName}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground md:hidden">
                            {`${returnableCount(row.out, row.itemName)} · ${daysOutLabel(days)}`}
                          </p>
                        </div>
                        <p className="hidden min-w-0 truncate text-sm md:block">
                          {row.itemName}
                          {row.orderCount ? (
                            <span className="text-muted-foreground">
                              {` · ${row.orderCount} ${row.orderCount === 1 ? "order" : "orders"}`}
                            </span>
                          ) : null}
                        </p>
                        <p className="hidden text-right text-sm font-semibold tabular-nums md:block">
                          {row.out}
                        </p>
                        <p
                          className={cn(
                            "hidden text-right text-sm md:block",
                            days > RETURNABLES_LATE_DAYS
                              ? "font-medium text-amber-700 dark:text-amber-300"
                              : "text-muted-foreground",
                          )}
                        >
                          {daysOutLabel(days)}
                        </p>
                        <div className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setTarget({
                                catalogItemId: row.catalogItemId,
                                customerId: row.customerId,
                              })
                            }
                          >
                            Record return
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {`Nothing out over ${RETURNABLES_LATE_DAYS} days.`}
                </p>
              )}
            </section>
          </>
        )}
      </div>
      {target ? (
        <RecordReturnDialog target={target} onClose={() => setTarget(null)} />
      ) : null}
    </ScrollableContent>
  )
}

/** Customers directory: a way into Returnables for businesses that use them. */
export function ReturnablesEntry() {
  const items = useReturnableItems()
  // One aggregate, not every customer's balances.
  const balances = useReturnableSummary(Boolean(items.data?.length))
  if (!items.data?.length) return null
  const out = balances.data?.out ?? 0
  const customers = balances.data?.customers ?? 0
  return (
    <Link
      href="/customers/returnables"
      className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <ReturnableBadge />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Returnables</span>
        <span className="block text-xs text-muted-foreground">
          {balances.isPending
            ? "Checking what customers hold…"
            : out
              ? `${out} out with ${customers} ${customers === 1 ? "customer" : "customers"}`
              : "Nothing out with customers"}
        </span>
      </span>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        className="size-4 text-muted-foreground"
      />
    </Link>
  )
}
