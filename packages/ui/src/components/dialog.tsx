"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import type { ComponentProps } from "react"
import { cn } from "../lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close
const DialogPortal = DialogPrimitive.Portal
const DialogTitle = DialogPrimitive.Title
const DialogDescription = DialogPrimitive.Description

function DialogContent({
  className,
  children,
  hideClose = false,
  ...props
}: Omit<DialogPrimitive.Popup.Props, "className"> & {
  className?: string
  hideClose?: boolean
}) {
  return (
    <DialogPortal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#f6f6f3]/60 transition-opacity duration-100 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 dark:bg-[#0C0C0C]/80" />
      <DialogPrimitive.Popup
        {...props}
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-xl max-h-[calc(100svh-10vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-background text-primary outline-none transition-opacity duration-100 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none",
          className,
        )}
      >
        {children}
        {!hideClose ? (
          <DialogClose
            aria-label="Close"
            className="absolute top-6 right-6 opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </DialogClose>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  )
}
function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
