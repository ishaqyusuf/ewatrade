"use client"

import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import type { GettingStartedAction } from "@/lib/dashboard-overview"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"

const stepRow =
  "grid w-full grid-cols-[1.75rem_minmax(0,1fr)_1rem] items-center gap-3 rounded-lg p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"

/** Numbered setup checklist; takes the Recent orders column until the first order. */
export function GettingStarted({
  actions,
}: {
  actions: GettingStartedAction[]
  store: { businessProfileKey: string | null; currencyCode: string; id: string }
}) {
  const { setParams } = useCatalogItemParams()
  if (actions.length === 0) return null

  return (
    <section
      aria-labelledby="overview-getting-started"
      className="min-w-0 rounded-xl border border-border bg-card text-card-foreground shadow-xs dark:shadow-none"
    >
      <div className="px-4 pt-4 pb-2 sm:px-5">
        <h2
          id="overview-getting-started"
          className="text-[0.9375rem] font-semibold"
        >
          Set up your business
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Start with the records you need for your business.
        </p>
      </div>

      <ol className="px-1.5 pb-1.5">
        {actions.map((action, index) => (
          <li key={action.href}>
            {action.disabled ? (
              <div
                aria-disabled="true"
                className={`${stepRow} cursor-not-allowed opacity-55`}
              >
                <StepCopy action={action} step={index + 1} />
              </div>
            ) : action.catalogCreateKind ? (
              <button
                type="button"
                className={`${stepRow} hover:bg-muted`}
                onClick={() => {
                  void setParams({
                    catalogItem: "create",
                    catalogCreateKind: action.catalogCreateKind,
                  })
                }}
              >
                <StepCopy action={action} step={index + 1} />
              </button>
            ) : (
              <Link href={action.href} className={`${stepRow} hover:bg-muted`}>
                <StepCopy action={action} step={index + 1} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function StepCopy({
  action,
  step,
}: {
  action: GettingStartedAction
  step: number
}) {
  return (
    <>
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted-foreground tabular-nums"
      >
        {step}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">
          {action.label}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {action.description}
        </span>
      </span>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        className="size-4 text-muted-foreground"
      />
    </>
  )
}
