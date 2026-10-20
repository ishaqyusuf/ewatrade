"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import type { ComponentProps } from "react"
import { cn } from "../lib/utils"

// shadcn Switch on Base UI.
export function Switch({
  className,
  ...props
}: Omit<ComponentProps<typeof SwitchPrimitive.Root>, "className"> & {
  className?: string
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input p-0.5 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform data-checked:translate-x-4"
      />
    </SwitchPrimitive.Root>
  )
}
