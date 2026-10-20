"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  type StaffAccessRecord,
  type StaffAccessResponse,
  useStaffAccess,
} from "@/hooks/use-staff-access"
import type { StaffInviteRole } from "@/lib/staff-management"
import { Button, Checkbox } from "@ewatrade/ui"
import { useId, useState } from "react"
import { StaffRolePicker, type StaffRolePickerValue } from "./staff-role-picker"

/** Change access: a view inside the member sheet. Saves one role across the chosen stores. */
export function StaffAccessForm({
  userId,
  onSaved,
  onCancel,
  onSavingChange,
}: {
  userId: string
  onSaved: () => Promise<void> | void
  onCancel: () => void
  onSavingChange?: (saving: boolean) => void
}) {
  const query = useStaffAccess(userId)
  if (query.isPending)
    return <output aria-live="polite">Loading access…</output>
  if (query.isError || !query.data.access)
    return (
      <FormFeedback appearance="dashboard">
        Couldn’t load their access. Close this and try again.
      </FormFeedback>
    )
  return (
    <AccessFormBody
      key={query.data.access.staffAccessRevision}
      userId={userId}
      data={query.data}
      access={query.data.access}
      onSaved={onSaved}
      onCancel={onCancel}
      onSavingChange={onSavingChange}
    />
  )
}

function AccessFormBody({
  userId,
  data,
  access,
  onSaved,
  onCancel,
  onSavingChange,
}: {
  userId: string
  data: StaffAccessResponse
  access: StaffAccessRecord
  onSaved: () => Promise<void> | void
  onCancel: () => void
  onSavingChange?: (saving: boolean) => void
}) {
  const workflow = useDashboardWorkflow()
  const confirmId = useId()
  const assignments = access.staffStoreAssignments
  const roles = new Set(assignments.map((row) => row.role.toLowerCase()))
  const legacy = access.staffAccessMode === "LEGACY"
  const [value, setValue] = useState<StaffRolePickerValue>({
    role: (assignments[0]?.role.toLowerCase() ??
      (["cashier", "operator", "manager"].includes(access.role.toLowerCase())
        ? access.role.toLowerCase()
        : "cashier")) as StaffInviteRole,
    storeIds: assignments.map((row) => row.storeId),
    startStoreId:
      access.retailOpsStaffProfile?.defaultStoreId ??
      assignments[0]?.storeId ??
      null,
    catalogEditor: access.catalogEditor,
  })
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (saving) return
    setSaving(true)
    onSavingChange?.(true)
    setError(null)
    try {
      const response = await workflow.fetch("staff_update", "/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "access",
          staffUserId: userId,
          expectedRevision: access.staffAccessRevision,
          confirmLegacyCutover: confirmed,
          assignments: value.storeIds.map((storeId) => ({
            storeId,
            role: value.role,
          })),
          defaultStoreId: value.storeIds.length ? value.startStoreId : null,
          catalogEditor: value.role === "manager" && value.catalogEditor,
        }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error)
      await onSaved()
    } catch {
      setError("Couldn’t save access. Try again.")
    } finally {
      setSaving(false)
      onSavingChange?.(false)
    }
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      {!data.storeAccessReady ? (
        <FormFeedback appearance="dashboard">
          Store access can’t be changed yet. Try again later.
        </FormFeedback>
      ) : null}
      {legacy ? (
        <p className="text-sm text-muted-foreground">
          They can use every store today. Choose the stores they should keep.
        </p>
      ) : null}
      {roles.size > 1 ? (
        <FormFeedback appearance="dashboard" variant="default">
          They have different roles in different stores today. Saving gives them
          this role in every store.
        </FormFeedback>
      ) : null}
      <StaffRolePicker
        value={value}
        stores={data.stores}
        disabled={saving}
        onChange={setValue}
      />
      {!value.storeIds.length ? (
        <p className="text-sm text-muted-foreground">
          No stores. They can’t open any store.
        </p>
      ) : null}
      {legacy ? (
        <label className="flex items-start gap-2.5 text-sm" htmlFor={confirmId}>
          <Checkbox
            id={confirmId}
            checked={confirmed}
            disabled={saving}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
          />
          I understand they’ll lose the stores I don’t choose.
        </label>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Removing a store stops access to that store only. To stop all access,
        suspend them.
      </p>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={
            !data.storeAccessReady ||
            saving ||
            (value.storeIds.length > 0 && !value.startStoreId) ||
            (legacy && !confirmed)
          }
        >
          {saving ? "Saving…" : "Save"}
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
