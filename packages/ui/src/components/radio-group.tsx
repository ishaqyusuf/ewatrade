"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import type { ComponentProps } from "react"
import { cn } from "../lib/utils"

// shadcn RadioGroup on Base UI, styled like the dashboard Checkbox.
export function RadioGroup({
  className,
  ...props
}: Omit<ComponentProps<typeof RadioGroupPrimitive>, "className"> & {
  className?: string
}) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  )
}

export function RadioGroupItem({
  className,
  ...props
}: Omit<ComponentProps<typeof RadioPrimitive.Root>, "className"> & {
  className?: string
}) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring data-disabled:cursor-not-allowed data-disabled:opacity-50 data-checked:border-foreground",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="size-2 rounded-full bg-current" />
    </RadioPrimitive.Root>
  )
}
