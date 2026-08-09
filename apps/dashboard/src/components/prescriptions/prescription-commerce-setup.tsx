"use client"

import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import {
  PRESCRIPTION_OPERATING_DAYS,
  type PrescriptionRoleAssignmentFormValues,
  type PrescriptionStoreSettingsFormValues,
  prescriptionOperatingHoursSchema,
  prescriptionRoleAssignmentFormSchema,
  prescriptionStoreSettingsFormSchema,
} from "@ewatrade/prescriptions/schemas"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"
import { PrescriptionOperationsSetup } from "./prescription-operations-setup"
import { PrescriptionPublicChannel } from "./prescription-public-channel"
import { WhatsAppConnectionSetup } from "./whatsapp-connection-setup"

const DAYS = PRESCRIPTION_OPERATING_DAYS
type SettingsFormValues = PrescriptionStoreSettingsFormValues
type RoleFormValues = PrescriptionRoleAssignmentFormValues

const defaultHours: SettingsFormValues["operatingHours"] = DAYS.map((day) => ({
  closesAt: day === "saturday" || day === "sunday" ? undefined : "18:00",
  day,
  isClosed: day === "saturday" || day === "sunday",
  opensAt: day === "saturday" || day === "sunday" ? undefined : "08:00",
}))

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
const areaClass =
  "min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

function normalizeHours(value: unknown) {
  const parsed = z.array(prescriptionOperatingHoursSchema).safeParse(value)
  if (!parsed.success) return defaultHours
  const byDay = new Map(parsed.data.map((entry) => [entry.day, entry]))
  return DAYS.map((day) => byDay.get(day) ?? defaultHours[DAYS.indexOf(day)])
}

const READINESS_LABELS: Record<string, string> = {
  attendant: "Assign an attendant",
  contact_policy: "Add the customer contact policy",
  fulfilment_mode: "Enable pickup or delivery",
  operating_hours: "Add operating hours",
  service_policy: "Add the service policy",
  verified_pharmacist: "Assign a verified pharmacist",
}

export function PrescriptionCommerceSetup({
  storeId,
  storeName,
}: {
  storeId: string
  storeName: string
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const setupQuery = useQuery(
    trpc.prescriptions.setup.queryOptions({ storeId }, { retry: false }),
  )
  const [message, setMessage] = useState<string | null>(null)
  const settingsForm = useZodForm<SettingsFormValues>(
    prescriptionStoreSettingsFormSchema,
    {
      defaultValues: {
        consentVersion: "2026-08-08",
        contactPolicy:
          "Contact customers only for prescription clarification and fulfilment updates.",
        deliveryEnabled: false,
        operatingHours: defaultHours,
        pickupEnabled: true,
        servicePolicy:
          "Every request requires attendant verification and pharmacist release before quotation.",
      },
    },
  )
  const roleForm = useZodForm<RoleFormValues>(
    prescriptionRoleAssignmentFormSchema,
    {
      defaultValues: {
        credentialReference: "",
        credentialVerified: false,
        role: "attendant",
        userId: "",
      },
    },
  )
  const selectedRole = roleForm.watch("role")

  useEffect(() => {
    const settings = setupQuery.data?.settings
    if (!settings) return
    settingsForm.reset({
      consentVersion: settings.consentVersion ?? "2026-08-08",
      contactPolicy: settings.contactPolicy ?? "",
      deliveryEnabled: settings.deliveryEnabled,
      operatingHours: normalizeHours(settings.operatingHours),
      pickupEnabled: settings.pickupEnabled,
      servicePolicy: settings.servicePolicy ?? "",
    })
  }, [settingsForm, setupQuery.data?.settings])

  const invalidateSetup = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.prescriptions.setup.queryKey({ storeId }),
    })

  const settingsMutation = useMutation(
    trpc.prescriptions.updateSettings.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidateSetup()
        setMessage("Prescription Commerce settings saved.")
      },
    }),
  )
  const roleMutation = useMutation(
    trpc.prescriptions.assignRole.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidateSetup()
        roleForm.reset()
        setMessage("Prescription role assigned.")
      },
    }),
  )
  const revokeMutation = useMutation(
    trpc.prescriptions.revokeRole.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidateSetup()
        setMessage("Prescription role revoked.")
      },
    }),
  )
  const activationMutation = useMutation(
    trpc.prescriptions.setActivation.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async (result) => {
        await invalidateSetup()
        setMessage(
          result.settings.status === "active"
            ? "Prescription Commerce activated."
            : "Prescription Commerce deactivated.",
        )
      },
    }),
  )

  if (setupQuery.isLoading) {
    return (
      <div className="grid flex-1 gap-6 p-6 lg:p-8">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (setupQuery.error || !setupQuery.data) {
    return (
      <div className="grid gap-3 p-6 lg:p-8">
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {setupQuery.error?.message ?? "Prescription setup is unavailable."}
        </p>
        <Button
          className="w-fit"
          onClick={() => void setupQuery.refetch()}
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  }

  const setup = setupQuery.data
  const active = setup.settings.status === "active"

  return (
    <div className="grid flex-1 gap-6 p-6 lg:p-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{storeName}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Prescription Commerce
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure pharmacy policies and professional roles before accepting
            prescription requests.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              active
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {active ? "Active" : "Disabled"}
          </span>
          <Button
            disabled={
              activationMutation.isPending ||
              (!active && !setup.readiness.ready)
            }
            onClick={() =>
              activationMutation.mutate({ active: !active, storeId })
            }
            variant={active ? "outline" : "default"}
          >
            {activationMutation.isPending
              ? "Updating…"
              : active
                ? "Deactivate"
                : "Activate"}
          </Button>
        </div>
      </header>

      {message ? (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm">{message}</p>
      ) : null}

      {!setup.readiness.ready ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-medium">Activation requirements</h2>
          <ul className="mt-2 grid gap-1 text-sm">
            {setup.readiness.missing.map((requirement) => (
              <li key={requirement}>
                • {READINESS_LABELS[requirement] ?? requirement}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <form
          className="grid gap-6 rounded-xl border border-border bg-card p-5"
          onSubmit={settingsForm.handleSubmit((values) =>
            settingsMutation.mutate({ ...values, storeId }),
          )}
        >
          <div>
            <h2 className="font-semibold">Operating policy</h2>
            <p className="text-sm text-muted-foreground">
              These settings are store-specific and do not replace pharmacist
              judgment.
            </p>
          </div>

          <div className="grid gap-3">
            <h3 className="text-sm font-medium">Operating hours</h3>
            {DAYS.map((day, index) => {
              const closed = settingsForm.watch(
                `operatingHours.${index}.isClosed`,
              )
              return (
                <div
                  className="grid items-center gap-2 sm:grid-cols-[110px_90px_1fr_1fr]"
                  key={day}
                >
                  <span className="text-sm capitalize">{day}</span>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      {...settingsForm.register(
                        `operatingHours.${index}.isClosed`,
                      )}
                    />
                    Closed
                  </label>
                  <input
                    aria-label={`${day} opening time`}
                    className={fieldClass}
                    disabled={closed}
                    type="time"
                    {...settingsForm.register(
                      `operatingHours.${index}.opensAt`,
                    )}
                  />
                  <input
                    aria-label={`${day} closing time`}
                    className={fieldClass}
                    disabled={closed}
                    type="time"
                    {...settingsForm.register(
                      `operatingHours.${index}.closesAt`,
                    )}
                  />
                  <input
                    type="hidden"
                    value={day}
                    {...settingsForm.register(`operatingHours.${index}.day`)}
                  />
                </div>
              )
            })}
            {settingsForm.formState.errors.operatingHours ? (
              <p className="text-sm text-destructive">
                Check each open day's opening and closing times.
              </p>
            ) : null}
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Service policy</span>
            <textarea
              className={areaClass}
              {...settingsForm.register("servicePolicy")}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Customer contact policy</span>
            <textarea
              className={areaClass}
              {...settingsForm.register("contactPolicy")}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Consent text version</span>
            <input
              className={fieldClass}
              {...settingsForm.register("consentVersion")}
            />
          </label>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">
              Fulfilment modes
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...settingsForm.register("pickupEnabled")}
              />
              Pickup
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...settingsForm.register("deliveryEnabled")}
              />
              Delivery
            </label>
            {settingsForm.formState.errors.pickupEnabled ? (
              <p className="text-sm text-destructive">
                {settingsForm.formState.errors.pickupEnabled.message}
              </p>
            ) : null}
          </fieldset>
          <Button disabled={settingsMutation.isPending} type="submit">
            {settingsMutation.isPending ? "Saving…" : "Save policy"}
          </Button>
        </form>

        <div className="grid content-start gap-6">
          <form
            className="grid gap-4 rounded-xl border border-border bg-card p-5"
            onSubmit={roleForm.handleSubmit((values) =>
              roleMutation.mutate({
                ...values,
                credentialReference:
                  values.role === "pharmacist"
                    ? values.credentialReference?.trim()
                    : undefined,
                storeId,
              }),
            )}
          >
            <div>
              <h2 className="font-semibold">Professional roles</h2>
              <p className="text-sm text-muted-foreground">
                Roles apply only to this store.
              </p>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Team member</span>
              <select className={fieldClass} {...roleForm.register("userId")}>
                <option value="">Select a team member</option>
                {setup.eligibleMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {member.tenantRole}
                  </option>
                ))}
              </select>
              {roleForm.formState.errors.userId ? (
                <span className="text-destructive">
                  {roleForm.formState.errors.userId.message}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Prescription role</span>
              <select className={fieldClass} {...roleForm.register("role")}>
                <option value="attendant">Attendant</option>
                <option value="pharmacist">Pharmacist</option>
              </select>
            </label>
            {selectedRole === "pharmacist" ? (
              <>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Credential reference</span>
                  <input
                    className={fieldClass}
                    {...roleForm.register("credentialReference")}
                  />
                  {roleForm.formState.errors.credentialReference ? (
                    <span className="text-destructive">
                      {roleForm.formState.errors.credentialReference.message}
                    </span>
                  ) : null}
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type="checkbox"
                    {...roleForm.register("credentialVerified")}
                  />
                  I confirm this credential was verified outside EwaTrade.
                </label>
              </>
            ) : null}
            <Button disabled={roleMutation.isPending} type="submit">
              {roleMutation.isPending ? "Assigning…" : "Assign role"}
            </Button>
          </form>

          <section className="grid gap-3 rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Assigned roles</h2>
            {setup.roles.filter((role) => role.status === "active").length ===
            0 ? (
              <p className="text-sm text-muted-foreground">
                No active prescription roles assigned.
              </p>
            ) : (
              setup.roles
                .filter((role) => role.status === "active")
                .map((role) => (
                  <div
                    className="flex items-start justify-between gap-3 border-t border-border pt-3 first:border-0 first:pt-0"
                    key={role.id}
                  >
                    <div>
                      <p className="text-sm font-medium">{role.user.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {role.role}
                        {role.credentialReference
                          ? ` · ${role.credentialReference}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      disabled={revokeMutation.isPending}
                      onClick={() =>
                        revokeMutation.mutate({ roleId: role.id, storeId })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Revoke
                    </Button>
                  </div>
                ))
            )}
          </section>
        </div>
      </div>
      <PrescriptionPublicChannel storeId={storeId} />
      <WhatsAppConnectionSetup storeId={storeId} />
      <PrescriptionOperationsSetup storeId={storeId} />
    </div>
  )
}
