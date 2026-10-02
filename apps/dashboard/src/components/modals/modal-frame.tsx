"use client"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ewatrade/ui"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { type ReactNode, Suspense } from "react"

export function ModalFrame({
  children,
  description,
  title,
}: {
  children: ReactNode
  description?: string
  title: string
}) {
  return (
    <DialogContent className="max-w-[455px] p-6">
      <DialogHeader className="mb-6 pr-6">
        <DialogTitle className="text-xl font-medium">{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
      </DialogHeader>
      <ErrorBoundary errorComponent={WorkspaceError}>
        <Suspense fallback={<output aria-live="polite">Loading…</output>}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </DialogContent>
  )
}
