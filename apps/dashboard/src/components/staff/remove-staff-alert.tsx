"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
} from "@ewatrade/ui"
import { useRef } from "react"

/**
 * Cancel invite and Remove have no fields, so they are alerts, not forms.
 * Both take away someone who never joined and free their seat.
 */
export function RemoveStaffAlert({
  mode,
  name,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  mode: "cancel" | "remove"
  name: string
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const keepRef = useRef<HTMLButtonElement>(null)
  const cancel = mode === "cancel"
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent initialFocus={keepRef}>
        <AlertDialogTitle className="text-lg font-medium">
          {cancel ? `Cancel invite for ${name}?` : `Remove ${name}?`}
        </AlertDialogTitle>
        <AlertDialogDescription className="text-base text-muted-foreground">
          {cancel
            ? `The link we sent ${name} stops working and they leave your staff list. You can invite them again later.`
            : `${name} never joined. They leave your staff list and their seat is freed. You can invite them again later.`}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel ref={keepRef}>
            {cancel ? "Keep invite" : "Keep"}
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending
              ? cancel
                ? "Cancelling…"
                : "Removing…"
              : cancel
                ? "Cancel invite"
                : "Remove"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
