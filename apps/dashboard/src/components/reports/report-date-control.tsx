"use client"

import { DateRangeFilter } from "@/components/date-range-filter"
import {
  REPORT_RANGE_MAX_DAYS,
  REPORT_RANGE_PRESETS,
  type ReportRange,
  formatReportPresetShort,
  formatReportRangeDates,
  matchReportRangePreset,
  reportPresetRange,
} from "@/lib/report-range"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  cn,
} from "@ewatrade/ui"
import { Calendar03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

const segment =
  "h-11 min-w-0 rounded-none border-0 px-2 font-normal shadow-none sm:px-4 aria-pressed:bg-primary aria-pressed:font-medium aria-pressed:text-primary-foreground"

/**
 * Report period buttons: Today, 7, 30 and 90 days, then a calendar button for
 * other dates (up to 366). Whole UTC days with an exclusive end. On phones the
 * five buttons share the full width.
 */
export function ReportDateControl({
  onChange,
  range,
}: {
  onChange: (range: ReportRange) => void
  range: ReportRange
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<{
    start: string | null
    end: string | null
  }>({ start: dateOnly(range.from), end: dateOnly(range.to) })
  const preset = matchReportRangePreset(range)
  const days =
    draft.start && draft.end
      ? (utcDate(draft.end).getTime() - utcDate(draft.start).getTime()) /
        86_400_000
      : 0
  const valid = days > 0 && days <= REPORT_RANGE_MAX_DAYS
  const customLabel = preset ? "Dates" : formatReportRangeDates(range)

  return (
    <div className="grid w-full min-w-0 gap-1.5 sm:w-fit">
      <fieldset
        aria-label="Period"
        className="m-0 grid w-full min-w-0 grid-cols-5 divide-x divide-border overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-control-border)] bg-background p-0 sm:flex sm:w-fit"
      >
        {REPORT_RANGE_PRESETS.map((option) => (
          <Button
            aria-pressed={preset === option}
            className={segment}
            key={option}
            onClick={() => onChange(reportPresetRange(option))}
            title={formatReportRangeDates(reportPresetRange(option))}
            type="button"
            variant="ghost"
          >
            {formatReportPresetShort(option)}
          </Button>
        ))}
        <DropdownMenu
          onOpenChange={(next) => {
            setOpen(next)
            if (next)
              setDraft({ start: dateOnly(range.from), end: dateOnly(range.to) })
          }}
          open={open}
        >
          <DropdownMenuTrigger
            aria-label={
              preset
                ? "Pick dates"
                : `Dates: ${formatReportRangeDates(range)}. Pick dates`
            }
            aria-pressed={!preset}
            render={
              <Button
                className={cn(segment, "gap-1.5")}
                type="button"
                variant="ghost"
              />
            }
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="size-5 shrink-0 sm:size-4"
              icon={Calendar03Icon}
            />
            <span className="max-sm:sr-only truncate">{customLabel}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            appearance="dashboard"
            className="max-w-[calc(100vw-32px)] p-0"
            sideOffset={8}
          >
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
              >
                Show these dates
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </fieldset>
      {preset ? null : (
        <p className="text-sm text-muted-foreground sm:hidden">
          {formatReportRangeDates(range)}
        </p>
      )}
    </div>
  )
}
