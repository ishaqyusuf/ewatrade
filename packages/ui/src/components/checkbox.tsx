"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ComponentProps } from "react"
import { cn } from "../lib/utils"

export function Checkbox({
  className,
  indeterminate,
  ...props
}: Omit<ComponentProps<typeof CheckboxPrimitive.Root>, "className"> & {
  className?: string
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      indeterminate={indeterminate}
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center border border-border text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring data-disabled:cursor-not-allowed data-disabled:opacity-50 data-checked:bg-[#F2F1EF] dark:data-checked:bg-[#1d1d1d] data-indeterminate:bg-[#F2F1EF] dark:data-indeterminate:bg-[#1d1d1d]",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {indeterminate ? (
          <span aria-hidden="true" className="h-px w-2 bg-current" />
        ) : (
          <HugeiconsIcon
            icon={Tick02Icon}
            className="size-3.5"
            aria-hidden="true"
          />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
