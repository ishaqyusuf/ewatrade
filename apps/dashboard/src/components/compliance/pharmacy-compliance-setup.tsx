"use client"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Badge,
  Button,
  Input,
  Switch,
  Textarea,
  toast,
} from "@ewatrade/ui"

import {
  ComplianceField,
  ComplianceSaveRow,
} from "@/components/compliance/compliance-form-parts"
import { PharmacyStaffRoles } from "@/components/compliance/pharmacy-staff-roles"
import {
  SettingsHeader,
  SettingsNotice,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-page"
import { SettingsStorePicker } from "@/components/settings/settings-store-picker"
import { useSettingsStoreParams } from "@/hooks/use-settings-store-params"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import {
  PRESCRIPTION_OPERATING_DAYS,
  type PrescriptionStoreSettingsFormValues,
  prescriptionOperatingHoursSchema,
  prescriptionStoreSettingsFormSchema,
} from "@ewatrade/prescriptions/schemas"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useEffect, useId, useState } from "react"
import { Controller } from "react-hook-form"
import { z } from "zod"

const DAYS = PRESCRIPTION_OPERATING_DAYS
type PrescriptionSettingsFormValues = PrescriptionStoreSettingsFormValues

const DEFAULT_OPENS_AT = "08:00"
const DEFAULT_CLOSES_AT = "18:00"
const DEFAULT_CONSENT_VERSION = "2026-08-08"

const defaultHours: PrescriptionSettingsFormValues["operatingHours"] = DAYS.map(
  (day) => ({
    closesAt:
      day === "saturday" || day === "sunday" ? undefined : DEFAULT_CLOSES_AT,
    day,
    isClosed: day === "saturday" || day === "sunday",
    opensAt:
      day === "saturday" || day === "sunday" ? undefined : DEFAULT_OPENS_AT,
  }),
)

function normalizeHours(value: unknown) {
  const parsed = z.array(prescriptionOperatingHoursSchema).safeParse(value)
  if (!parsed.success) return defaultHours
  const byDay = new Map(parsed.data.map((entry) => [entry.day, entry]))
  return DAYS.map(
    (day) =>
      byDay.get(day) ??
      defaultHours.find((entry) => entry.day === day) ?? {
        day,
        isClosed: true,
      },
  )
}

function dayName(day: string) {
  return day.charAt(0).toUpperCase() + day.slice(1)
}

const READINESS_LABELS: Record<string, string> = {
  attendant: "Add an attendant",
  contact_policy: "Say when you contact customers",
  fulfilment_mode: "Turn on pickup, delivery or both",
  operating_hours: "Set your opening hours",
  service_policy: "Say how you handle each prescription",
  verified_pharmacist: "Add a pharmacist whose licence you've checked",
}

function readinessSteps(missing: string[]) {
  const steps = missing.map(
    (key) => READINESS_LABELS[key] ?? "Finish the rest of the setup below",
  )
  return [...new Set(steps)]
}

type StoredSettings = {
  consentVersion: string | null
  contactPolicy: string | null
  deliveryEnabled: boolean
  operatingHours: unknown
  pickupEnabled: boolean
  servicePolicy: string | null
}

function formValuesFrom(
  settings: StoredSettings,
): PrescriptionSettingsFormValues {
  return {
    consentVersion: settings.consentVersion ?? DEFAULT_CONSENT_VERSION,
    contactPolicy: settings.contactPolicy ?? "",
    deliveryEnabled: settings.deliveryEnabled,
    operatingHours: normalizeHours(settings.operatingHours),
    pickupEnabled: settings.pickupEnabled,
    servicePolicy: settings.servicePolicy ?? "",
  }
}

export function PharmacyComplianceSetup({
  storeId,
  stores,
}: {
  storeId: string
  stores: Array<{ id: string; name: string }>
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { setStoreId } = useSettingsStoreParams()
  const setupQuery = useQuery(
    trpc.prescriptions.setup.queryOptions({ storeId }, { retry: false }),
  )
  const [activationDialogOpen, setActivationDialogOpen] = useState(false)
  const noticeId = useId()

  const invalidateSetup = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.prescriptions.setup.queryKey({ storeId }),
    })

  const activationMutation = useMutation(
    trpc.prescriptions.setActivation.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: async (result) => {
        await invalidateSetup()
        toast(
          result.settings.status === "active"
            ? "Prescriptions are on. Customers can send them now."
            : "Prescriptions are off. New ones won't come in.",
        )
      },
    }),
  )

  const header = (actions?: ReactNode) => (
    <SettingsHeader
      title="Pharmacy compliance"
      description="Set how your pharmacy handles prescriptions. Customers can't send one until this is on."
      actions={
        <>
          <SettingsStorePicker
            stores={stores}
            value={storeId}
            onChange={(next) => void setStoreId(next)}
          />
          {actions}
        </>
      }
    />
  )

  if (setupQuery.isLoading) {
    return (
      <>
        {header()}
        <div className="grid gap-7" aria-busy="true">
          <div className="h-28 animate-pulse rounded-[10px] bg-muted" />
          <div className="h-96 animate-pulse rounded-[10px] bg-muted" />
        </div>
      </>
    )
  }

  if (setupQuery.error || !setupQuery.data) {
    return (
      <>
        {header()}
        <SettingsNotice
          tone="warning"
          action={
            <Button
              onClick={() => void setupQuery.refetch()}
              size="sm"
              variant="outline"
            >
              Try again
            </Button>
          }
        >
          Couldn't load pharmacy compliance.
        </SettingsNotice>
      </>
    )
  }

  const setup = setupQuery.data
  const active = setup.settings.status === "active"
  const ready = setup.readiness.ready
  const steps = readinessSteps(setup.readiness.missing)

  return (
    <>
      {header(
        <>
          <Badge variant={active ? "default" : "secondary"}>
            {active ? "On" : "Off"}
          </Badge>
          {active ? (
            <Button
              disabled={activationMutation.isPending}
              onClick={() => setActivationDialogOpen(true)}
              variant="outline"
            >
              Turn off
            </Button>
          ) : (
            <span
              title={ready ? undefined : "Finish the steps below first."}
              className="inline-flex"
            >
              <Button
                aria-describedby={ready ? undefined : noticeId}
                disabled={activationMutation.isPending || !ready}
                onClick={() => setActivationDialogOpen(true)}
              >
                Turn on
              </Button>
            </span>
          )}
        </>,
      )}

      {!ready ? (
        <SettingsNotice tone="warning">
          <div id={noticeId}>
            <p className="font-semibold">Before you can turn this on</p>
            <ul className="mt-1.5 grid list-disc gap-0.5 pl-5">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        </SettingsNotice>
      ) : null}

      <PharmacyPolicyForm
        key={storeId}
        settings={setup.settings}
        storeId={storeId}
        onSaved={invalidateSetup}
      />

      <PharmacyStaffRoles
        eligibleMembers={setup.eligibleMembers}
        onChanged={invalidateSetup}
        roles={setup.roles}
        storeId={storeId}
      />

      <AlertDialog
        open={activationDialogOpen}
        onOpenChange={setActivationDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogTitle className="text-lg font-medium">
            {active ? "Turn off prescriptions?" : "Turn on prescriptions?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            {active
              ? "New prescriptions stop coming in. Requests you already have stay available to your team."
              : "Customers can send prescriptions to this store. Your team handles them the way you set on this page."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={activationMutation.isPending}
              onClick={() => {
                activationMutation.mutate({ active: !active, storeId })
                setActivationDialogOpen(false)
              }}
              type="button"
              variant={active ? "destructive" : "default"}
            >
              {active ? "Turn off" : "Turn on"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Pickup and delivery, opening hours and how you work save together: the
 * settings mutation only accepts the whole policy, so one Save covers them.
 */
function PharmacyPolicyForm({
  onSaved,
  settings,
  storeId,
}: {
  onSaved: () => Promise<unknown>
  settings: StoredSettings & { updatedAt: Date | string | null }
  storeId: string
}) {
  const trpc = useTRPC()
  const ids = useId()
  const form = useZodForm<PrescriptionSettingsFormValues>(
    prescriptionStoreSettingsFormSchema,
    { defaultValues: formValuesFrom(settings) },
  )
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    form.reset(formValuesFrom(settings))
  }, [form, settings])

  const saveMutation = useMutation(
    trpc.prescriptions.updateSettings.mutationOptions({
      onError: (error) => setSaveError(error.message),
      onSuccess: async (_result, values) => {
        const { storeId: _storeId, ...saved } = values
        form.reset(saved)
        await onSaved()
        toast("Saved.")
      },
    }),
  )

  const { errors, isDirty } = form.formState
  const neverSaved = !settings.updatedAt
  const hours = form.watch("operatingHours")
  const fieldError = (present: unknown, message: string) =>
    present ? message : null

  return (
    <form
      className="grid gap-7"
      noValidate
      onSubmit={form.handleSubmit(
        (values) => {
          setSaveError(null)
          saveMutation.mutate({ ...values, storeId })
        },
        () => setSaveError("Check the highlighted settings."),
      )}
    >
      <SettingsSection
        title="Pickup and delivery"
        description="Turn on at least one."
      >
        <Controller
          control={form.control}
          name="pickupEnabled"
          render={({ field }) => (
            <SettingsRow label="Customers can pick up" htmlFor={`${ids}pickup`}>
              <Switch
                id={`${ids}pickup`}
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
              />
            </SettingsRow>
          )}
        />
        <Controller
          control={form.control}
          name="deliveryEnabled"
          render={({ field }) => (
            <SettingsRow
              label="You deliver"
              description="Set delivery areas and fees under Delivery areas below."
              htmlFor={`${ids}delivery`}
            >
              <Switch
                id={`${ids}delivery`}
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
              />
            </SettingsRow>
          )}
        />
        {errors.pickupEnabled ? (
          <p className="px-4 py-3 text-sm text-destructive">
            Turn on pickup, delivery or both.
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Opening hours">
        {DAYS.map((day, index) => {
          const entry = hours?.[index]
          const closed = entry?.isClosed ?? false
          const name = dayName(day)
          const rowError = errors.operatingHours?.[index]
          return (
            <div
              className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"
              key={day}
            >
              <span className="w-24 text-sm font-medium">{name}</span>
              <Switch
                aria-label={`Open on ${name}`}
                checked={!closed}
                onCheckedChange={(open) => {
                  const options = { shouldDirty: true, shouldValidate: false }
                  form.setValue(
                    `operatingHours.${index}.isClosed`,
                    !open,
                    options,
                  )
                  form.setValue(
                    `operatingHours.${index}.opensAt`,
                    open ? entry?.opensAt || DEFAULT_OPENS_AT : undefined,
                    options,
                  )
                  form.setValue(
                    `operatingHours.${index}.closesAt`,
                    open ? entry?.closesAt || DEFAULT_CLOSES_AT : undefined,
                    options,
                  )
                }}
              />
              {closed ? (
                <span className="text-sm text-muted-foreground">Closed</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-invalid={Boolean(rowError)}
                    aria-label={`${name} opens`}
                    className="w-32"
                    type="time"
                    {...form.register(`operatingHours.${index}.opensAt`)}
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    aria-invalid={Boolean(rowError)}
                    aria-label={`${name} closes`}
                    className="w-32"
                    type="time"
                    {...form.register(`operatingHours.${index}.closesAt`)}
                  />
                </div>
              )}
              {rowError ? (
                <p className="w-full text-sm text-destructive">
                  Closing time must be after opening time.
                </p>
              ) : null}
            </div>
          )
        })}
      </SettingsSection>

      <SettingsSection title="How you work">
        <ComplianceField
          htmlFor={`${ids}service`}
          label="How you handle each prescription"
          help="Staff see this. It doesn't replace the pharmacist's judgement."
          helpId={`${ids}service-help`}
          error={fieldError(
            errors.servicePolicy,
            "Write how you handle each prescription.",
          )}
        >
          <Textarea
            aria-describedby={`${ids}service-help`}
            aria-invalid={Boolean(errors.servicePolicy)}
            id={`${ids}service`}
            placeholder="For example: An attendant checks every request and a pharmacist approves it before we send a price."
            rows={3}
            {...form.register("servicePolicy")}
          />
        </ComplianceField>
        <ComplianceField
          htmlFor={`${ids}contact`}
          label="When you contact customers"
          error={fieldError(
            errors.contactPolicy,
            "Write when you contact customers.",
          )}
        >
          <Textarea
            aria-invalid={Boolean(errors.contactPolicy)}
            id={`${ids}contact`}
            placeholder="For example: Only to ask about a prescription or to give an update on their order."
            rows={3}
            {...form.register("contactPolicy")}
          />
        </ComplianceField>
        <ComplianceField
          htmlFor={`${ids}consent`}
          label="Consent version"
          help="Saved with each customer's agreement. Change it only when your consent wording changes."
          helpId={`${ids}consent-help`}
          error={fieldError(errors.consentVersion, "Enter a consent version.")}
        >
          <Input
            aria-describedby={`${ids}consent-help`}
            aria-invalid={Boolean(errors.consentVersion)}
            className="max-w-56"
            id={`${ids}consent`}
            {...form.register("consentVersion")}
          />
        </ComplianceField>
      </SettingsSection>

      {isDirty || neverSaved ? (
        <ComplianceSaveRow
          sticky
          error={saveError}
          isSaving={saveMutation.isPending}
          message={
            isDirty
              ? "You changed pickup and delivery, opening hours or how you work."
              : "Pickup and delivery, opening hours and how you work aren't saved yet."
          }
          onCancel={
            isDirty
              ? () => {
                  setSaveError(null)
                  form.reset()
                }
              : undefined
          }
        />
      ) : null}
    </form>
  )
}
