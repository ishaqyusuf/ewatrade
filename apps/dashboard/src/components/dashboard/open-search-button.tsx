"use client"

import { Button } from "@ewatrade/ui"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useState } from "react"

const KBD_CLASS =
  "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center rounded-[calc(var(--radius)-2px)] border border-border bg-background px-[5px] text-[11px] font-medium leading-none text-muted-foreground"

function useModifierKeyLabel() {
  const [label, setLabel] = useState("⌘")
  useEffect(() => {
    try {
      const platform =
        (navigator as Navigator & { userAgentData?: { platform?: string } })
          .userAgentData?.platform ?? navigator.platform
      if (!/mac|iphone|ipad|ipod/i.test(platform)) setLabel("Ctrl")
    } catch {
      // Keep the ⌘ hint when the platform can't be read.
    }
  }, [])
  return label
}

export function OpenSearchButton({ onClick }: { onClick: () => void }) {
  const modifier = useModifierKeyLabel()

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 md:hidden"
        onClick={onClick}
        aria-label="Open dashboard search"
        aria-keyshortcuts="Meta+K Control+K /"
      >
        <HugeiconsIcon icon={Search01Icon} className="size-[18px]" />
      </Button>
      <button
        type="button"
        className="hidden h-9 w-full min-w-0 items-center gap-2.5 rounded-[calc(var(--radius)+2px)] border border-border bg-muted pr-[7px] pl-3 text-left text-sm text-muted-foreground outline-none transition-colors hover:border-primary/45 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 md:flex"
        onClick={onClick}
        aria-label="Open dashboard search"
        aria-keyshortcuts="Meta+K Control+K /"
      >
        <HugeiconsIcon icon={Search01Icon} className="size-[18px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          Search orders, customers, products…
        </span>
        <span aria-hidden="true" className="hidden shrink-0 gap-1 lg:flex">
          <kbd className={KBD_CLASS}>{modifier}</kbd>
          <kbd className={KBD_CLASS}>K</kbd>
        </span>
      </button>
    </>
  )
}
