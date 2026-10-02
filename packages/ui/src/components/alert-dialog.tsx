"use client"

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import type { ComponentProps } from "react"
import { cn } from "../lib/utils"
import { Button } from "./button"

const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTitle = AlertDialogPrimitive.Title
const AlertDialogDescription = AlertDialogPrimitive.Description

function AlertDialogContent({
  className,
  ...props
}: Omit<AlertDialogPrimitive.Popup.Props, "className"> & {
  className?: string
}) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[#f6f6f3]/60 transition-opacity duration-100 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 dark:bg-[#0C0C0C]/80" />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-[90vw] max-w-[455px] max-h-[calc(100svh-10vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto border border-border bg-background p-4 text-primary outline-none transition-opacity duration-100 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogCancel(props: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button type="button" variant="outline" appearance="form" />}
      {...props}
    />
  )
}

function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogFooter,
}
