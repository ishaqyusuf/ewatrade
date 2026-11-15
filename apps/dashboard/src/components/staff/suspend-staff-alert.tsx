"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  Field,
  FieldLabel,
  Textarea,
} from "@ewatrade/ui"
import { useId, useRef, useState } from "react"

/** Suspend names the person and what happens; the reason is optional. */
export function SuspendStaffAlert({
  open,
  userId,
  name,
  onOpenChange,
  onSuspended,
}: {
  open: boolean
  userId: string
  name: string
  onOpenChange: (open: boolean) => void
  onSuspended: () => Promise<void> | void
}) {
  const workflow = useDashboardWorkflow()
  const id = useId()
  const keepRef = useRef<HTMLButtonElement>(null)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function suspend() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const response = await workflow.fetch("staff_update", "/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "status",
          staffUserId: userId,
          status: "suspended",
          reason: reason.trim() || undefined,
        }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error)
      setReason("")
      await onSuspended()
    } catch {
      setError(`Couldn’t suspend ${name}. Try again.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) {
          setError(null)
          onOpenChange(next)
        }
      }}
    >
      <AlertDialogContent initialFocus={keepRef}>
        <AlertDialogTitle className="text-lg font-medium">
          Suspend {name}?
        </AlertDialogTitle>
        <AlertDialogDescription className="text-base text-muted-foreground">
          {name} won’t be able to sign in to any store until you reactivate
          them. Their sales and history stay.
        </AlertDialogDescription>
        {error ? (
          <FormFeedback appearance="dashboard">{error}</FormFeedback>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${id}-reason`}>Reason (optional)</FieldLabel>
          <Textarea
            id={`${id}-reason`}
            rows={2}
            maxLength={500}
            value={reason}
            disabled={saving}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel ref={keepRef} disabled={saving}>
            Keep access
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={() => void suspend()}
          >
            {saving ? "Suspending…" : "Suspend"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
