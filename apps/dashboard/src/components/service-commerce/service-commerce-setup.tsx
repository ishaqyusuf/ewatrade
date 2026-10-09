"use client"
import {
  Badge,
  Button,
  CheckboxField,
  ControlField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FormActions,
  SelectControl,
  SubmitButton,
  Textarea,
} from "@ewatrade/ui"

import {
  FormCheckboxControl,
  FormSelectControl,
} from "@/components/forms/form-controls"

import { FormFeedback } from "@/components/forms/form-feedback"
import { PageHeader, PageToolbar } from "@/components/page-header"
import { flattenServiceOfferings } from "@/components/service-work/service-utils"
import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useServiceCommerceSetupParams } from "@/hooks/use-service-commerce-setup-params"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import {
  SERVICE_COMMERCE_CAPABILITIES,
  type ServiceCommerceProfileConfiguration,
  serviceCommerceProfileSettingsSchema,
} from "@ewatrade/service-commerce"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { serviceCommerceSetupViewState } from "./service-commerce-setup-state"

type StoreOption = { id: string; name: string }
type SettingsValues = Omit<ServiceCommerceProfileConfiguration, "status">

const CAPABILITY_LABELS: Record<
  (typeof SERVICE_COMMERCE_CAPABILITIES)[number],
  string
> = {
  attachments: "Customer attachments",
  booking: "Bookings",
  delivery: "Delivery",
  intake: "Customer requests",
  payment: "Payments",
  pickup: "Pickup",
  progressive_catalog: "Progressive Catalog",
  quote: "Quotes",
  service_completion: "Service completion",
  staff: "Staff-assisted intake",
  web: "Web intake",
  whatsapp: "WhatsApp intake",
}

const ACTIVATION_LABELS: Record<string, string> = {
  channel_missing: "Enable at least one customer channel",
  channel_unavailable: "Make at least one customer channel ready",
  intake_disabled: "Enable customer requests",
  outcome_missing: "Enable Quotes or bookings",
  outcome_unavailable: "Complete setup for Quotes or bookings",
  progressive_catalog_disabled:
    "Enable Progressive Catalog for progressive mode",
  profile_suspended: "Resolve the Store policy suspension",
  store_inactive: "Activate the Store",
}

const defaultSettings: SettingsValues = {
  capabilities: {
    attachments: false,
    booking: false,
    delivery: false,
    intake: true,
    payment: true,
    pickup: false,
    progressive_catalog: true,
    quote: true,
    service_completion: true,
    staff: true,
    web: true,
    whatsapp: false,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: false,
}

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
  const form = useZodForm<SettingsValues>(
    serviceCommerceProfileSettingsSchema,
    { defaultValues: defaultSettings },
  )
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<boolean | null>(null)

  useEffect(() => {
    if (!accessQuery.data) return
    const { status: _, ...settings } = accessQuery.data.configuration
    form.reset(settings)
  }, [accessQuery.data, form])

  const invalidateAccess = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.serviceCommerce.workspaceAccess.queryKey({ storeId }),
    })

  const updateMutation = useMutation(
    trpc.serviceCommerce.updateProfile.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidateAccess()
        setMessage("Service Commerce settings saved.")
        setReason("")
      },
    }),
  )
  const activationMutation = useMutation(
    trpc.serviceCommerce.setActivation.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async (_, variables) => {
        await invalidateAccess()
        setConfirmation(null)
        setReason("")
        setMessage(
          variables.active
            ? "Service Commerce activated."
            : "Service Commerce deactivated.",
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
      <div className="grid min-w-0 gap-3">
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {accessQuery.error?.message ??
            "Service Commerce setup is unavailable."}
        </p>
        <Button
          appearance="form"
          className="w-fit"
          onClick={() => void accessQuery.refetch()}
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  const data = accessQuery.data
  const bookingOfferings = flattenServiceOfferings(
    serviceItems.data ?? [],
    storeId,
  )
  const active = data.configuration.status === "active"
  const suspended = data.configuration.status === "suspended"
  const canManage = state === "ready"
  const isPending = updateMutation.isPending || activationMutation.isPending

  return (
    <div className="grid min-w-0 flex-1 gap-6">
      <PageHeader
        eyebrow={selectedStore.name}
        title="Service Commerce"
        description="Choose which assisted-commerce capabilities this Store can prepare and operate."
      >
        <PageToolbar
          actions={
            <>
              {canManage ? (
                <Button
                  render={
                    <Link href={`/service-commerce/reports?store=${storeId}`} />
                  }
                  variant="outline"
                  className="h-9 rounded-md"
                >
                  Reports
                </Button>
              ) : null}
              {stores.length > 1 ? (
                <ControlField label={<>Store</>}>
                  <SelectControl
                    aria-label="Service Commerce Store"
                    onValueChange={(value) => void params.setStoreId(value)}
                    value={storeId}
                    options={[
                      ...(stores.map((store) => ({
                        value: store.id,
                        label: store.name,
                      })) ?? []),
                    ]}
                  />
                </ControlField>
              ) : null}
              <Badge
                variant={
                  suspended ? "destructive" : active ? "default" : "secondary"
                }
              >
                {active ? "Active" : suspended ? "Suspended" : "Disabled"}
              </Badge>
              {canManage && !suspended ? (
                <Button
                  className="h-9 rounded-md"
                  disabled={
                    isPending || (!active && data.activationBlockers.length > 0)
                  }
                  onClick={() => setConfirmation(!active)}
                  variant={active ? "outline" : "default"}
                >
                  {active ? "Deactivate" : "Activate"}
                </Button>
              ) : null}
            </>
          }
        />
      </PageHeader>

      {message ? (
        <FormFeedback appearance="dashboard" variant="default">
          {message}
        </FormFeedback>
      ) : null}
      {!canManage ? (
        <FormFeedback appearance="dashboard" variant="default">
          You can view this Store&apos;s readiness, but only a Tenant owner or
          admin can change it.
        </FormFeedback>
      ) : null}
      {data.activationBlockers.length > 0 ? (
        <section className="rounded-xl border border-border bg-background p-5">
          <h2 className="font-medium">Activation requirements</h2>
          <ul className="mt-2 grid gap-1 text-sm">
            {data.activationBlockers.map((blocker) => (
              <li key={blocker}>• {ACTIVATION_LABELS[blocker] ?? blocker}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open, details) => {
          if (!open && activationMutation.isPending) {
            details.cancel()
            return
          }
          if (!open) setConfirmation(null)
        }}
      >
        <DialogContent
          className="max-w-[455px] p-4"
          hideClose={activationMutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>
              Confirm {confirmation ? "activation" : "deactivation"}
            </DialogTitle>
            <DialogDescription>
              This changes what customers and operators can use for{" "}
              {selectedStore.name}.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="mt-4 gap-4">
            <ControlField
              label="Change reason"
              description="Enter at least 3 characters to confirm this configuration change."
            >
              <Textarea
                disabled={activationMutation.isPending}
                maxLength={240}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </ControlField>
            {activationMutation.error ? (
              <FormFeedback appearance="dashboard">
                {activationMutation.error.message}
              </FormFeedback>
            ) : null}
            <FormActions>
              <Button
                appearance="form"
                type="button"
                variant="outline"
                className="rounded-md"
                disabled={activationMutation.isPending}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </Button>
              <SubmitButton
                type="button"
                isSubmitting={activationMutation.isPending}
                disabled={reason.trim().length < 3}
                onClick={() => {
                  if (confirmation === null) return
                  activationMutation.mutate({
                    active: confirmation,
                    expectedRevision: data.revision,
                    reason,
                    storeId,
                  })
                }}
              >
                Confirm
              </SubmitButton>
            </FormActions>
          </FieldGroup>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <form
          className="rounded-xl border border-border bg-background p-5"
          onSubmit={form.handleSubmit((settings) =>
            updateMutation.mutate({
              expectedRevision: data.revision,
              reason,
              settings,
              storeId,
            }),
          )}
        >
          <FieldGroup className="min-w-0 grid gap-6">
            <FieldSet>
              <FieldLegend>Capabilities</FieldLegend>
              <FieldDescription>
                Disabled or incomplete capabilities remain unavailable to
                customers.
              </FieldDescription>
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                {SERVICE_COMMERCE_CAPABILITIES.map((capability) => (
                  <CheckboxField
                    key={capability}
                    label={CAPABILITY_LABELS[capability]}
                  >
                    <FormCheckboxControl
                      disabled={!canManage}
                      control={form.control}
                      name={`capabilities.${capability}`}
                    />
                  </CheckboxField>
                ))}
              </FieldGroup>
            </FieldSet>
            <ControlField label={<>Catalog adoption mode</>}>
              <FormSelectControl
                disabled={!canManage}
                control={form.control}
                name={"catalogAdoptionMode"}
                options={[
                  { value: "progressive", label: <>Progressive Catalog</> },
                  { value: "inventory_managed", label: <>Managed inventory</> },
                ]}
              />
            </ControlField>
            <CheckboxField
              label={<>Allow policy-approved procure-to-order commitments</>}
            >
              <FormCheckboxControl
                disabled={!canManage}
                control={form.control}
                name={"procureToOrderEnabled"}
              />
            </CheckboxField>
            <ControlField label={<>Change reason</>}>
              <Textarea
                disabled={!canManage}
                maxLength={240}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why this Store configuration is changing"
                value={reason}
              />
            </ControlField>
            {canManage ? (
              <FormActions>
                <SubmitButton
                  isSubmitting={isPending}
                  className="w-fit"
                  disabled={isPending || reason.trim().length < 3}
                  type="submit"
                >
                  {updateMutation.isPending ? "Saving…" : "Save settings"}
                </SubmitButton>
              </FormActions>
            ) : null}
          </FieldGroup>
        </form>

        <aside className="grid content-start gap-4 rounded-xl border border-border bg-background p-5">
          <div>
            <h2 className="font-semibold">Readiness</h2>
            <p className="text-sm text-muted-foreground">
              Server-evaluated for this Store and your access.
            </p>
          </div>
          <ul className="grid gap-2 text-sm">
            {SERVICE_COMMERCE_CAPABILITIES.map((capability) => {
              const readiness = data.readiness.capabilities[capability]
              return (
                <li
                  className="flex items-center justify-between gap-3"
                  key={capability}
                >
                  <span>{CAPABILITY_LABELS[capability]}</span>
                  <span className="text-xs capitalize text-muted-foreground">
                    {readiness.readiness.replaceAll("_", " ")}
                  </span>
                </li>
              )
            })}
          </ul>
          <section className="grid gap-3 border-t border-border pt-4">
            <div>
              <h2 className="font-semibold">Appointments</h2>
              <p className="text-sm text-muted-foreground">
                Configure availability or issue an expiring booking link for an
                eligible Service offering.
              </p>
            </div>
            {serviceItems.isLoading ? (
              <div className="h-10 animate-pulse bg-muted" />
            ) : serviceItems.isError ? (
              <div className="grid gap-2 text-sm text-destructive" role="alert">
                <p>
                  Service offerings are unavailable. Try again before
                  configuring booking.
                </p>
                <Button
                  appearance="form"
                  className="w-fit"
                  onClick={() => void serviceItems.refetch()}
                  size="sm"
                  variant="outline"
                >
                  Retry offerings
                </Button>
              </div>
            ) : bookingOfferings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add an available Service offering before configuring booking.
              </p>
            ) : (
              <ControlField label={<>Service offering</>}>
                <SelectControl
                  value=""
                  disabled={!canManage}
                  onValueChange={(value) => {
                    const offeringId = value
                    if (!offeringId) return
                    void sheetParams.setParams({
                      offeringId,
                      serviceCommerceSheet: "booking",
                    })
                  }}
                  options={[
                    { value: "", label: <>Choose an offering</> },
                    ...(bookingOfferings.map((offering) => ({
                      value: offering.id,
                      label: offering.displayName,
                    })) ?? []),
                  ]}
                />
              </ControlField>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

export function ServiceCommerceSetupSkeleton() {
  return (
    <div className="grid min-w-0 flex-1 gap-6">
      <div className="h-24 animate-pulse bg-muted" />
      <div className="h-96 animate-pulse bg-muted" />
    </div>
  )
}
