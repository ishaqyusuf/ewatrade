"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { createStaffFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import {
  StaffRolePicker,
  type StaffRolePickerValue,
  pickerAssignments,
  pickerHasManager,
} from "@/components/staff/staff-role-picker"
import type { StaffInviteRole } from "@/lib/staff-management"
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  FormActions,
  Input,
  SubmitButton,
} from "@ewatrade/ui"
import type { FormEvent } from "react"
import { useEffect, useRef, useState } from "react"

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
  storeId,
}: {
  storeId: string
  onClose: () => Promise<unknown>
  onInvited: (email: string, qaInviteUrl: string | null) => Promise<void>
}) {
  const workflow = useDashboardWorkflow()
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm)
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([])
  const [access, setAccess] = useState<StaffRolePickerValue>({
    role: "cashier",
    storeIds: [storeId],
    startStoreId: storeId,
    catalogEditor: false,
    storeRoles: null,
  })
  const [storeAccessReady, setStoreAccessReady] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/staff", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok)
          throw new Error(
            "Couldn’t load your stores. Close this and try again.",
          )
        setStores(result.stores)
        setStoreAccessReady(result.storeAccessReady === true)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Couldn’t load your stores. Close this and try again.",
          )
      })
    return () => controller.abort()
  }, [])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quickFillSnapshot = useRef<InviteForm | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  function handleCloseError(failure: unknown) {
    setError(
      failure instanceof Error
        ? failure.message
        : "Couldn’t close the invite form.",
    )
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!storeAccessReady) {
      setError("You can invite staff once store access is set up.")
      return
    }

    if (!inviteForm.email.trim()) {
      setError("Enter their email address.")
      return
    }

    if (!access.storeIds.length) {
      setError("Choose at least one store.")
      return
    }
    // The first store sent is where they start.
    const assignments = pickerAssignments(access)
    setIsSaving(true)

    try {
      const response = await workflow.fetch("staff_invite", "/api/staff", {
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          name: inviteForm.name.trim() || undefined,
          operation: "invite",
          role: assignments[0]?.role ?? access.role,
          storeId: assignments[0]?.storeId,
          assignments,
          catalogEditor: pickerHasManager(access) && access.catalogEditor,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const result = (await response.json()) as {
        error?: string
        qaInviteUrl?: string
      }

      if (!response.ok) {
        throw new Error("Couldn’t send the invite. Try again.")
      }

      await onInvited(inviteForm.email.trim(), result.qaInviteUrl ?? null)
      await onClose()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Couldn’t send the invite. Try again.",
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
            placeholder="name@example.com"
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
          <FieldLabel htmlFor="staff-invite-name">Name (optional)</FieldLabel>
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

        <StaffRolePicker
          value={access}
          stores={stores}
          disabled={isSaving || !stores.length}
          onChange={setAccess}
        />
        <p className="text-sm text-muted-foreground">
          Owners and admins already have every store.
        </p>
      </FieldGroup>

      <FormFeedback appearance="dashboard" variant="default">
        {storeAccessReady
          ? "They’ll set a password from the link in the email."
          : "You can invite staff once store access is set up."}
      </FormFeedback>

      <FormActions>
        <Button
          type="button"
          variant="outline"
          className="rounded-none"
          disabled={isSaving}
          onClick={() => void onClose().catch(handleCloseError)}
        >
          Cancel
        </Button>
        <SubmitButton
          disabled={
            !storeAccessReady || !stores.length || !access.storeIds.length
          }
          isSubmitting={isSaving}
        >
          Send invite
        </SubmitButton>
      </FormActions>
    </form>
  )
}
