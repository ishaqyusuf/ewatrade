"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Textarea,
} from "@ewatrade/ui"
import { useId, useState } from "react"

/** Suspend: a view inside the member sheet with an optional reason. */
export function StaffSuspendForm({
  userId,
  name,
  onSaved,
  onCancel,
}: {
  userId: string
  name: string
  onSaved: () => Promise<void> | void
  onCancel: () => void
}) {
  const workflow = useDashboardWorkflow()
  const id = useId()
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-5"
      onSubmit={async (event) => {
        event.preventDefault()
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
          await onSaved()
        } catch {
          setError(`Couldn’t suspend ${name}. Try again.`)
        } finally {
          setSaving(false)
        }
      }}
    >
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      <p className="text-sm">
        They can’t sign in to any store until you reactivate them. Their sales
        and history stay.
      </p>
      <Field>
        <FieldLabel htmlFor={`${id}-reason`}>Reason (optional)</FieldLabel>
        <Textarea
          id={`${id}-reason`}
          rows={3}
          maxLength={500}
          placeholder="For example: on leave until December"
          value={reason}
          disabled={saving}
          onChange={(event) => setReason(event.target.value)}
        />
        <FieldDescription>Shown in their history.</FieldDescription>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={saving}>
          {saving ? "Suspending…" : "Suspend"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
