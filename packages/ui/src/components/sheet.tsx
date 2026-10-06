"use client"

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import type * as React from "react"
import { cn } from "../lib/utils"

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetTitle = SheetPrimitive.Title
const SheetDescription = SheetPrimitive.Description
const SheetPortal = SheetPrimitive.Portal

function SheetOverlay(
  props: Omit<SheetPrimitive.Backdrop.Props, "className"> & {
    className?: string
  },
) {
  return (
    <SheetPrimitive.Backdrop
      {...props}
      className={cn(
        "fixed inset-0 z-50 bg-[#f6f6f3]/60 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 dark:bg-black/60",
        props.className,
      )}
    />
  )
}

function SheetContent({
  side = "right",
  title,
  className,
  popupClassName,
  mobileLayout = "fullscreen",
  children,
  ...props
}: Omit<SheetPrimitive.Popup.Props, "className"> & {
  side?: "left" | "right"
  title?: string
  className?: string
  popupClassName?: string
  mobileLayout?: "fullscreen" | "bottom"
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-mobile-overlay=""
        className={cn(
          "fixed inset-y-0 z-50 h-dvh outline-none transition-transform duration-300 ease-in-out motion-reduce:transition-none md:p-4",
          side === "left"
            ? "left-0 w-full sm:w-3/4 sm:max-w-sm data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full"
            : "right-0 w-full sm:w-3/4 sm:max-w-[520px] data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
          popupClassName,
          mobileLayout === "bottom"
            ? "max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:h-auto max-md:max-h-[90dvh] max-md:w-full max-md:max-w-none max-md:p-0 max-md:data-[starting-style]:translate-x-0 max-md:data-[starting-style]:translate-y-full max-md:data-[ending-style]:translate-x-0 max-md:data-[ending-style]:translate-y-full"
            : "max-md:inset-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-none max-md:p-0",
        )}
        {...props}
      >
        <div
          className={cn(
            "relative flex h-full w-full flex-col overflow-hidden border border-border bg-[#FAFAF9] p-6 max-md:border-0 dark:bg-[#0C0C0C]",
            mobileLayout === "bottom" && "max-md:border-t",
            className,
          )}
        >
          {title ? <SheetTitle className="sr-only">{title}</SheetTitle> : null}
          {children}
        </div>
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2 text-left", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 justify-end gap-2", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetPortal,
  SheetOverlay,
  SheetHeader,
  SheetFooter,
}
