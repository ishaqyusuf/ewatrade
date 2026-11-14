"use client"

import { Button } from "@ewatrade/ui"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

/** The phone menu sheet opens the top bar's search with this window event. */
export const OPEN_DASHBOARD_SEARCH_EVENT = "ewatrade:open-search"

export function OpenSearchButton({ onClick }: { onClick: () => void }) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ml-auto size-11 shrink-0 md:hidden"
        onClick={onClick}
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K /"
      >
        <HugeiconsIcon icon={Search01Icon} className="size-5" />
      </Button>
      <button
        type="button"
        className="ml-3 hidden h-11 w-56 min-w-0 items-center gap-2.5 rounded-[10px] border border-[color:var(--input)] bg-background px-3 text-left text-sm text-muted-foreground transition-colors hover:border-foreground md:flex lg:ml-6 lg:w-[380px]"
        onClick={onClick}
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K /"
      >
        <HugeiconsIcon icon={Search01Icon} className="size-[18px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          Search orders, customers, items
        </span>
        <kbd className="pointer-events-none hidden shrink-0 rounded-[5px] border border-border px-1.5 py-0.5 font-sans text-xs font-semibold text-muted-foreground lg:inline">
          ⌘K
        </kbd>
      </button>
    </>
  )
}
