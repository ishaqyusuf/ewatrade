"use client"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  CheckboxField,
  ControlField,
  FieldGroup,
  FormActions,
  Input,
  SubmitButton,
  Textarea,
} from "@ewatrade/ui"

import {
  FormCheckboxControl,
  FormSelectControl,
} from "@/components/forms/form-controls"

import { PageHeader, PageToolbar } from "@/components/page-header"
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"

const DAYS = PRESCRIPTION_OPERATING_DAYS
type PrescriptionSettingsFormValues = PrescriptionStoreSettingsFormValues
type RoleFormValues = PrescriptionRoleAssignmentFormValues

const defaultHours: PrescriptionSettingsFormValues["operatingHours"] = DAYS.map(
  (day) => ({
    closesAt: day === "saturday" || day === "sunday" ? undefined : "18:00",
    day,
    isClosed: day === "saturday" || day === "sunday",
    opensAt: day === "saturday" || day === "sunday" ? undefined : "08:00",
  }),
)

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

export function PharmacyComplianceSetup({
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
  const [activationDialogOpen, setActivationDialogOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<{
    id: string
    name: string
    role: string
  } | null>(null)
  const settingsForm = useZodForm<PrescriptionSettingsFormValues>(
    prescriptionStoreSettingsFormSchema,
    {
      defaultValues: {
        consentVersion: "2026-08-08",
        contactPolicy:
          "Contact customers only for prescription clarification and fulfilment updates.",
        operatingHours: defaultHours,
        deliveryEnabled: false,
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
        setMessage("Pharmacy compliance settings saved.")
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
            ? "Pharmacy compliance activated."
            : "Pharmacy compliance deactivated.",
        )
      },
    }),
  )

  if (setupQuery.isLoading) {
    return (
      <div className="grid min-w-0 flex-1 gap-6">
        <div className="h-24 animate-pulse bg-muted" />
        <div className="h-96 animate-pulse bg-muted" />
      </div>
    )
  }

  if (setupQuery.error || !setupQuery.data) {
    return (
      <div className="grid min-w-0 gap-3">
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {setupQuery.error?.message ?? "Pharmacy compliance is unavailable."}
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
    <div className="grid min-w-0 flex-1 gap-6">
      <PageHeader
        eyebrow={storeName}
        title="Pharmacy compliance"
        description="Configure pharmacy consent, professional roles, and clinical operating controls before accepting prescription requests."
      >
        <PageToolbar
          actions={
            <>
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
                appearance="form"
                className="h-9 rounded-md"
                disabled={
                  activationMutation.isPending ||
                  (!active && !setup.readiness.ready)
                }
                onClick={() => setActivationDialogOpen(true)}
                variant={active ? "outline" : "default"}
              >
                {activationMutation.isPending
                  ? "Updating…"
                  : active
                    ? "Deactivate"
                    : "Activate"}
              </Button>
            </>
          }
        />
      </PageHeader>

      {message ? (
        <p className="border border-border bg-muted px-4 py-3 text-sm">
          {message}
        </p>
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
          className="rounded-xl border border-border bg-card p-5"
          onSubmit={settingsForm.handleSubmit((values) =>
            settingsMutation.mutate({
              ...values,
              storeId,
            }),
          )}
        >
          <FieldGroup className="min-w-0 grid gap-6">
            <div>
              <h2 className="font-semibold">Clinical operating policy</h2>
              <p className="text-sm text-muted-foreground">
                These settings are store-specific and do not replace pharmacist
                judgment.
              </p>
            </div>

            <div className="grid gap-3">
              <h3 className="text-sm font-medium">Fulfilment options</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <CheckboxField label={<>Customer pickup</>}>
                  <FormCheckboxControl
                    control={settingsForm.control}
                    name="pickupEnabled"
                  />
                </CheckboxField>
                <CheckboxField label={<>Store delivery</>}>
                  <FormCheckboxControl
                    control={settingsForm.control}
                    name="deliveryEnabled"
                  />
                </CheckboxField>
              </div>
              <p className="text-xs text-muted-foreground">
                Enable at least one option before activating this pharmacy.
                Delivery zones and fees are configured in Privacy and Operations
                below.
              </p>
              {settingsForm.formState.errors.pickupEnabled ? (
                <p className="text-sm text-destructive">
                  Enable pickup, delivery, or both.
                </p>
              ) : null}
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
                    <CheckboxField label={<>Closed</>}>
                      <FormCheckboxControl
                        control={settingsForm.control}
                        name={`operatingHours.${index}.isClosed`}
                      />
                    </CheckboxField>
                    <Input
                      aria-label={`${day} opening time`}
                      disabled={closed}
                      type="time"
                      {...settingsForm.register(
                        `operatingHours.${index}.opensAt`,
                      )}
                    />
                    <Input
                      aria-label={`${day} closing time`}
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

            <ControlField label={<>Service policy</>}>
              <Textarea {...settingsForm.register("servicePolicy")} />
            </ControlField>
            <ControlField label={<>Customer contact policy</>}>
              <Textarea {...settingsForm.register("contactPolicy")} />
            </ControlField>
            <ControlField label={<>Consent text version</>}>
              <Input {...settingsForm.register("consentVersion")} />
            </ControlField>
            <FormActions>
              <SubmitButton
                isSubmitting={settingsMutation.isPending}
                disabled={settingsMutation.isPending}
                type="submit"
              >
                {settingsMutation.isPending ? "Saving…" : "Save policy"}
              </SubmitButton>
            </FormActions>
          </FieldGroup>
        </form>

        <div className="grid content-start gap-6">
          <form
            className="rounded-xl border border-border bg-card p-5"
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
            <FieldGroup className="min-w-0 grid gap-4">
              <div>
                <h2 className="font-semibold">Professional roles</h2>
                <p className="text-sm text-muted-foreground">
                  Roles apply only to this store.
                </p>
              </div>
              <ControlField
                label={<>Team member</>}
                error={roleForm.formState.errors.userId?.message}
              >
                <FormSelectControl
                  control={roleForm.control}
                  name={"userId"}
                  options={[
                    { value: "", label: <>Select a team member</> },
                    ...(setup.eligibleMembers.map((member) => ({
                      value: member.id,
                      label: (
                        <>
                          {member.name} · {member.tenantRole}
                        </>
                      ),
                    })) ?? []),
                  ]}
                />
              </ControlField>
              <ControlField label={<>Prescription role</>}>
                <FormSelectControl
                  control={roleForm.control}
                  name={"role"}
                  options={[
                    { value: "attendant", label: <>Attendant</> },
                    { value: "pharmacist", label: <>Pharmacist</> },
                  ]}
                />
              </ControlField>
              {selectedRole === "pharmacist" ? (
                <>
                  <ControlField
                    label={<>Credential reference</>}
                    error={
                      roleForm.formState.errors.credentialReference?.message
                    }
                  >
                    <Input {...roleForm.register("credentialReference")} />
                  </ControlField>
                  <CheckboxField
                    label={
                      <>
                        I confirm this credential was verified outside EwaTrade.
                      </>
                    }
                  >
                    <FormCheckboxControl
                      control={roleForm.control}
                      name={"credentialVerified"}
                    />
                  </CheckboxField>
                </>
              ) : null}
              <FormActions>
                <SubmitButton
                  isSubmitting={roleMutation.isPending}
                  disabled={roleMutation.isPending}
                  type="submit"
                >
                  {roleMutation.isPending ? "Assigning…" : "Assign role"}
                </SubmitButton>
              </FormActions>
            </FieldGroup>
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
                      appearance="form"
                      disabled={revokeMutation.isPending}
                      onClick={() =>
                        setRevokeTarget({
                          id: role.id,
                          name: role.user.name,
                          role: role.role,
                        })
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

      <AlertDialog
        open={activationDialogOpen}
        onOpenChange={setActivationDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogTitle className="text-lg font-medium">
            {active ? "Deactivate prescription intake?" : "Activate pharmacy?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            {active
              ? "New prescription requests will stop entering this Store's queue. Existing requests and records will remain available to authorized staff."
              : "The Store will begin accepting prescription requests under the configured policy and assigned professional roles."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              appearance="form"
              disabled={activationMutation.isPending}
              onClick={() => {
                activationMutation.mutate({ active: !active, storeId })
                setActivationDialogOpen(false)
              }}
              type="button"
              variant={active ? "destructive" : "default"}
            >
              {active ? "Deactivate intake" : "Activate pharmacy"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle className="text-lg font-medium">
            Revoke {revokeTarget?.role} access?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            {revokeTarget?.name} will lose this Store's {revokeTarget?.role}{" "}
            role and prescription workspace access. Existing prescription
            records will remain unchanged.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              appearance="form"
              disabled={revokeMutation.isPending}
              onClick={() => {
                if (revokeTarget) {
                  revokeMutation.mutate({ roleId: revokeTarget.id, storeId })
                }
                setRevokeTarget(null)
              }}
              type="button"
              variant="destructive"
            >
              Revoke role
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
