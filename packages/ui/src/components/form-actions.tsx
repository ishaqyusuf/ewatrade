import type { ComponentProps } from "react"
import { cn } from "../lib/utils"
import { Separator } from "./separator"

export function FormActions({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="form-actions"
      className={cn(
        "col-span-full mt-auto flex flex-col gap-4 pt-4",
        className,
      )}
    >
      <Separator />
      <div className="flex flex-wrap items-center justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </div>
  )
}
