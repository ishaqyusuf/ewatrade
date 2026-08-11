"use client"

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
import { Button } from "@ewatrade/ui"
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
      <div className="grid gap-3 p-6 lg:p-8">
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {accessQuery.error?.message ??
            "Service Commerce setup is unavailable."}
        </p>
        <Button
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
    <div className="grid flex-1 gap-6 p-6 lg:p-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{selectedStore.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Service Commerce
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Choose which assisted-commerce capabilities this Store can prepare
            and operate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canManage ? (
            <Button
              render={
                <Link href={`/service-commerce/reports?store=${storeId}`} />
              }
              variant="outline"
            >
              Reports
            </Button>
          ) : null}
          {stores.length > 1 ? (
            <label className="grid gap-1 text-xs text-muted-foreground">
              Store
              <select
                aria-label="Service Commerce Store"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                onChange={(event) => void params.setStoreId(event.target.value)}
                value={storeId}
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              active
                ? "bg-emerald-100 text-emerald-800"
                : suspended
                  ? "bg-destructive/10 text-destructive"
                  : "bg-amber-100 text-amber-800"
            }`}
          >
            {active ? "Active" : suspended ? "Suspended" : "Disabled"}
          </span>
          {canManage && !suspended ? (
            <Button
              disabled={
                isPending || (!active && data.activationBlockers.length > 0)
              }
              onClick={() => setConfirmation(!active)}
              variant={active ? "outline" : "default"}
            >
              {active ? "Deactivate" : "Activate"}
            </Button>
          ) : null}
        </div>
      </header>

      {message ? (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm">{message}</p>
      ) : null}
      {!canManage ? (
        <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          You can view this Store&apos;s readiness, but only a Tenant owner or
          admin can change it.
        </p>
      ) : null}
      {data.activationBlockers.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-medium">Activation requirements</h2>
          <ul className="mt-2 grid gap-1 text-sm">
            {data.activationBlockers.map((blocker) => (
              <li key={blocker}>• {ACTIVATION_LABELS[blocker] ?? blocker}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {confirmation !== null ? (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <h2 className="font-medium">
            Confirm {confirmation ? "activation" : "deactivation"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This changes what customers and operators can use for{" "}
            {selectedStore.name}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={
                reason.trim().length < 3 || activationMutation.isPending
              }
              onClick={() =>
                activationMutation.mutate({
                  active: confirmation,
                  expectedRevision: data.revision,
                  reason,
                  storeId,
                })
              }
            >
              Confirm
            </Button>
            <Button onClick={() => setConfirmation(null)} variant="outline">
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <form
          className="grid gap-6 rounded-xl border border-border bg-card p-5"
          onSubmit={form.handleSubmit((settings) =>
            updateMutation.mutate({
              expectedRevision: data.revision,
              reason,
              settings,
              storeId,
            }),
          )}
        >
          <div>
            <h2 className="font-semibold">Capabilities</h2>
            <p className="text-sm text-muted-foreground">
              Disabled or incomplete capabilities remain unavailable to
              customers.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SERVICE_COMMERCE_CAPABILITIES.map((capability) => (
              <label
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"
                key={capability}
              >
                <input
                  disabled={!canManage}
                  type="checkbox"
                  {...form.register(`capabilities.${capability}`)}
                />
                {CAPABILITY_LABELS[capability]}
              </label>
            ))}
          </div>
          <label className="grid gap-2 text-sm">
            Catalog adoption mode
            <select
              className="h-10 rounded-lg border border-border bg-background px-3"
              disabled={!canManage}
              {...form.register("catalogAdoptionMode")}
            >
              <option value="progressive">Progressive Catalog</option>
              <option value="inventory_managed">Managed inventory</option>
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              disabled={!canManage}
              type="checkbox"
              {...form.register("procureToOrderEnabled")}
            />
            Allow policy-approved procure-to-order commitments
          </label>
          <label className="grid gap-2 text-sm">
            Change reason
            <textarea
              className="min-h-24 rounded-lg border border-border bg-background px-3 py-2"
              disabled={!canManage}
              maxLength={240}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this Store configuration is changing"
              value={reason}
            />
          </label>
          {canManage ? (
            <Button
              className="w-fit"
              disabled={isPending || reason.trim().length < 3}
              type="submit"
            >
              {updateMutation.isPending ? "Saving…" : "Save settings"}
            </Button>
          ) : null}
        </form>

        <aside className="grid content-start gap-4 rounded-xl border border-border bg-card p-5">
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
              <div className="h-10 animate-pulse rounded-lg bg-muted" />
            ) : serviceItems.isError ? (
              <div className="grid gap-2 text-sm text-destructive" role="alert">
                <p>
                  Service offerings are unavailable. Try again before
                  configuring booking.
                </p>
                <Button
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
              <label className="grid gap-2 text-sm">
                Service offering
                <select
                  className="h-10 rounded-lg border border-border bg-background px-3"
                  defaultValue=""
                  disabled={!canManage}
                  onChange={(event) => {
                    const offeringId = event.target.value
                    if (!offeringId) return
                    void sheetParams.setParams({
                      offeringId,
                      serviceCommerceSheet: "booking",
                    })
                    event.currentTarget.value = ""
                  }}
                >
                  <option value="">Choose an offering</option>
                  {bookingOfferings.map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {offering.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

export function ServiceCommerceSetupSkeleton() {
  return (
    <div className="grid flex-1 gap-6 p-6 lg:p-8">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-96 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
