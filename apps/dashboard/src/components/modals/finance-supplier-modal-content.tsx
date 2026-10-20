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

export function FinanceSupplierModalContent({
  children,
  closeDisabled = false,
  description,
  title,
}: {
  children: ReactNode
  closeDisabled?: boolean
  description?: string
  title: string
}) {
  return (
    <DialogContent hideClose className="max-w-[455px] p-6">
      <DialogHeader className="mb-6 flex-row items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <DialogTitle className="text-xl font-medium">{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </div>
        <DialogClose
          disabled={closeDisabled}
          render={
            <Button
              appearance="form"
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
      <ErrorBoundary errorComponent={WorkspaceError}>
        <Suspense fallback={<output aria-live="polite">Loading…</output>}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </DialogContent>
  )
}
