"use client"

import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { cn } from "@/utils"

const TABS = [
  { value: "work", label: "Jobs" },
  { value: "requests", label: "Customer requests" },
] as const

/** Jobs and Customer requests are two pages of Service jobs (managers see both). */
export function ServiceTabs() {
  const { tab, setParams } = useServiceWorkParams()
  return (
    <nav aria-label="Service jobs" className="min-w-0 border-b border-border">
      <ul className="flex gap-6 overflow-x-auto scrollbar-hide">
        {TABS.map((item) => {
          const active = tab === item.value
          return (
            <li key={item.value} className="shrink-0">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() =>
                  void setParams({
                    serviceTab: item.value === "requests" ? "requests" : null,
                    jobId: null,
                    requestId: null,
                    serviceSheet: null,
                    jobStep: null,
                  })
                }
                className={cn(
                  "relative inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground",
                  active &&
                    "font-medium text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground",
                )}
              >
                {item.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
