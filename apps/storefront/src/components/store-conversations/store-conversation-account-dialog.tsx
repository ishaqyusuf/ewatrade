"use client"

import { type ReactNode, useEffect, useId, useRef } from "react"

export function StoreConversationAccountDialog({
  children,
  onClose,
  open,
  title,
}: {
  children: ReactNode
  onClose: () => void
  open: boolean
  title: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      aria-labelledby={titleId}
      className="m-auto max-h-[min(760px,calc(100dvh-32px))] w-[min(560px,calc(100vw-24px))] overflow-hidden rounded-3xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/45"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose()
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background px-5 py-4">
        <h2 className="text-lg font-semibold" id={titleId}>
          {title}
        </h2>
        <button
          aria-label="Close"
          className="grid size-11 place-items-center rounded-full text-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <div className="max-h-[calc(100dvh-112px)] overflow-y-auto p-5">
        {children}
      </div>
    </dialog>
  )
}
