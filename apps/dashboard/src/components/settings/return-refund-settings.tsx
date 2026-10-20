"use client"

import {
  SettingsChoice,
  type SettingsChoiceOption,
  SettingsHeader,
  SettingsPage,
  SettingsSection,
} from "@/components/settings/settings-page"
import { SettingsStorePicker } from "@/components/settings/settings-store-picker"
import { useSettingsAutosave } from "@/components/settings/use-settings-autosave"
import { useSettingsStoreParams } from "@/hooks/use-settings-store-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { InformationCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

type Mode = "OFF" | "OPEN" | "APPROVAL_REQUIRED"
type Field = "returnsMode" | "refundsMode"

const RETURNS: SettingsChoiceOption<Mode>[] = [
  {
    value: "OPEN",
    label: "Staff can do it",
    description:
      "Staff record the return. Any money back follows the refund setting.",
  },
  {
    value: "APPROVAL_REQUIRED",
    label: "Staff must ask first",
    description: "An owner or admin approves each return.",
  },
  {
    value: "OFF",
    label: "Not allowed",
    description: "This store doesn't take returns.",
  },
]

const REFUNDS: SettingsChoiceOption<Mode>[] = [
  {
    value: "OPEN",
    label: "Managers can do it",
    description: "Owners, admins and managers can give money back.",
  },
  {
    value: "APPROVAL_REQUIRED",
    label: "Staff must ask first",
    description: "An owner or admin approves each refund.",
  },
  {
    value: "OFF",
    label: "Not allowed",
    description: "No money goes back, even for a return.",
  },
]

const FACTS = [
  "Owners and admins never need approval.",
  "Requests show on Home and on the order.",
  "An approval lasts until the end of the day, for the person who asked.",
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
        onSuccess: () =>
          autosave.confirm(
            field,
            `Saved. New ${field === "returnsMode" ? "returns" : "refunds"} at ${storeName} follow this setting.`,
            () => update.mutate({ ...previous, storeId }),
          ),
      },
    )
  }

  return (
    <SettingsPage>
      <SettingsHeader
        title="Returns and refunds"
        description="Choose who can take returns and give money back at each store."
        actions={
          <SettingsStorePicker
            stores={stores}
            value={storeId}
            onChange={(next) => void setStoreId(next)}
          />
        }
      />
      <ul className="grid gap-1 text-sm text-muted-foreground">
        {FACTS.map((fact) => (
          <li key={fact} className="flex items-center gap-2">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              className="size-4 shrink-0"
            />
            {fact}
          </li>
        ))}
      </ul>
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
            <p className="text-sm text-muted-foreground">
              Only owners and admins can change this.
            </p>
          ) : null}
          {update.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Couldn't save. {update.error.message}
            </p>
          ) : null}
          <SettingsSection title={`Returns at ${storeName}`}>
            <SettingsChoice
              name="returns"
              label="Who can take a return"
              options={RETURNS}
              value={policy.data.returnsMode}
              disabled={!policy.data.canEdit || update.isPending}
              saved={autosave.saved("returnsMode")}
              onChange={(value) => save("returnsMode", value)}
            />
          </SettingsSection>
          <SettingsSection title={`Refunds at ${storeName}`}>
            <SettingsChoice
              name="refunds"
              label="Who can give money back"
              options={REFUNDS}
              value={policy.data.refundsMode}
              disabled={!policy.data.canEdit || update.isPending}
              saved={autosave.saved("refundsMode")}
              onChange={(value) => save("refundsMode", value)}
            />
          </SettingsSection>
        </>
      )}
    </SettingsPage>
  )
}
