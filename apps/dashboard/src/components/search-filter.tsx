"use client"

import { type FilterChip, FilterList } from "@/components/filter-list"
import { SearchField } from "@/components/search-field"
import {
  type MobileFilters,
  SearchFilterSheet,
} from "@/components/search-filter-sheet"
import { useMobileOverlay } from "@/hooks/use-mobile-overlay"
import { cn } from "@/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Sheet,
} from "@ewatrade/ui"
import { FilterHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { type ReactNode, useEffect, useRef, useState } from "react"

export function SearchFilter({
  children,
  filters = [],
  maxLength = 160,
  mobileFilters,
  onClear,
  onSearch,
  placeholder,
  value,
}: {
  children: ReactNode
  filters?: FilterChip[]
  maxLength?: number
  mobileFilters: MobileFilters
  onClear: () => void
  onSearch: (value: string) => void
  placeholder: string
  value: string
}) {
  const mobile = useMobileOverlay()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!mobile) setSheetOpen(false)
    if (mobile) setOpen(false)
  }, [mobile])
  const searchRef = useRef<HTMLFormElement>(null)
  function clear() {
    setOpen(false)
    onClear()
  }
  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <DropdownMenu open={open} onOpenChange={setOpen} zIndex={40}>
        <div className="flex w-full min-w-0 flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchField
            ref={searchRef}
            maxLength={maxLength}
            className="sm:max-w-[350px] sm:shrink-0 max-md:[&_input]:h-11 max-md:[&>svg]:top-[14px]"
            placeholder={placeholder}
            value={value}
            onSearch={onSearch}
            onClear={clear}
            submit
          >
            {mobile ? (
              <button
                type="button"
                ref={triggerRef}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen(true)}
                aria-label={`Filter ${placeholder.replace(/^Search /i, "").replace(/\.\.\.$/, "")}`}
                className={cn(
                  "absolute right-0 top-0 flex size-11 items-center justify-center opacity-50 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
                  (filters.length > 0 || sheetOpen) && "opacity-100",
                )}
              >
                <HugeiconsIcon icon={FilterHorizontalIcon} className="size-4" />
                {filters.length ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-foreground text-[9px] font-medium text-background"
                  >
                    {filters.length}
                  </span>
                ) : null}
              </button>
            ) : (
              <DropdownMenuTrigger
                aria-label={`Filter ${placeholder.replace(/^Search /i, "").replace(/\.\.\.$/, "")}`}
                className={cn(
                  "absolute right-0 top-0 flex size-9 items-center justify-center opacity-50 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
                  (filters.length > 0 || open) && "opacity-100",
                )}
              >
                <HugeiconsIcon icon={FilterHorizontalIcon} className="size-4" />
              </DropdownMenuTrigger>
            )}
          </SearchField>
          <FilterList filters={filters} onClear={clear} />
        </div>
        <DropdownMenuContent
          anchor={searchRef}
          appearance="dashboard"
          className="w-(--anchor-width) max-w-[calc(100vw-32px)]"
          sideOffset={0}
          align="start"
        >
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
      {mobile && sheetOpen ? (
        <SearchFilterSheet
          config={mobileFilters}
          triggerRef={triggerRef}
          onApplied={() => setSheetOpen(false)}
        />
      ) : null}
    </Sheet>
  )
}
