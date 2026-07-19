"use client"

import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { Button } from "@ewatrade/ui"
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function ServiceWorkHeader({
  canManage,
  storeName,
}: {
  canManage: boolean
  storeName: string
}) {
  const { query, setParams } = useServiceWorkParams()

  return (
    <header className="grid gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{storeName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Service work
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an order, then track only the work that needs tracking.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button
              variant="outline"
              onClick={() => setParams({ serviceSheet: "request" })}
            >
              Request link
            </Button>
          ) : null}
          <Button onClick={() => setParams({ serviceSheet: "intake" })}>
            <HugeiconsIcon icon={Add01Icon} className="mr-2 size-4" />
            New service
          </Button>
        </div>
      </div>
      <label className="relative max-w-xl">
        <span className="sr-only">Search service work</span>
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          value={query}
          onChange={(event) =>
            setParams({ serviceQuery: event.target.value || null })
          }
          placeholder="Search work"
        />
      </label>
    </header>
  )
}
