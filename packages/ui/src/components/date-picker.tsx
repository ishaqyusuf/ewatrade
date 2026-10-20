"use client"

import { Calendar03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function parseDay(value: string | undefined) {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
  if (!match) return undefined
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  )
  return Number.isNaN(date.getTime()) ? undefined : date
}
function toDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
/** "19 Oct 2026" for a YYYY-MM-DD day. */
export function formatPickerDay(value: string) {
  const date = parseDay(value)
  return date
    ? `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
    : value
}

export type DatePickerProps = {
  /** A calendar day as YYYY-MM-DD, or "". */
  value: string
  onValueChange: (value: string) => void
  /** Earliest and latest days that can be picked, as YYYY-MM-DD. */
  min?: string
  max?: string
  placeholder?: string
  id?: string
  disabled?: boolean
  className?: string
  onBlur?: () => void
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}

// shadcn date picker: a Button that opens a Calendar in a Popover.
export function DatePicker({
  value,
  onValueChange,
  min,
  max,
  placeholder = "Pick a date",
  id,
  disabled,
  className,
  onBlur,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = parseDay(value)
  const minimum = parseDay(min)
  const maximum = parseDay(max)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur?.()
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            id={id}
            disabled={disabled}
            className={cn(
              "w-full justify-start font-normal",
              !selected && "text-muted-foreground",
              className,
            )}
            {...aria}
          />
        }
      >
        <HugeiconsIcon icon={Calendar03Icon} />
        {selected ? formatPickerDay(value) : placeholder}
      </PopoverTrigger>
      <PopoverContent
        appearance="dashboard"
        align="start"
        className="w-auto p-0"
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maximum}
          autoFocus
          disabled={(date) =>
            Boolean((minimum && date < minimum) || (maximum && date > maximum))
          }
          onSelect={(date) => {
            if (!date) return
            onValueChange(toDay(date))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
