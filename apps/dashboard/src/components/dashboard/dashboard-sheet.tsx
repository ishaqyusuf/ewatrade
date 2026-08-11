"use client"

import { Button } from "@ewatrade/ui"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useId, useRef } from "react"
import type { ReactNode } from "react"

type DashboardSheetProps = {
  children: ReactNode
  description?: string
  onClose: () => Promise<void> | void
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
  const sheetRef = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const sheet = sheetRef.current
    if (!sheet) return
    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = "hidden"
    if (!sheet.open) sheet.showModal()
    return () => {
      document.body.style.overflow = previousOverflow
      if (sheet.open) sheet.close()
    }
  }, [open])

  if (!open) return null

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Keyboard users close the native modal with Escape or the Close button.
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className="fixed right-0 top-0 m-0 h-dvh w-full max-w-[520px] border-0 border-l border-border bg-background p-0 shadow-xl backdrop:bg-foreground/20"
      onCancel={(event) => {
        event.preventDefault()
        void onCloseRef.current()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) void onCloseRef.current()
      }}
      ref={sheetRef}
    >
      <div className="flex h-full flex-col">
        <header className="flex min-h-[70px] items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p
                className="mt-1 text-sm text-muted-foreground"
                id={descriptionId}
              >
                {description}
              </p>
            ) : null}
          </div>
          <Button
            aria-label="Close"
            onClick={() => void onCloseRef.current()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </dialog>
  )
}
