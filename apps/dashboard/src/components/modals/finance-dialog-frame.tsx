"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import {
  Button,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ewatrade/ui"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { type ReactNode, Suspense } from "react"

/**
 * Centred dialog for Finance flows that are not a record's sheet, such as
 * Upload statement (choose the file, map columns, check), like Midday's import.
 */
export function FinanceDialogFrame({
  children,
  closeDisabled = false,
  description,
  title,
}: {
  /** Sheet-only sizing; the dialog has its own width. */
  popupClassName?: string
  children: ReactNode
  closeDisabled?: boolean
  description?: string
  title: string
}) {
  return (
    <DialogContent
      hideClose
      className="flex max-h-[90dvh] w-[min(820px,calc(100vw-2rem))] max-w-none flex-col bg-background p-0 text-foreground"
    >
      <DialogHeader className="flex-row items-start justify-between gap-4 px-6 pt-6 pb-4">
        <div className="min-w-0 space-y-1">
          <DialogTitle className="text-xl font-medium">{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </div>
        <DialogClose
          disabled={closeDisabled}
          render={
            <Button
              aria-label="Close"
              className="m-0 size-auto p-0 hover:bg-transparent"
              size="icon"
              type="button"
              variant="ghost"
            />
          }
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
        </DialogClose>
      </DialogHeader>
      <section
        aria-label={`${title} content`}
        className="min-h-0 flex-1 overflow-y-auto px-6 pb-6"
      >
        <ErrorBoundary errorComponent={WorkspaceError}>
          <Suspense fallback={<output aria-live="polite">Loading…</output>}>
            {children}
          </Suspense>
        </ErrorBoundary>
      </section>
    </DialogContent>
  )
}
