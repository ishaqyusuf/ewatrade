"use client"

import { useSmallScreen } from "@/hooks/use-small-screen"
import {
  formatDateOnly,
  getDatePresets,
  parseDateOnly,
  shiftDateOnly,
} from "@/lib/date-range"
import {
  Calendar,
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@ewatrade/ui"

export function DateRangeFilter({
  end,
  endExclusive = false,
  max,
  min,
  onSelect,
  start,
}: {
  end?: string | null
  endExclusive?: boolean
  max?: string
  min?: string
  onSelect: (range: { start: string | null; end: string | null }) => void
  start?: string | null
}) {
  const mobile = useSmallScreen()
  const inclusiveEnd = end && endExclusive ? shiftDateOnly(end, -1) : end
  const presets = getDatePresets()
  function select(from: string | null, through: string | null) {
    onSelect({
      start: from,
      end: through && endExclusive ? shiftDateOnly(through, 1) : through,
    })
  }
  return (
    <div className="flex flex-col">
      <div className="border-b border-border p-2">
        <SelectRoot
          onValueChange={(value) => {
            const preset = presets.find((entry) => entry.label === value)
            if (preset) select(preset.start, preset.end)
          }}
        >
          <SelectTrigger
            aria-label="Date preset"
            size="sm"
            className="h-8 w-full rounded-none border-border bg-transparent text-xs"
          >
            <SelectValue placeholder="Select preset" />
          </SelectTrigger>
          <SelectContent appearance="dashboard" alignItemWithTrigger={false}>
            {presets.map((preset) => (
              <SelectItem
                key={preset.label}
                value={preset.label}
                className="rounded-none text-xs font-normal"
                disabled={Boolean(
                  (min && preset.start < min) || (max && preset.end > max),
                )}
              >
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
      </div>
      <Calendar
        mode="range"
        autoFocus
        numberOfMonths={mobile ? 1 : 2}
        defaultMonth={parseDateOnly(start) ?? new Date()}
        selected={{
          from: parseDateOnly(start),
          to: parseDateOnly(inclusiveEnd),
        }}
        disabled={[
          ...(min ? [{ before: parseDateOnly(min) ?? new Date() }] : []),
          ...(max ? [{ after: parseDateOnly(max) ?? new Date() }] : []),
        ]}
        onSelect={(range) =>
          select(
            range?.from ? formatDateOnly(range.from) : null,
            range?.to ? formatDateOnly(range.to) : null,
          )
        }
      />
    </div>
  )
}
