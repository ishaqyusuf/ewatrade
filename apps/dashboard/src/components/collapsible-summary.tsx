"use client"

import type { ReactNode } from "react"

export function CollapsibleSummary({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-w-0 transition-transform"
      style={{
        transform: "translateY(calc(var(--header-offset, 0px) * -1))",
        transitionDuration: "var(--header-transition, 200ms)",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  )
}
