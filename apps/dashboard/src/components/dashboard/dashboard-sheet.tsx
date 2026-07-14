"use client"

import { Button } from "@ewatrade/ui"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ReactNode } from "react"

type DashboardSheetProps = {
  children: ReactNode
  description?: string
  onClose: () => void
  open: boolean
  title: string
}

export function DashboardSheet({
  children,
  description,
  onClose,
  open,
  title,
}: DashboardSheetProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-foreground/20"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-border bg-background shadow-xl">
        <header className="flex min-h-[70px] items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  )
}
