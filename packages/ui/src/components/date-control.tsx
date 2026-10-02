"use client"

import { Calendar03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { type ComponentProps, useEffect, useRef, useState } from "react"
import { cn } from "../lib/utils"
import { Calendar } from "./calendar"
import { Input } from "./input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./input-group"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  return date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date
    : undefined
}
function formatDay(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export type DateControlProps = Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "min" | "max"
> & {
  value: string
  onValueChange: (value: string) => void
  type?: "date" | "datetime-local"
  min?: string
  max?: string
}

// Keep date-only and local date-time strings intact; API owners choose their timezone.
export function DateControl({
  value,
  onValueChange,
  type = "date",
  min,
  max,
  disabled,
  readOnly,
  className,
  ref,
  ...props
}: DateControlProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const date = parseDay(value)
    const invalidTime =
      type === "datetime-local" &&
      value &&
      Number.isNaN(new Date(value).getTime())
    inputRef.current?.setCustomValidity(
      value &&
        (!date || invalidTime || (min && value < min) || (max && value > max))
        ? "Choose a valid date within the allowed range."
        : "",
    )
  }, [value, min, max, type])
  const selected = parseDay(value)
  const minimum = min ? parseDay(min) : undefined
  const maximum = max ? parseDay(max) : undefined
  const hasTime = type === "datetime-local"
  const [dayValue = "", timeValue = ""] = hasTime ? value.split("T") : [value]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("@container/date-control min-w-0", className)}>
        <div
          className={cn(
            hasTime
              ? "grid min-w-0 gap-2 @xs/date-control:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]"
              : "min-w-0",
          )}
        >
          <InputGroup appearance="form">
            <InputGroupInput
              {...props}
              name={hasTime ? undefined : props.name}
              ref={(element) => {
                inputRef.current = element
                if (typeof ref === "function") ref(element)
                else if (ref) ref.current = element
              }}
              type="text"
              value={dayValue}
              disabled={disabled}
              readOnly={readOnly}
              placeholder={props.placeholder ?? "YYYY-MM-DD"}
              pattern={"[0-9]{4}-[0-9]{2}-[0-9]{2}"}
              onChange={(event) =>
                onValueChange(
                  event.target.value
                    ? event.target.value +
                        (hasTime ? `T${timeValue || "00:00"}` : "")
                    : "",
                )
              }
            />
            <InputGroupAddon align="inline-end">
              <PopoverTrigger
                render={<InputGroupButton size="icon-sm" />}
                disabled={disabled || readOnly}
                aria-label="Choose date"
              >
                <HugeiconsIcon icon={Calendar03Icon} />
              </PopoverTrigger>
            </InputGroupAddon>
          </InputGroup>
          {hasTime ? (
            <>
              <Input
                type="time"
                step={
                  props.step ??
                  (timeValue.includes(".")
                    ? "any"
                    : timeValue.split(":").length > 2
                      ? 1
                      : 60)
                }
                id={props.id ? `${props.id}-time` : undefined}
                aria-label="Time"
                aria-invalid={props["aria-invalid"]}
                aria-describedby={props["aria-describedby"]}
                required={props.required}
                disabled={disabled || !dayValue}
                readOnly={readOnly}
                value={timeValue}
                onBlur={props.onBlur}
                onChange={(event) =>
                  onValueChange(`${dayValue}T${event.target.value}`)
                }
              />
              {props.name ? (
                <input
                  type="hidden"
                  name={props.name}
                  value={value}
                  disabled={disabled}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <PopoverContent appearance="dashboard" align="end" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          autoFocus
          disabled={(date) =>
            Boolean((minimum && date < minimum) || (maximum && date > maximum))
          }
          onSelect={(date) => {
            if (!date) return
            onValueChange(
              formatDay(date) +
                (type === "datetime-local"
                  ? `T${value.split("T")[1] || "00:00"}`
                  : ""),
            )
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
