"use client"

import { Button } from "@ewatrade/ui"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function OpenSearchButton({ onClick }: { onClick: () => void }) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-none md:hidden"
        onClick={onClick}
        aria-label="Open dashboard search"
        aria-keyshortcuts="Meta+K Control+K /"
      >
        <HugeiconsIcon icon={Search01Icon} className="size-[18px]" />
      </Button>
      <Button
        type="button"
        variant="outline"
        className="group relative hidden min-w-[250px] w-full justify-start border-0 bg-transparent p-0 text-sm font-normal text-muted-foreground hover:bg-transparent sm:pr-12 md:flex md:w-40 lg:w-64"
        onClick={onClick}
        aria-label="Open dashboard search"
        aria-keyshortcuts="Meta+K Control+K /"
      >
        <HugeiconsIcon icon={Search01Icon} className="mr-2 size-[18px]" />
        <span>Find anything...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 border bg-accent px-1.5 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
    </>
  )
}
