import type { GettingStartedAction } from "@/lib/dashboard-overview"
import { ArrowRight01Icon, SparklesIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"

export function GettingStarted({
  actions,
}: {
  actions: GettingStartedAction[]
}) {
  if (actions.length === 0) return null

  return (
    <section className="border-y border-border bg-background">
      <div className="flex items-start gap-3 border-b border-border px-4 py-5 sm:px-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HugeiconsIcon icon={SparklesIcon} className="size-4" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">
            Set up your business
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with the records you need. More tools appear as your business
            begins using them.
          </p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {actions.map((action) =>
          action.disabled ? (
            <div
              key={action.href}
              aria-disabled="true"
              className="flex items-center gap-3 px-4 py-4 opacity-55 sm:px-5"
            >
              <ActionCopy action={action} />
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="size-4 shrink-0 text-muted-foreground"
              />
            </div>
          ) : (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center gap-3 px-4 py-4 transition hover:bg-muted/50 sm:px-5"
            >
              <ActionCopy action={action} />
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="size-4 shrink-0 text-muted-foreground"
              />
            </Link>
          ),
        )}
      </div>
    </section>
  )
}

function ActionCopy({ action }: { action: GettingStartedAction }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-foreground">{action.label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {action.description}
      </p>
    </div>
  )
}
