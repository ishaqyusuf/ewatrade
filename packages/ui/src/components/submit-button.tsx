"use client"

import type { ComponentProps } from "react"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { Spinner } from "./spinner"

export function SubmitButton({
  children,
  isSubmitting,
  disabled,
  className,
  type = "submit",
  ...props
}: ComponentProps<typeof Button> & { isSubmitting: boolean }) {
  return (
    <Button
      {...props}
      type={type}
      appearance="form"
      disabled={isSubmitting || disabled}
      aria-busy={isSubmitting}
      className={cn("relative", className)}
    >
      <span className={cn(isSubmitting && "invisible")}>{children}</span>
      {isSubmitting ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      ) : null}
    </Button>
  )
}
