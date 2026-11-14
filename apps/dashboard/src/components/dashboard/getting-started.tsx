"use client"

import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import type { GettingStartedAction } from "@/lib/dashboard-overview"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"

const ROW =
  "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left font-medium sm:px-5"

/** Overview before the first order: a short list of first steps. */
export function GettingStarted({
  actions,
}: {
  actions: GettingStartedAction[]
}) {
  const { setParams } = useCatalogItemParams()
  if (actions.length === 0) return null
  const arrow = (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      className="ml-auto size-5 shrink-0 text-muted-foreground"
    />
  )
  return (
    <section
      aria-labelledby="getting-started-title"
      className="overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      <h2
        id="getting-started-title"
        className="border-b border-border px-4 py-4 text-lg font-semibold sm:px-5"
      >
        Set up your business
      </h2>
      <ul className="divide-y divide-border">
        {actions.map((action) => (
          <li key={action.href}>
            {action.disabled ? (
              <div aria-disabled="true" className={`${ROW} opacity-55`}>
                {action.label}
                {arrow}
              </div>
            ) : action.catalogCreateKind ? (
              <button
                type="button"
                className={`${ROW} hover:bg-[var(--hover)]`}
                onClick={() => {
                  void setParams({
                    catalogItem: "create",
                    catalogCreateKind: action.catalogCreateKind,
                  })
                }}
              >
                {action.label}
                {arrow}
              </button>
            ) : (
              <Link
                href={action.href}
                className={`${ROW} hover:bg-[var(--hover)]`}
              >
                {action.label}
                {arrow}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
