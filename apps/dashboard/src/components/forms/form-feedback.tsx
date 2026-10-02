import { Alert, AlertDescription } from "@ewatrade/ui"
import type { ReactNode } from "react"

export function FormFeedback({
  children,
  variant = "destructive",
  appearance = "default",
}: {
  children: ReactNode
  variant?: "default" | "destructive"
  appearance?: "default" | "dashboard"
}) {
  return (
    <Alert
      variant={variant}
      appearance={appearance}
      role={variant === "destructive" ? "alert" : "status"}
    >
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
