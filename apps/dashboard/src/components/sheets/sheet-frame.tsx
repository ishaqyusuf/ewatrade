"use client"
import { FormFeedback } from "@/components/forms/form-feedback"

import { WorkspaceError } from "@/components/dashboard/workspace-error"
import {
  Button,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  cn,
} from "@ewatrade/ui"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { ErrorBoundary } from "next/dist/client/components/error-boundary"
import { Suspense } from "react"
import type { ComponentProps, ReactNode } from "react"

type SheetFrameProps = {
  children: ReactNode
  closeError?: string | null
  title: string
  description?: string
  header?: ReactNode
  footer?: ReactNode
  contentClassName?: string
  popupClassName?: string
  mobileBottomSheet?: boolean
  closeDisabled?: boolean
  finalFocus?: ComponentProps<typeof SheetContent>["finalFocus"]
}

export function SheetFrame({
  children,
  closeError,
  title,
  description,
  header,
  footer,
  contentClassName,
  popupClassName,
  mobileBottomSheet = false,
  closeDisabled = false,
  finalFocus,
}: SheetFrameProps) {
  return (
    <SheetContent
      className="flex flex-col p-0"
      mobileLayout={mobileBottomSheet ? "bottom" : "fullscreen"}
      finalFocus={finalFocus}
      popupClassName={popupClassName}
    >
      <SheetHeader className="shrink-0 flex-row items-start justify-between gap-4 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">
        <div className="min-w-0 space-y-2">
          <SheetTitle className="text-xl font-medium">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-sm text-muted-foreground">
              {description}
            </SheetDescription>
          ) : null}
          {header}
        </div>
        <SheetClose
          disabled={closeDisabled}
          render={
            <Button
              aria-label="Close"
              className="m-0 size-auto rounded-none p-0 hover:bg-transparent"
              size="icon"
              type="button"
              variant="ghost"
            />
          }
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
        </SheetClose>
      </SheetHeader>
      <section
        className={cn(
          "min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-6 pb-6",
          mobileBottomSheet && "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          contentClassName,
        )}
        aria-label={`${title} content`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: This scrollable region must support keyboard scrolling even without controls.
        tabIndex={0}
        data-slot="sheet-body"
      >
        {closeError ? (
          <FormFeedback appearance="dashboard">{closeError}</FormFeedback>
        ) : null}
        <ErrorBoundary errorComponent={WorkspaceError}>
          <Suspense fallback={<output aria-live="polite">Loading…</output>}>
            {children}
          </Suspense>
        </ErrorBoundary>
      </section>
      {footer ? (
        <SheetFooter className="shrink-0 flex-wrap border-t border-border bg-background px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {footer}
        </SheetFooter>
      ) : null}
    </SheetContent>
  )
}
