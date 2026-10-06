"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useSheetDismissal } from "@/hooks/use-sheet-dismissal"
import { useStaffParams } from "@/hooks/use-staff-params"
import type { StaffInviteRole } from "@/lib/staff-management"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  SelectControl,
} from "@ewatrade/ui"
import { useEffect, useState } from "react"

type Row = { storeId: string; role: StaffInviteRole }
type Access = {
  role: string
  status: string
  staffAccessMode: string
  staffAccessRevision: number
  catalogEditor: boolean
  staffStoreAssignments: Array<{ storeId: string; role: string }>
  retailOpsStaffProfile: { defaultStoreId: string | null } | null
}

export function ManageStaffAccessModal({
  onSaved,
}: { onSaved: () => Promise<void> }) {
  const { accessUserId, setAccessUserId } = useStaffParams()
  const [saving, setSaving] = useState(false)
  const { closeError, requestClose } = useSheetDismissal(() =>
    setAccessUserId(null),
  )
  return (
    <Dialog
      open={Boolean(accessUserId)}
      onOpenChange={(open) => {
        if (!open && !saving) void requestClose()
      }}
    >
      {accessUserId ? (
        <DialogContent className="max-w-[520px]">
          <div className="p-4">
            <DialogHeader className="mb-6 pr-8">
              <DialogTitle>Manage Store access</DialogTitle>
              <DialogDescription>
                Store removal revokes that Store only. Suspend staff separately
                to block the whole business.
              </DialogDescription>
            </DialogHeader>
            {closeError ? (
              <FormFeedback appearance="dashboard">{closeError}</FormFeedback>
            ) : null}
            <AccessForm
              key={accessUserId}
              userId={accessUserId}
              onSavingChange={setSaving}
              onSaved={async () => {
                await onSaved()
                await setAccessUserId(null)
              }}
            />
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function AccessForm({
  userId,
  onSaved,
  onSavingChange,
}: {
  userId: string
  onSaved: () => Promise<void>
  onSavingChange: (saving: boolean) => void
}) {
  const [ready, setReady] = useState(false)
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([])
  const [access, setAccess] = useState<Access | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [defaultStoreId, setDefaultStoreId] = useState<string | null>(null)
  const [catalogEditor, setCatalogEditor] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/staff?staffUserId=${encodeURIComponent(userId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok || !result.access)
          throw new Error(result.error ?? "Staff access not found.")
        setReady(result.storeAccessReady === true)
        setStores(result.stores)
        setAccess(result.access)
        setRows(
          result.access.staffStoreAssignments.map(
            (row: { storeId: string; role: string }) => ({
              storeId: row.storeId,
              role: row.role.toLowerCase() as StaffInviteRole,
            }),
          ),
        )
        setDefaultStoreId(
          result.access.retailOpsStaffProfile?.defaultStoreId ?? null,
        )
        setCatalogEditor(result.access.catalogEditor)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load access.",
          )
      })
    return () => controller.abort()
  }, [userId])
  if (!access)
    return error ? (
      <FormFeedback appearance="dashboard">{error}</FormFeedback>
    ) : (
      <p>Loading access…</p>
    )
  const hasManager = rows.some((row) => row.role === "manager")
  const incomplete = rows.some((row) => !row.storeId)
  const defaultOptions = rows
    .filter((row) => row.storeId)
    .map((row) => ({
      value: row.storeId,
      label:
        stores.find((store) => store.id === row.storeId)?.name ??
        "Unavailable Store",
    }))
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving) return
        setSaving(true)
        onSavingChange(true)
        setError(null)
        try {
          const response = await fetch("/api/staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operation: "access",
              staffUserId: userId,
              expectedRevision: access.staffAccessRevision,
              confirmLegacyCutover: confirmed,
              assignments: rows,
              defaultStoreId: rows.length ? defaultStoreId : null,
              catalogEditor: hasManager && catalogEditor,
            }),
          })
          const result = await response.json()
          if (!response.ok)
            throw new Error(result.error ?? "Could not save access.")
          await onSaved()
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not save access.",
          )
        } finally {
          setSaving(false)
          onSavingChange(false)
        }
      }}
    >
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      {access.staffAccessMode === "LEGACY" ? (
        <p className="text-sm text-muted-foreground">
          Current legacy role: {access.role.toLowerCase()}. Its existing access
          applies across the business. Select the Stores to keep; the starting
          Store is a preference.
        </p>
      ) : null}
      {rows.map((row, index) => (
        <div
          key={row.storeId || `draft-${index}`}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
        >
          <Field className="min-w-0">
            <FieldLabel htmlFor={`access-store-${index}`}>Store</FieldLabel>
            <SelectControl
              id={`access-store-${index}`}
              value={row.storeId}
              placeholder="Choose Store"
              disabled={saving}
              options={stores
                .filter(
                  (store) =>
                    store.id === row.storeId ||
                    !rows.some((other) => other.storeId === store.id),
                )
                .map((store) => ({ value: store.id, label: store.name }))}
              onValueChange={(value) => {
                setRows(
                  rows.map((current, i) =>
                    i === index ? { ...current, storeId: value } : current,
                  ),
                )
                if (!defaultStoreId || defaultStoreId === row.storeId)
                  setDefaultStoreId(value)
              }}
            />
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor={`access-role-${index}`}>Role</FieldLabel>
            <SelectControl
              id={`access-role-${index}`}
              value={row.role}
              disabled={saving}
              options={[
                { value: "cashier", label: "Cashier" },
                { value: "operator", label: "Operator" },
                { value: "manager", label: "Manager" },
              ]}
              onValueChange={(value) =>
                setRows(
                  rows.map((current, i) =>
                    i === index
                      ? { ...current, role: value as StaffInviteRole }
                      : current,
                  ),
                )
              }
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            className="col-span-2 justify-self-end sm:col-span-1"
            disabled={saving}
            aria-label={`Remove Store ${index + 1}`}
            onClick={() => {
              const remaining = rows.filter((_, i) => i !== index)
              setRows(remaining)
              if (defaultStoreId === row.storeId)
                setDefaultStoreId(remaining[0]?.storeId ?? null)
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={saving || incomplete || rows.length >= stores.length}
        onClick={() => setRows([...rows, { storeId: "", role: "cashier" }])}
      >
        Add Store assignment
      </Button>
      {rows.length ? (
        <Field className="min-w-0">
          <FieldLabel htmlFor="access-default-store">Starting Store</FieldLabel>
          <SelectControl
            id="access-default-store"
            value={defaultStoreId ?? ""}
            disabled={saving}
            options={defaultOptions}
            onValueChange={setDefaultStoreId}
          />
        </Field>
      ) : (
        <p className="text-sm text-muted-foreground">
          No Store assignments: this person cannot open a Store workspace.
        </p>
      )}
      {hasManager ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={catalogEditor}
            disabled={saving}
            onChange={(event) => setCatalogEditor(event.target.checked)}
          />
          Allow catalog editing across the business
        </label>
      ) : null}
      {access.staffAccessMode === "LEGACY" ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={saving}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I reviewed the existing business-wide access. Replace it with these
          Store roles. Operator will gain stock access; unselected Stores and
          legacy business permissions will be removed.
        </label>
      ) : null}
      {!ready ? (
        <FormFeedback appearance="dashboard">
          Store access changes are awaiting rollout verification.
        </FormFeedback>
      ) : null}
      <Button
        type="submit"
        disabled={
          !ready ||
          saving ||
          incomplete ||
          (rows.length > 0 && !defaultStoreId) ||
          (access.staffAccessMode === "LEGACY" && !confirmed)
        }
      >
        {saving ? "Saving…" : "Save access"}
      </Button>
    </form>
  )
}
