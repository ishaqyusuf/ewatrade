"use client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  type StaffAccessRecord,
  type StaffAccessResponse,
  useStaffAccess,
} from "@/hooks/use-staff-access"
import {
  type StaffInviteRole,
  getStaffRoleLabel,
  staffRoleRank,
} from "@/lib/staff-management"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
} from "@ewatrade/ui"
import { useRef, useState } from "react"
import {
  StaffRolePicker,
  type StaffRolePickerValue,
  pickerAssignments,
  pickerHasManager,
} from "./staff-role-picker"

/** Change role or stores: a view inside the member sheet. Taking access away asks first. */
export function StaffAccessForm({
  userId,
  name,
  onSaved,
  onCancel,
  onSavingChange,
}: {
  userId: string
  name: string
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
      name={name}
      data={query.data}
      access={query.data.access}
      onSaved={onSaved}
      onCancel={onCancel}
      onSavingChange={onSavingChange}
    />
  )
}

/** What saving takes away, in plain words; empty when nothing is lowered. */
export function describeAccessCut(input: {
  legacy: boolean
  before: Array<{ storeId: string; role: string }>
  beforeCatalogEditor: boolean
  after: Array<{ storeId: string; role: string }>
  afterCatalogEditor: boolean
  stores: Array<{ id: string; name: string }>
}) {
  const storeName = (id: string) =>
    input.stores.find((store) => store.id === id)?.name ?? "a closed store"
  const after = new Map(
    input.after.map((row) => [row.storeId, row.role.toUpperCase()]),
  )
  const cuts: string[] = []
  if (input.legacy) {
    cuts.push(
      after.size
        ? `They can use every store today. After this, only ${[...after.keys()].map(storeName).join(", ")}.`
        : "They can use every store today. After this, no store.",
    )
  } else {
    for (const row of input.before) {
      const next = after.get(row.storeId)
      if (!next) cuts.push(`They lose ${storeName(row.storeId)}.`)
      else if (
        (staffRoleRank[next] ?? 9) >
        (staffRoleRank[row.role.toUpperCase()] ?? 9)
      )
        cuts.push(
          `They become ${getStaffRoleLabel(next)} in ${storeName(row.storeId)}.`,
        )
    }
  }
  if (input.beforeCatalogEditor && !input.afterCatalogEditor)
    cuts.push("They can no longer change items and prices.")
  return cuts
}

function AccessFormBody({
  userId,
  name,
  data,
  access,
  onSaved,
  onCancel,
  onSavingChange,
}: {
  userId: string
  name: string
  data: StaffAccessResponse
  access: StaffAccessRecord
  onSaved: () => Promise<void> | void
  onCancel: () => void
  onSavingChange?: (saving: boolean) => void
}) {
  const workflow = useDashboardWorkflow()
  const keepRef = useRef<HTMLButtonElement>(null)
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
    // Keep different roles per store when they already have them.
    storeRoles:
      roles.size > 1
        ? Object.fromEntries(
            assignments.map((row) => [
              row.storeId,
              row.role.toLowerCase() as StaffInviteRole,
            ]),
          )
        : null,
  })
  const [cuts, setCuts] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function review() {
    const next = describeAccessCut({
      legacy,
      before: assignments,
      beforeCatalogEditor: access.catalogEditor,
      after: pickerAssignments(value),
      afterCatalogEditor: pickerHasManager(value) && value.catalogEditor,
      stores: data.stores,
    })
    if (next.length) setCuts(next)
    else void save()
  }

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
          // Leaving "every store" was confirmed in the alert.
          confirmLegacyCutover: legacy,
          assignments: pickerAssignments(value),
          defaultStoreId: value.storeIds.length ? value.startStoreId : null,
          catalogEditor: pickerHasManager(value) && value.catalogEditor,
        }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error)
      setCuts(null)
      await onSaved()
    } catch {
      setCuts(null)
      setError("Couldn’t save. Try again.")
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
        review()
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
      {roles.size > 1 && !value.storeRoles ? (
        <FormFeedback appearance="dashboard" variant="default">
          Saving gives them this role in every store you pick.
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
          No stores picked. They won’t be able to sign in to any store.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={
            !data.storeAccessReady ||
            saving ||
            (value.storeIds.length > 0 && !value.startStoreId)
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
      <AlertDialog
        open={cuts !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setCuts(null)
        }}
      >
        <AlertDialogContent initialFocus={keepRef}>
          <AlertDialogTitle className="text-lg font-medium">
            Lower {name}’s access?
          </AlertDialogTitle>
          <AlertDialogDescription
            render={<div />}
            className="grid gap-1 text-base text-muted-foreground"
          >
            {(cuts ?? []).map((cut) => (
              <p key={cut}>{cut}</p>
            ))}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel ref={keepRef} disabled={saving}>
              Go back
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Lower access"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
