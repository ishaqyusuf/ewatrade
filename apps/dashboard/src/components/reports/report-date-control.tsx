"use client"

import { DateRangeFilter } from "@/components/date-range-filter"
import {
  REPORT_RANGE_MAX_DAYS,
  REPORT_RANGE_PRESETS,
  type ReportRange,
  formatReportRangeDates,
  formatReportRangeName,
  matchReportRangePreset,
  reportPresetRange,
} from "@/lib/report-range"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { ArrowDown01Icon, Calendar03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

/**
 * The Reports date button: Last 7, 30 or 90 days, then Custom dates with the
 * shared calendar. Ranges are whole UTC days with an exclusive end.
 */
export function ReportDateControl({
  onChange,
  range,
}: {
  onChange: (range: ReportRange) => void
  range: ReportRange
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const [draft, setDraft] = useState<{
    start: string | null
    end: string | null
  }>({ start: dateOnly(range.from), end: dateOnly(range.to) })
  const preset = matchReportRangePreset(range)
  const name = formatReportRangeName(range)
  const dates = formatReportRangeDates(range)
  const days =
    draft.start && draft.end
      ? (utcDate(draft.end).getTime() - utcDate(draft.start).getTime()) /
        86_400_000
      : 0
  const valid = days > 0 && days <= REPORT_RANGE_MAX_DAYS

  return (
    <DropdownMenu
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setCustom(false)
          setDraft({ start: dateOnly(range.from), end: dateOnly(range.to) })
        }
      }}
      open={open}
    >
      <DropdownMenuTrigger
        aria-label={`Dates: ${name}, ${dates}. Choose dates`}
        render={
          <Button
            className="h-9 max-w-full rounded-none"
            type="button"
            variant="outline"
          />
        }
      >
        <HugeiconsIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground"
          icon={Calendar03Icon}
        />
        <span className="truncate">
          {name}
          <span className="font-normal text-muted-foreground"> · {dates}</span>
        </span>
        <HugeiconsIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground"
          icon={ArrowDown01Icon}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        appearance="dashboard"
        className={custom ? "max-w-[calc(100vw-32px)] p-0" : "min-w-64"}
        sideOffset={8}
      >
        {custom ? (
          <>
            <DateRangeFilter
              end={draft.end}
              endExclusive
              onSelect={setDraft}
              start={draft.start}
            />
            <div className="flex items-center justify-end gap-2 border-t border-border p-2">
              <p className="mr-auto px-1 text-xs text-muted-foreground">
                Up to {REPORT_RANGE_MAX_DAYS} days
              </p>
              <Button
                className="h-9 rounded-none"
                onClick={() => setCustom(false)}
                type="button"
                variant="ghost"
              >
                Back
              </Button>
              <Button
                className="h-9 rounded-none"
                disabled={!valid}
                onClick={() => {
                  if (!valid || !draft.start || !draft.end) return
                  onChange({
                    from: utcDate(draft.start),
                    to: utcDate(draft.end),
                  })
                  setOpen(false)
                }}
                type="button"
                variant="outline"
              >
                Apply dates
              </Button>
            </div>
          </>
        ) : (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Show</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                aria-label="Dates"
                onValueChange={(value) => {
                  const next = REPORT_RANGE_PRESETS.find(
                    (option) => String(option) === value,
                  )
                  if (next) onChange(reportPresetRange(next))
                }}
                value={preset ? String(preset) : ""}
              >
                {REPORT_RANGE_PRESETS.map((option) => (
                  <DropdownMenuRadioItem
                    closeOnClick
                    key={option}
                    value={String(option)}
                  >
                    <span className="flex-1">Last {option} days</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {formatReportRangeDates(reportPresetRange(option))}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              closeOnClick={false}
              onClick={() => setCustom(true)}
            >
              <HugeiconsIcon aria-hidden="true" icon={Calendar03Icon} />
              <span className="flex-1">Custom dates…</span>
              <span className="text-xs font-normal text-muted-foreground">
                Up to {REPORT_RANGE_MAX_DAYS} days
              </span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
