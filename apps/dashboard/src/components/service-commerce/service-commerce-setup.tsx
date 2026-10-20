"use client"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FormActions,
  SelectControl,
  SubmitButton,
  Switch,
  toast,
} from "@ewatrade/ui"

import { FormFeedback } from "@/components/forms/form-feedback"
import { flattenServiceOfferings } from "@/components/service-work/service-utils"
import {
  SettingsHeader,
  SettingsNotice,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import { SettingsStorePicker } from "@/components/settings/settings-store-picker"
import { useSettingsAutosave } from "@/components/settings/use-settings-autosave"
import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useServiceCommerceSetupParams } from "@/hooks/use-service-commerce-setup-params"
import { useTRPC } from "@/trpc/client"
import type { ServiceCommerceProfileConfiguration } from "@ewatrade/service-commerce"

import { SettingsChoice } from "@/components/settings/settings-choice"
import { SettingsStatusPill } from "@/components/settings/settings-status-pill"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useId, useMemo, useState } from "react"
import {
  SERVICE_COMMERCE_FEATURES,
  type ServiceCommerceCapability,
  activationBlockerLabel,
  featureReadinessTag,
  plainSetupError,
} from "./service-commerce-setup-labels"
import { serviceCommerceSetupViewState } from "./service-commerce-setup-state"

type StoreOption = { id: string; name: string }
type SettingsValues = Omit<ServiceCommerceProfileConfiguration, "status">
type CatalogMode = SettingsValues["catalogAdoptionMode"]

// The server keeps a reason for every change; settings pages save without asking.
const CHANGE_REASON = "Changed in Bookings and quotes settings"

const CATALOG_MODE_OPTIONS: Array<{
  description: string
  label: string
  value: CatalogMode
}> = [
  {
    description: "Staff can quote a Service that isn't in your catalog yet.",
    label: "Add Services as you go",
    value: "progressive",
  },
  {
    description: "Quotes use items you've already added.",
    label: "Only from your catalog",
    value: "inventory_managed",
  },
]

export function ServiceCommerceSetup({
  initialStoreId,
  stores,
}: {
  initialStoreId: string
  stores: StoreOption[]
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useServiceCommerceSetupParams()
  const sheetParams = useServiceCommerceParams()
  const autosave = useSettingsAutosave()
  const idPrefix = useId()
  const storeId = useMemo(
    () =>
      stores.some((store) => store.id === params.storeId)
        ? (params.storeId ?? initialStoreId)
        : initialStoreId,
    [initialStoreId, params.storeId, stores],
  )
  const selectedStore =
    stores.find((store) => store.id === storeId) ?? stores[0]
  const accessQuery = useQuery(
    trpc.serviceCommerce.workspaceAccess.queryOptions(
      { storeId },
      { retry: false },
    ),
  )
  const serviceItems = useQuery(
    trpc.catalog.listItems.queryOptions({ kind: "service" }, { retry: false }),
  )
  const [confirmation, setConfirmation] = useState<boolean | null>(null)

  const invalidateAccess = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.serviceCommerce.workspaceAccess.queryKey({ storeId }),
    })

  const updateMutation = useMutation(
    trpc.serviceCommerce.updateProfile.mutationOptions({
      onSettled: () => invalidateAccess(),
    }),
  )
  const activationMutation = useMutation(
    trpc.serviceCommerce.setActivation.mutationOptions({
      onSuccess: async (_, variables) => {
        await invalidateAccess()
        setConfirmation(null)
        toast(
          variables.active
            ? "Bookings and quotes turned on."
            : "Bookings and quotes turned off.",
        )
      },
    }),
  )

  const state = serviceCommerceSetupViewState({
    canManage: accessQuery.data?.access.canManage ?? false,
    hasData: Boolean(accessQuery.data),
    hasError: Boolean(accessQuery.error),
    isLoading: accessQuery.isLoading,
  })

  if (state === "loading") return <ServiceCommerceSetupSkeleton />
  if (state === "error" || !accessQuery.data || !selectedStore) {
    return (
      <SettingsPage>
        <SettingsHeader title="Bookings and quotes" />
        <SettingsNotice
          tone="warning"
          action={
            <Button
              className="bg-background"
              onClick={() => void accessQuery.refetch()}
              size="sm"
              variant="outline"
            >
              Try again
            </Button>
          }
        >
          Couldn't load bookings and quotes.
        </SettingsNotice>
      </SettingsPage>
    )
  }

  const data = accessQuery.data
  const { status: _status, ...savedSettings } = data.configuration
  // While a change is saving, show the value being saved (always a full
  // SettingsValues: save() only sends those).
  const settings = updateMutation.isPending
    ? (updateMutation.variables.settings as SettingsValues)
    : savedSettings
  const bookingOfferings = flattenServiceOfferings(
    serviceItems.data ?? [],
    storeId,
  )
  const active = data.configuration.status === "active"
  const suspended = data.configuration.status === "suspended"
  const canManage = state === "ready"
  const isPending = updateMutation.isPending || activationMutation.isPending
  const blocked = !active && data.activationBlockers.length > 0
  const blockersId = `${idPrefix}-blockers`

  const save = (
    key: string,
    next: SettingsValues,
    expectedRevision: number,
    previous?: SettingsValues,
  ) =>
    updateMutation.mutate(
      { expectedRevision, reason: CHANGE_REASON, settings: next, storeId },
      {
        onError: (error) => toast.error(plainSetupError(error.message)),
        onSuccess: (result) => {
          if (!previous) {
            toast("Change undone.")
            return
          }
          autosave.confirm(key, "Saved.", () =>
            save(key, previous, result.revision),
          )
        },
      },
    )
  const change = (key: string, next: SettingsValues) =>
    save(key, next, data.revision, savedSettings)

  const setCapability = (
    capability: ServiceCommerceCapability,
    enabled: boolean,
  ) =>
    change(`capability.${capability}`, {
      ...savedSettings,
      capabilities: { ...savedSettings.capabilities, [capability]: enabled },
    })

  const confirmActivation = async () => {
    if (confirmation === null) return
    let expectedRevision = data.revision
    // A store that never saved its settings needs them saved before turning on.
    if (confirmation && data.revision === 0) {
      try {
        const saved = await updateMutation.mutateAsync({
          expectedRevision,
          reason: CHANGE_REASON,
          settings: savedSettings,
          storeId,
        })
        expectedRevision = saved.revision
      } catch (error) {
        toast.error(
          plainSetupError(error instanceof Error ? error.message : ""),
        )
        return
      }
    }
    activationMutation.mutate({
      active: confirmation,
      expectedRevision,
      reason: confirmation
        ? "Turned on in Bookings and quotes settings"
        : "Turned off in Bookings and quotes settings",
      storeId,
    })
  }

  return (
    <SettingsPage>
      <SettingsHeader
        title="Bookings and quotes"
        description="Let customers ask for a Service, get a quote or book a time."
        actions={
          <>
            <SettingsStorePicker
              stores={stores}
              value={storeId}
              onChange={(value) => void params.setStoreId(value)}
            />
            <SettingsStatusPill
              tone={active ? "ok" : suspended ? "bad" : "muted"}
            >
              {active ? "On" : suspended ? "On hold" : "Off"}
            </SettingsStatusPill>
            {canManage && !suspended ? (
              <span
                title={blocked ? "Finish the steps below first." : undefined}
              >
                <Button
                  aria-describedby={blocked ? blockersId : undefined}
                  className="h-9"
                  disabled={isPending || blocked}
                  onClick={() => setConfirmation(!active)}
                  variant={active ? "outline" : "default"}
                >
                  {active ? "Turn off" : "Turn on"}
                </Button>
              </span>
            ) : null}
            {canManage ? (
              <Button
                render={
                  <Link href={`/service-commerce/reports?store=${storeId}`} />
                }
                variant="outline"
                className="h-9"
              >
                View reports
              </Button>
            ) : null}
          </>
        }
      />

      {!canManage ? (
        <SettingsNotice>
          You can view these settings. Only an owner or admin can change them.
        </SettingsNotice>
      ) : null}
      {data.activationBlockers.length > 0 ? (
        <SettingsNotice tone="warning">
          <div id={blockersId}>
            <p className="font-semibold">
              {active ? "Finish these steps" : "Before you can turn this on"}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {data.activationBlockers.map((blocker) => (
                <li key={blocker}>
                  {activationBlockerLabel(blocker, savedSettings)}
                </li>
              ))}
            </ul>
          </div>
        </SettingsNotice>
      ) : null}

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open, details) => {
          if (!open && isPending) {
            details.cancel()
            return
          }
          if (!open) {
            activationMutation.reset()
            setConfirmation(null)
          }
        }}
      >
        <DialogContent className="max-w-[455px] p-4" hideClose={isPending}>
          <DialogHeader>
            <DialogTitle>
              Turn {confirmation ? "on" : "off"} bookings and quotes for{" "}
              {selectedStore.name}?
            </DialogTitle>
            <DialogDescription>
              {confirmation
                ? "Customers can send requests, get quotes and book times, using the features you've turned on."
                : "Customers can't send new requests or book times until you turn it back on."}
            </DialogDescription>
          </DialogHeader>
          {activationMutation.error ? (
            <FormFeedback appearance="dashboard">
              {plainSetupError(activationMutation.error.message)}
            </FormFeedback>
          ) : null}
          <FormActions className="mt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </Button>
            <SubmitButton
              type="button"
              isSubmitting={isPending}
              onClick={() => void confirmActivation()}
            >
              {confirmation ? "Turn on" : "Turn off"}
            </SubmitButton>
          </FormActions>
        </DialogContent>
      </Dialog>

      <SettingsSection
        title="Features"
        description="Turned-off or unfinished features are hidden from customers."
      >
        {SERVICE_COMMERCE_FEATURES.map((feature) => {
          const key = `capability.${feature.capability}`
          const id = `${idPrefix}-${feature.capability}`
          const enabled = settings.capabilities[feature.capability]
          const tag = featureReadinessTag(
            savedSettings.capabilities[feature.capability],
            data.readiness.capabilities[feature.capability],
          )
          return (
            <SettingsRow
              key={feature.capability}
              description={feature.help}
              disabled={!canManage}
              htmlFor={id}
              label={
                <span className="inline-flex flex-wrap items-center gap-2">
                  {feature.label}
                  {tag ? (
                    <SettingsStatusPill tone="warn">{tag}</SettingsStatusPill>
                  ) : null}
                </span>
              }
              saved={autosave.saved(key)}
            >
              <Switch
                id={id}
                checked={enabled}
                disabled={!canManage || isPending}
                onCheckedChange={(checked) =>
                  setCapability(feature.capability, checked)
                }
              />
            </SettingsRow>
          )
        })}
      </SettingsSection>

      <SettingsSection title="Your catalog">
        <SettingsChoice<CatalogMode>
          disabled={!canManage || isPending}
          label="How Services get into quotes"
          onChange={(value) =>
            change("catalogAdoptionMode", {
              ...savedSettings,
              catalogAdoptionMode: value,
            })
          }
          options={CATALOG_MODE_OPTIONS}
          saved={autosave.saved("catalogAdoptionMode")}
          value={settings.catalogAdoptionMode}
        />
        <SettingsRow
          description="You buy the item after the customer orders."
          disabled={!canManage}
          htmlFor={`${idPrefix}-procure`}
          label="Take orders for items you don't have yet"
          saved={autosave.saved("procureToOrderEnabled")}
        >
          <Switch
            id={`${idPrefix}-procure`}
            checked={settings.procureToOrderEnabled}
            disabled={!canManage || isPending}
            onCheckedChange={(checked) =>
              change("procureToOrderEnabled", {
                ...savedSettings,
                procureToOrderEnabled: checked,
              })
            }
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Appointments"
        description="Set open times, or create a booking link for one customer."
      >
        {serviceItems.isLoading ? (
          <div className="px-4 py-3.5">
            <div className="h-9 animate-pulse rounded-md bg-muted" />
          </div>
        ) : serviceItems.isError ? (
          <SettingsRow label="Couldn't load your Services.">
            <Button
              onClick={() => void serviceItems.refetch()}
              size="sm"
              variant="outline"
            >
              Try again
            </Button>
          </SettingsRow>
        ) : bookingOfferings.length === 0 ? (
          <SettingsRow
            label="No Services yet"
            description="Add a Service to your catalog first."
          />
        ) : (
          <SettingsRow
            label="Service"
            description="Pick a Service to set its open times or booking link."
            disabled={!canManage}
            htmlFor={`${idPrefix}-offering`}
          >
            <SelectControl
              id={`${idPrefix}-offering`}
              className="h-9 min-w-48"
              value=""
              disabled={!canManage}
              onValueChange={(offeringId) => {
                if (!offeringId) return
                void sheetParams.setParams({
                  offeringId,
                  serviceCommerceSheet: "booking",
                })
              }}
              options={[
                { value: "", label: <>Choose a Service</> },
                ...bookingOfferings.map((offering) => ({
                  value: offering.id,
                  label: offering.displayName,
                })),
              ]}
            />
          </SettingsRow>
        )}
      </SettingsSection>
    </SettingsPage>
  )
}

export function ServiceCommerceSetupSkeleton() {
  return (
    <SettingsPage>
      <div className="grid gap-2">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-96 animate-pulse rounded-[10px] bg-muted" />
      <div className="h-40 animate-pulse rounded-[10px] bg-muted" />
    </SettingsPage>
  )
}
