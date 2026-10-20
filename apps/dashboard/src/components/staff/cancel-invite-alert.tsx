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

/** Cancelling an invite has no fields, so it is an alert, not a form. */
export function CancelInviteAlert({
  name,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  name: string
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const keepRef = useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent initialFocus={keepRef}>
        <AlertDialogTitle className="text-lg font-medium">
          Cancel invite for {name}?
        </AlertDialogTitle>
        <AlertDialogDescription className="text-sm text-muted-foreground">
          The link in their email will stop working. You can invite them again
          later.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel ref={keepRef}>Keep invite</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Cancelling…" : "Cancel invite"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
