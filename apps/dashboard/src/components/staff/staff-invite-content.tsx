"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { createStaffFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import type { StaffInviteRole } from "@/lib/staff-management"
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  SelectControl,
  SubmitButton,
} from "@ewatrade/ui"
import type { FormEvent } from "react"
import { useRef, useState } from "react"

type InviteForm = {
  email: string
  name: string
  role: StaffInviteRole
}

const emptyInviteForm: InviteForm = {
  email: "",
  name: "",
  role: "cashier",
}

export function StaffInviteContent({
  onClose,
  onInvited,
}: {
  onClose: () => Promise<unknown>
  onInvited: (qaInviteUrl: string | null) => Promise<void>
}) {
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quickFillSnapshot = useRef<InviteForm | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  function handleCloseError(failure: unknown) {
    setError(
      failure instanceof Error
        ? failure.message
        : "The invitation sheet could not be closed.",
    )
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!inviteForm.email.trim()) {
      setError("Enter a staff email.")
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch("/api/staff", {
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          name: inviteForm.name.trim() || undefined,
          operation: "invite",
          role: inviteForm.role,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = (await response.json()) as {
        error?: string
        qaInviteUrl?: string
      }

      if (!response.ok) {
        throw new Error(result.error ?? "Staff invite failed.")
      }

      await onInvited(result.qaInviteUrl ?? null)
      await onClose()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Staff invite failed.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submitInvite}>
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      <QaDashboardQuickFill
        canUndo={canUndoQuickFill}
        formId="dashboard.staff.invite"
        isDirty={Boolean(inviteForm.email || inviteForm.name)}
        onFill={(context, sequence) => {
          quickFillSnapshot.current = inviteForm
          const fixture = createStaffFixture(context, sequence)
          setInviteForm({
            email: fixture.email,
            name: fixture.name,
            role: "cashier",
          })
          setCanUndoQuickFill(true)
        }}
        onUndo={() => {
          if (!quickFillSnapshot.current) return
          setInviteForm(quickFillSnapshot.current)
          quickFillSnapshot.current = null
          setCanUndoQuickFill(false)
        }}
      />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="staff-invite-email">Email</FieldLabel>
          <Input
            id="staff-invite-email"
            disabled={isSaving}
            type="email"
            value={inviteForm.email}
            onChange={(event) =>
              setInviteForm((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="staff-invite-name">Name</FieldLabel>
          <Input
            id="staff-invite-name"
            disabled={isSaving}
            value={inviteForm.name}
            onChange={(event) =>
              setInviteForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="staff-invite-role">Role</FieldLabel>
          <SelectControl<StaffInviteRole>
            id="staff-invite-role"
            disabled={isSaving}
            value={inviteForm.role}
            onValueChange={(role) =>
              setInviteForm((current) => ({
                ...current,
                role,
              }))
            }
            options={[
              { value: "cashier", label: "Cashier" },
              { value: "operator", label: "Operator" },
              { value: "manager", label: "Manager" },
            ]}
          />
        </Field>
      </FieldGroup>

      <FormFeedback appearance="dashboard" variant="default">
        Invited staff verify their email, create a password and complete setup.
        QA invitation links appear here after sending.
      </FormFeedback>

      <FormActions>
        <Button
          appearance="form"
          type="button"
          variant="outline"
          className="rounded-none"
          disabled={isSaving}
          onClick={() => void onClose().catch(handleCloseError)}
        >
          Cancel
        </Button>
        <SubmitButton isSubmitting={isSaving}>Send invite</SubmitButton>
      </FormActions>
    </form>
  )
}
