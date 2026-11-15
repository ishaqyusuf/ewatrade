"use client"

import { ConfirmAlert } from "@/components/forms/confirm-alert"
import { SettingsChoice } from "@/components/settings/settings-choice"
import {
  SettingsHeader,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/settings-page"
import { SettingsStorePicker } from "@/components/settings/settings-store-picker"
import { useSettingsAutosave } from "@/components/settings/use-settings-autosave"
import { useSettingsStoreParams } from "@/hooks/use-settings-store-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

type Mode = "OFF" | "OPEN" | "APPROVAL_REQUIRED"
type Field = "returnsMode" | "refundsMode"

const RETURNS: Array<{ value: Mode; label: string; description?: string }> = [
  { value: "OPEN", label: "Staff can take returns" },
  {
    value: "APPROVAL_REQUIRED",
    label: "Staff ask first",
    description: "An owner or admin approves each one.",
  },
  { value: "OFF", label: "No returns" },
]

const REFUNDS: Array<{ value: Mode; label: string; description?: string }> = [
  { value: "OPEN", label: "Managers can refund" },
  {
    value: "APPROVAL_REQUIRED",
    label: "Staff ask first",
    description: "An owner or admin approves each one.",
  },
  { value: "OFF", label: "No refunds" },
]

/** Owner/Admin: who can take returns and give money back at each store. */
export function ReturnRefundSettings({
  initialStoreId,
  stores,
}: {
  initialStoreId: string
  stores: Array<{ id: string; name: string }>
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const { storeId: param, setStoreId } = useSettingsStoreParams()
  const storeId = stores.some((store) => store.id === param)
    ? (param ?? initialStoreId)
    : initialStoreId
  const policy = useQuery(
    trpc.orders.changePolicy.queryOptions({ storeId }, { retry: false }),
  )
  const autosave = useSettingsAutosave()
  const [turningOff, setTurningOff] = useState<Field | null>(null)
  const update = useMutation(
    trpc.orders.updateChangePolicy.mutationOptions({
      onSettled: () =>
        Promise.allSettled([
          client.invalidateQueries({
            queryKey: trpc.orders.changePolicy.queryKey(),
          }),
          client.invalidateQueries({
            queryKey: trpc.orders.changeOptions.pathKey(),
          }),
        ]),
    }),
  )
  const storeName =
    stores.find((store) => store.id === storeId)?.name ?? "this store"

  const save = (field: Field, value: Mode) => {
    if (!policy.data) return
    const previous = {
      returnsMode: policy.data.returnsMode,
      refundsMode: policy.data.refundsMode,
    }
    const next = { ...previous, [field]: value }
    client.setQueryData(
      trpc.orders.changePolicy.queryKey({ storeId }),
      (current) =>
        current ? ({ ...current, ...next } as typeof current) : current,
    )
    update.mutate(
      { ...next, storeId },
      {
        onSuccess: () => {
          setTurningOff(null)
          autosave.confirm(field, "Saved.", () =>
            update.mutate({ ...previous, storeId }),
          )
        },
        onError: () => setTurningOff(null),
      },
    )
  }
  // Stopping returns or refunds asks first; other answers save at once.
  const choose = (field: Field, value: Mode) =>
    value === "OFF" ? setTurningOff(field) : save(field, value)

  return (
    <SettingsPage>
      <SettingsHeader
        title="Returns and refunds"
        actions={
          <SettingsStorePicker
            stores={stores}
            value={storeId}
            onChange={(next) => void setStoreId(next)}
          />
        }
      />
      {policy.isPending ? (
        <output className="text-sm text-muted-foreground">
          Loading returns and refunds…
        </output>
      ) : policy.isError ? (
        <div role="alert" className="grid justify-items-start gap-2 text-sm">
          <p>Couldn't load returns and refunds. {policy.error.message}</p>
          <Button variant="outline" onClick={() => void policy.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {!policy.data.canEdit ? (
            <p className="text-muted-foreground">
              Only owners and admins can change this.
            </p>
          ) : null}
          {update.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Couldn't save. {update.error.message}
            </p>
          ) : null}
          <SettingsSection title="Returns">
            <SettingsChoice
              label="Who can take a return"
              options={RETURNS}
              value={policy.data.returnsMode}
              disabled={!policy.data.canEdit || update.isPending}
              saved={autosave.saved("returnsMode")}
              onChange={(value) => choose("returnsMode", value)}
            />
          </SettingsSection>
          <SettingsSection title="Refunds">
            <SettingsChoice
              label="Who can give money back"
              options={REFUNDS}
              value={policy.data.refundsMode}
              disabled={!policy.data.canEdit || update.isPending}
              saved={autosave.saved("refundsMode")}
              onChange={(value) => choose("refundsMode", value)}
            />
          </SettingsSection>
          <ConfirmAlert
            open={turningOff !== null}
            danger
            title={
              turningOff === "refundsMode"
                ? `Stop refunds at ${storeName}?`
                : `Stop returns at ${storeName}?`
            }
            description={
              turningOff === "refundsMode"
                ? "No one can give money back, even for a return. Refunds already given stay as they are."
                : "Staff can't take returns. Returns already done stay as they are."
            }
            action={
              turningOff === "refundsMode" ? "Stop refunds" : "Stop returns"
            }
            pending={update.isPending}
            onCancel={() => setTurningOff(null)}
            onConfirm={() => {
              if (turningOff) save(turningOff, "OFF")
            }}
          />
        </>
      )}
    </SettingsPage>
  )
}
