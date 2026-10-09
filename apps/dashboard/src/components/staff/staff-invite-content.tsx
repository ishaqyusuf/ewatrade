"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

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
  onInvited: (qaInviteUrl: string | null) => Promise<void>
}) {
  const workflow = useDashboardWorkflow()
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm)
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([])
  const [assignments, setAssignments] = useState([
    { key: 0, storeId, role: "cashier" as StaffInviteRole },
  ])
  const [storeAccessReady, setStoreAccessReady] = useState(false)
  const nextRowKey = useRef(1)
  const [catalogEditor, setCatalogEditor] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/staff", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok)
          throw new Error(result.error ?? "Store access could not be loaded.")
        setStores(result.stores)
        setStoreAccessReady(result.storeAccessReady === true)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Store access could not be loaded.",
          )
      })
    return () => controller.abort()
  }, [])
  const hasManager = assignments.some((row) => row.role === "manager")
  const incomplete = assignments.some((row) => !row.storeId)
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
    if (!storeAccessReady) {
      setError("Store staff assignments are not available yet.")
      return
    }

    if (!inviteForm.email.trim()) {
      setError("Enter a staff email.")
      return
    }

    if (
      incomplete ||
      !stores.length ||
      new Set(assignments.map((row) => row.storeId)).size !== assignments.length
    ) {
      setError("Choose a different Store and a role in every row.")
      return
    }
    setIsSaving(true)

    try {
      const response = await workflow.fetch("staff_invite", "/api/staff", {
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          name: inviteForm.name.trim() || undefined,
          operation: "invite",
          role: assignments[0]?.role,
          storeId: assignments[0]?.storeId,
          assignments: assignments.map(({ storeId, role }) => ({
            storeId,
            role,
          })),
          catalogEditor: hasManager && catalogEditor,
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

        <div className="grid gap-3" aria-label="Store access">
          {assignments.map((row, index) => (
            <div
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2"
            >
              <Field>
                <FieldLabel htmlFor={`staff-store-${row.key}`}>
                  Store
                </FieldLabel>
                <SelectControl<string>
                  id={`staff-store-${row.key}`}
                  disabled={isSaving || !stores.length}
                  value={row.storeId}
                  placeholder="Select Store"
                  onValueChange={(selected) =>
                    setAssignments((current) =>
                      current.map((item) =>
                        item.key === row.key
                          ? { ...item, storeId: selected }
                          : item,
                      ),
                    )
                  }
                  options={stores
                    .filter(
                      (store) =>
                        store.id === row.storeId ||
                        !assignments.some((item) => item.storeId === store.id),
                    )
                    .map((store) => ({ value: store.id, label: store.name }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`staff-role-${row.key}`}>Role</FieldLabel>
                <SelectControl<StaffInviteRole>
                  id={`staff-role-${row.key}`}
                  disabled={isSaving}
                  value={row.role}
                  onValueChange={(role) =>
                    setAssignments((current) =>
                      current.map((item) =>
                        item.key === row.key ? { ...item, role } : item,
                      ),
                    )
                  }
                  options={[
                    {
                      value: "cashier",
                      label: "Cashier",
                      description:
                        "Create orders, take payments and issue receipts. No stock adjustments or catalog editing.",
                    },
                    {
                      value: "operator",
                      label: "Operator",
                      description:
                        "Create orders, use checkout and adjust stock in this Store. No catalog editing or staff administration.",
                    },
                    {
                      value: "manager",
                      label: "Manager",
                      description:
                        "Manage this Store’s orders, stock, reconciliation and reports. Catalog editing requires a separate business grant.",
                    },
                  ]}
                />
              </Field>
              {assignments.length > 1 ? (
                <Button
                  className="mt-6"
                  type="button"
                  variant="ghost"
                  disabled={isSaving}
                  aria-label={`Remove Store row ${index + 1}`}
                  onClick={() =>
                    setAssignments((current) =>
                      current.filter((item) => item.key !== row.key),
                    )
                  }
                >
                  ×
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
          {stores.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              disabled={
                isSaving || incomplete || assignments.length >= stores.length
              }
              onClick={() =>
                setAssignments((current) => [
                  ...current,
                  { key: nextRowKey.current++, storeId: "", role: "cashier" },
                ])
              }
            >
              Add store
            </Button>
          ) : null}
          {hasManager ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={catalogEditor}
                disabled={isSaving}
                onChange={(event) => setCatalogEditor(event.target.checked)}
              />
              <span>
                Allow business-wide catalog editing. Product and price changes
                affect all Stores.
              </span>
            </label>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Owner/Admin administers the business and all Stores. Staff
            invitations assign Cashier, Operator or Manager access to the
            selected Stores. The first row sets the starting Store.
          </p>
          <p className="text-sm">
            Invite with {assignments.length} Store assignment
            {assignments.length === 1 ? "" : "s"}
            {hasManager && catalogEditor
              ? " and business-wide catalog editing"
              : ""}
            .
          </p>
        </div>
      </FieldGroup>

      <FormFeedback appearance="dashboard" variant="default">
        {storeAccessReady
          ? "Invited staff verify their email, create a password and complete setup. QA invitation links appear here after sending."
          : "Invitations will be available after Store access setup is complete."}
      </FormFeedback>

      <FormActions>
        <Button
          appearance="form"
          type="button"
          variant="outline"
          disabled={isSaving}
          onClick={() => void onClose().catch(handleCloseError)}
        >
          Cancel
        </Button>
        <SubmitButton
          disabled={!storeAccessReady || !stores.length || incomplete}
          isSubmitting={isSaving}
        >
          Send invite
        </SubmitButton>
      </FormActions>
    </form>
  )
}
