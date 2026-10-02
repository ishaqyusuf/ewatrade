"use client"

import { DateRangeFilter } from "@/components/date-range-filter"
import { parseDateOnly } from "@/lib/date-range"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { Calendar03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useState } from "react"

export function DateRangeControl({
  end,
  endExclusive = false,
  label = "Date range",
  maxDays,
  min,
  onApply,
  start,
}: {
  end: string
  endExclusive?: boolean
  label?: string
  maxDays?: number
  min?: string
  onApply: (range: { start: string; end: string }) => void
  start: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{
    start: string | null
    end: string | null
  }>({ start, end })
  useEffect(() => setDraft({ start, end }), [start, end])
  const from = parseDateOnly(draft.start)
  const through = parseDateOnly(draft.end)
  const valid = Boolean(
    from &&
      through &&
      (endExclusive ? through > from : through >= from) &&
      (!min || (draft.start && draft.start >= min)) &&
      (!maxDays ||
        (draft.start &&
          draft.end &&
          (Date.parse(draft.end) - Date.parse(draft.start)) / 86400000 <=
            maxDays)),
  )
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setDraft({ start, end })
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-9 max-w-full rounded-none"
          />
        }
        aria-label={label}
      >
        <HugeiconsIcon icon={Calendar03Icon} className="size-4" />
        <span className="truncate">
          {start} – {end}
          {endExclusive ? " (exclusive)" : ""}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        appearance="dashboard"
        className="max-w-[calc(100vw-32px)] p-0"
        align="start"
        sideOffset={8}
      >
        <DateRangeFilter
          start={draft.start}
          end={draft.end}
          endExclusive={endExclusive}
          min={min}
          onSelect={setDraft}
        />
        <div className="flex items-center justify-end border-t border-border p-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-none"
            disabled={!valid}
            onClick={() => {
              if (valid && draft.start && draft.end) {
                onApply({ start: draft.start, end: draft.end })
                setOpen(false)
              }
            }}
          >
            Apply range
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
