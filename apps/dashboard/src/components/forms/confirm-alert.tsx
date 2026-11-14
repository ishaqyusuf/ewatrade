"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  SubmitButton,
} from "@ewatrade/ui"
import type { ReactNode } from "react"

/**
 * The last check before a money or destructive step. The title names the
 * customer and amount; outside clicks don't close it while it saves.
 */
export function ConfirmAlert({
  open,
  title,
  description,
  action,
  cancelLabel = "Go back",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean
  title: ReactNode
  description?: ReactNode
  action: ReactNode
  cancelLabel?: ReactNode
  danger?: boolean
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle className="text-lg font-medium">
          {title}
        </AlertDialogTitle>
        {description ? (
          <AlertDialogDescription className="text-muted-foreground">
            {description}
          </AlertDialogDescription>
        ) : null}
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          <SubmitButton
            type="button"
            variant={danger ? "destructive" : "default"}
            isSubmitting={pending}
            disabled={pending}
            onClick={onConfirm}
          >
            {action}
          </SubmitButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
