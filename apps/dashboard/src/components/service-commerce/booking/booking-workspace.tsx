"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import {
  Button,
  Checkbox,
  CheckboxField,
  ControlField,
  CurrencyInput,
  DateControl,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FormActions,
  Input,
  SelectControl,
  SubmitButton,
  Field as UiField,
  FieldError as UiFieldError,
  cn,
  toast,
} from "@ewatrade/ui"

import { FormSelectControl } from "@/components/forms/form-controls"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import {
  ServiceCommerceBookingConfigurationFormProvider,
  type ServiceCommerceBookingConfigurationFormValues,
} from "@/components/service-commerce/form-context"
import { SheetSection } from "@/components/service-work/choice-buttons"
import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useStoreCurrency } from "@/hooks/use-store-currency"
import { useTRPC } from "@/trpc/client"
import { serviceCommerceBookingConfigurationFormSchema } from "@ewatrade/service-commerce"

import { majorToMinor, minorToMajorInput } from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { useFormContext } from "react-hook-form"
import {
  type BookingResourceOption,
  eligibleBookingSources,
  mergeBookingResources,
} from "./booking-workspace-state"

function toFormValues(
  configuration: { revision: number } & Record<string, unknown>,
): ServiceCommerceBookingConfigurationFormValues {
  const {
    revision: _revision,
    storeId: _storeId,
    tenantId: _tenantId,
    ...values
  } = configuration
  return serviceCommerceBookingConfigurationFormSchema.parse(values)
}

export function BookingWorkspace({
  registerFormReset,
  storeId,
}: {
  registerFormReset: RegisterServiceCommerceFormReset
  storeId: string
}) {
  return (
    <ServiceCommerceBookingConfigurationFormProvider
      registerReset={registerFormReset}
    >
      <BookingWorkspaceContent storeId={storeId} />
    </ServiceCommerceBookingConfigurationFormProvider>
  )
}

function BookingWorkspaceContent({ storeId }: { storeId: string }) {
  const currencyCode = useStoreCurrency(storeId)
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const params = useServiceCommerceParams()
  const form = useFormContext<ServiceCommerceBookingConfigurationFormValues>()
  const [message, setMessage] = useState<string | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // The save button is at the bottom of a long sheet; bring the reason into view.
    if (message) noticeRef.current?.scrollIntoView({ block: "nearest" })
  }, [message])
  const [createdLink, setCreatedLink] = useState<string | null>(null)
  const [createdResources, setCreatedResources] = useState<
    BookingResourceOption[]
  >([])
  const createResourceId = useRef<string | null>(null)
  const updateId = useRef<string | null>(null)
  const capabilityId = useRef<string | null>(null)
  const offeringId = params.offeringId ?? ""
  const selectedSource =
    params.sourceId && params.sourceKind === "service"
      ? { id: params.sourceId, kind: "service" as const }
      : null
  const configuration = useQuery({
    ...trpc.serviceCommerce.bookingConfiguration.queryOptions({
      offeringId,
      storeId,
    }),
    enabled: Boolean(offeringId),
    retry: false,
  })
  const sourceRequests = useQuery(
    trpc.serviceAccess.requests.queryOptions(
      { limit: 100, storeId },
      { enabled: Boolean(offeringId), retry: false },
    ),
  )
  const eligibleSources = eligibleBookingSources(
    sourceRequests.data ?? [],
    offeringId,
  )
  const source = eligibleSources.some(
    (request) => request.id === selectedSource?.id,
  )
    ? selectedSource
    : null

  useEffect(() => {
    if (!configuration.data) return
    form.reset(toFormValues(configuration.data))
  }, [configuration.data, form])

  const invalidateConfiguration = () =>
    queryClient.invalidateQueries({
      exact: true,
      queryKey: trpc.serviceCommerce.bookingConfiguration.queryKey({
        offeringId,
        storeId,
      }),
    })

  const createResource = useMutation(
    trpc.serviceCommerce.createBookingResource.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async (resource) => {
        await invalidateConfiguration()
        const option = {
          capacity: resource.capacity,
          id: resource.id,
          label: resource.name,
        }
        setCreatedResources((current) =>
          mergeBookingResources(current, [option]),
        )
        form.setValue(
          "resources",
          mergeBookingResources(form.getValues("resources"), [option]),
          { shouldDirty: true, shouldValidate: true },
        )
        createResourceId.current = null
        setMessage("Added and ticked. Save open times to keep it.")
      },
    }),
  )
  const updateConfiguration = useMutation(
    trpc.serviceCommerce.updateBookingConfiguration.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidateConfiguration()
        updateId.current = null
        setMessage(null)
        toast("Open times saved.")
      },
    }),
  )
  const createCapability = useMutation(
    trpc.serviceCommerce.createBookingCapability.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async (result) => {
        await invalidateConfiguration()
        capabilityId.current = null
        const storefront =
          process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "") ?? ""
        setCreatedLink(`${storefront}/booking/${result.accessToken}`)
        setMessage(null)
      },
    }),
  )

  if (!offeringId) {
    return (
      <BookingNotice message="Choose a service first. This link is old or incomplete." />
    )
  }

  const resourceOptions = mergeBookingResources(
    configuration.data?.resources ?? [],
    createdResources,
  )
  const pending =
    createResource.isPending ||
    updateConfiguration.isPending ||
    createCapability.isPending

  const sourceName = eligibleSources.find(
    (request) => request.id === source?.id,
  )?.customerName

  return (
    <div className="grid gap-5">
      <div ref={noticeRef} className="scroll-mt-4 empty:hidden">
        {message ? <BookingNotice message={message} /> : null}
      </div>
      {configuration.isLoading ? <BookingSkeleton /> : null}
      {configuration.isError ? (
        <div className="grid gap-3 bg-warning p-4 text-sm text-warning-foreground">
          <p>
            Open times aren’t set for this service yet. Add who or what is
            booked below, then save.
          </p>
          <Button
            className="w-fit"
            onClick={() => void configuration.refetch()}
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : null}
      {!configuration.isLoading ? (
        <form
          onSubmit={form.handleSubmit(
            (values) => {
              if (values.resources.length === 0) {
                setMessage("Pick at least one person, room or tool below.")
                return
              }
              updateId.current ??= crypto.randomUUID()
              setMessage(null)
              updateConfiguration.mutate({
                ...values,
                availabilityRules:
                  values.availabilityRules.length > 0
                    ? values.availabilityRules
                    : [
                        {
                          daysOfWeek: [1, 2, 3, 4, 5],
                          endLocalTime: "17:00",
                          id: crypto.randomUUID(),
                          startLocalTime: "09:00",
                        },
                      ],
                clientOperationId: updateId.current,
                expectedRevision: configuration.data?.revision ?? 0,
                offeringId,
                storeId,
              })
            },
            (errors) =>
              setMessage(
                errors.resources
                  ? "Pick at least one person, room or tool under Who or what is booked."
                  : errors.timezone
                    ? "This store’s time zone is missing. Set it in Settings, then try again."
                    : errors.holdDurationMinutes
                      ? "Keep an unpaid time for less time than customers can book ahead."
                      : "Check the fields marked below.",
              ),
          )}
        >
          <FieldGroup className="min-w-0 grid gap-5">
            <SheetSection title="Open times">
              <FieldSet className="grid gap-2">
                <FieldLegend variant="label" className="text-sm font-medium">
                  Open days
                </FieldLegend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(({ label, value }) => {
                    const rule = currentAvailabilityRule(form)
                    const selected = rule.daysOfWeek.includes(value)
                    return (
                      <CheckboxField
                        key={value}
                        label={label}
                        className="w-auto border border-border px-2.5 py-1.5"
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => {
                            const current = currentAvailabilityRule(form)
                            const daysOfWeek = checked
                              ? [...current.daysOfWeek, value].sort()
                              : current.daysOfWeek.filter(
                                  (day) => day !== value,
                                )
                            form.setValue(
                              "availabilityRules",
                              [{ ...current, daysOfWeek }],
                              { shouldDirty: true, shouldValidate: true },
                            )
                          }}
                        />
                      </CheckboxField>
                    )
                  })}
                </div>
                <FieldError
                  message={
                    form.formState.errors.availabilityRules?.[0]?.daysOfWeek
                      ? "Pick at least one open day."
                      : undefined
                  }
                />
              </FieldSet>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Opens">
                  <Input
                    onChange={(event) => {
                      const current = currentAvailabilityRule(form)
                      form.setValue(
                        "availabilityRules",
                        [{ ...current, startLocalTime: event.target.value }],
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }}
                    type="time"
                    value={
                      form.watch("availabilityRules")[0]?.startLocalTime ??
                      "09:00"
                    }
                  />
                  <FieldError
                    message={
                      form.formState.errors.availabilityRules?.[0]
                        ?.endLocalTime ||
                      form.formState.errors.availabilityRules?.message
                        ? "Closing time must be after opening time."
                        : undefined
                    }
                  />
                </Field>
                <Field label="Closes">
                  <Input
                    onChange={(event) => {
                      const current = currentAvailabilityRule(form)
                      form.setValue(
                        "availabilityRules",
                        [{ ...current, endLocalTime: event.target.value }],
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }}
                    type="time"
                    value={
                      form.watch("availabilityRules")[0]?.endLocalTime ??
                      "17:00"
                    }
                  />
                </Field>
                <Field label="Each appointment lasts">
                  <SelectControl
                    value={String(form.watch("slotDurationMinutes"))}
                    onValueChange={(value) =>
                      form.setValue("slotDurationMinutes", Number(value), {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    options={durationOptions(form.watch("slotDurationMinutes"))}
                  />
                </Field>
                <UnitField
                  form={form}
                  name="leadTimeMinutes"
                  label="Book at least"
                  unit="hours ahead"
                  minutesPerUnit={60}
                />
                <UnitField
                  form={form}
                  name="bookingHorizonMinutes"
                  label="Book up to"
                  unit="days ahead"
                  minutesPerUnit={1_440}
                  error={
                    form.formState.errors.bookingHorizonMinutes
                      ? "Enter days, like 30."
                      : undefined
                  }
                />
                <UnitField
                  form={form}
                  name="holdDurationMinutes"
                  label="Keep an unpaid time for"
                  unit="minutes"
                  minutesPerUnit={1}
                  help="The time is freed if they don’t pay in this time."
                  error={
                    form.formState.errors.holdDurationMinutes
                      ? "Must be shorter than how far ahead customers can book."
                      : undefined
                  }
                />
              </div>
            </SheetSection>
            <BookingExceptions form={form} />
            <BookingResources
              options={resourceOptions}
              selected={form.watch("resources")}
              onChange={(next) =>
                form.setValue("resources", next, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            <ResourceForm
              isPending={createResource.isPending}
              onSubmit={(values) => {
                createResourceId.current ??= crypto.randomUUID()
                setMessage(null)
                createResource.mutate({
                  ...values,
                  clientOperationId: createResourceId.current,
                  storeId,
                })
              }}
            />
            <SheetSection title="Payment and cancelling">
              <Field label="Payment to book">
                <SelectControl
                  value={form.watch("paymentPolicy.requirement")}
                  onValueChange={(value) =>
                    form.setValue(
                      "paymentPolicy.requirement",
                      value as ServiceCommerceBookingConfigurationFormValues["paymentPolicy"]["requirement"],
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                  options={[
                    { value: "none", label: <>None</> },
                    { value: "deposit", label: <>Deposit</> },
                    { value: "full", label: <>Full price</> },
                  ]}
                />
                <FieldError
                  message={
                    form.formState.errors.paymentPolicy
                      ? "Enter a deposit above ₦0, or pick None or Full price."
                      : undefined
                  }
                />
              </Field>
              {form.watch("paymentPolicy.requirement") === "deposit" ? (
                <Field label="Deposit">
                  <CurrencyInput
                    currencyCode={currencyCode}
                    disabled={!currencyCode}
                    value={minorToMajorInput(
                      form.watch("paymentPolicy.depositMinor"),
                    )}
                    onValueChange={(value) =>
                      form.setValue(
                        "paymentPolicy.depositMinor",
                        majorToMinor(value),
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }
                  />
                </Field>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <UnitField
                  form={form}
                  name="cancellationPolicy.allowedUntilMinutesBeforeStart"
                  label="Customers can cancel up to"
                  unit="hours before"
                  minutesPerUnit={60}
                />
                <Field label="Refund when they cancel in time">
                  <FormSelectControl
                    control={form.control}
                    name={"cancellationPolicy.refundPolicy"}
                    options={[
                      { value: "manual_review", label: <>Decide each time</> },
                      { value: "full_before_cutoff", label: <>Full refund</> },
                      { value: "none", label: <>No refund</> },
                    ]}
                  />
                </Field>
                <UnitField
                  form={form}
                  name="reminderLeadMinutes"
                  label="Remind them"
                  unit="hours before"
                  minutesPerUnit={60}
                />
              </div>
            </SheetSection>
            <FormActions className="border-t border-border pt-4">
              <SubmitButton
                isSubmitting={updateConfiguration.isPending}
                disabled={pending}
                type="submit"
              >
                {updateConfiguration.isPending ? "Saving…" : "Save open times"}
              </SubmitButton>
            </FormActions>
          </FieldGroup>
        </form>
      ) : null}

      <SheetSection title="Send a booking link">
        <p className="text-sm text-muted-foreground">
          For one customer who asked for this service. They pick a free time.
        </p>
        {sourceRequests.isLoading ? (
          <div className="h-10 animate-pulse bg-muted" />
        ) : sourceRequests.isError ? (
          <div className="grid gap-2 text-sm text-destructive" role="alert">
            <p>Customer requests didn’t load.</p>
            <Button
              className="w-fit"
              onClick={() => void sourceRequests.refetch()}
              size="sm"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        ) : eligibleSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open customer request asks for this service yet. When one does,
            you can send that customer a booking link here.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <ControlField label="Customer request" className="min-w-56 flex-1">
              <SelectControl
                onValueChange={(value) =>
                  void params.setParams({
                    sourceId: value || null,
                    sourceKind: value ? "service" : null,
                  })
                }
                value={source?.id ?? ""}
                options={[
                  { value: "", label: <>Choose a request</> },
                  ...eligibleSources.map((request) => {
                    const line = request.lines.find(
                      (item) => item.offeringId === offeringId,
                    )
                    return {
                      value: request.id,
                      label: (
                        <>
                          {request.customerName} ·{" "}
                          {line?.offeringName ?? "Service"}
                        </>
                      ),
                    }
                  }),
                ]}
              />
            </ControlField>
            <Button
              disabled={!source || pending || !configuration.data}
              onClick={() => {
                if (!source) return
                capabilityId.current ??= crypto.randomUUID()
                setMessage(null)
                createCapability.mutate({
                  clientOperationId: capabilityId.current,
                  expiresAt: new Date(Date.now() + 7 * 86_400_000),
                  offeringId,
                  source,
                  storeId,
                })
              }}
            >
              {createCapability.isPending ? "Creating…" : "Create link"}
            </Button>
          </div>
        )}
        {createdLink ? (
          <div className="grid gap-2">
            <div className="flex items-center gap-3 border border-border px-3 py-2.5">
              <a
                className="min-w-0 flex-1 text-sm break-all text-primary underline"
                href={createdLink}
                rel="noreferrer"
                target="_blank"
              >
                {createdLink}
              </a>
              <Button
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(createdLink)
                    .then(() => toast("Link copied."))
                    .catch(() => toast("Select the link to copy it."))
                }
                size="sm"
                type="button"
                variant="outline"
              >
                Copy link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Works for 7 days{sourceName ? `, for ${sourceName} only` : ""}.
            </p>
          </div>
        ) : null}
      </SheetSection>
    </div>
  )
}

/** Minutes stored, hours or days shown. */
function UnitField({
  error,
  form,
  help,
  label,
  minutesPerUnit,
  name,
  unit,
}: {
  error?: string
  form: ReturnType<
    typeof useFormContext<ServiceCommerceBookingConfigurationFormValues>
  >
  help?: string
  label: string
  minutesPerUnit: number
  name:
    | "bookingHorizonMinutes"
    | "cancellationPolicy.allowedUntilMinutesBeforeStart"
    | "holdDurationMinutes"
    | "leadTimeMinutes"
    | "reminderLeadMinutes"
  unit: string
}) {
  const minutes = form.watch(name)
  const [text, setText] = useState(() =>
    Number.isFinite(minutes) ? String(minutes / minutesPerUnit) : "",
  )
  useEffect(() => {
    // Follow loads and resets from the server without fighting the typing.
    const shown = Number(text)
    if (!Number.isFinite(minutes)) return
    if (Math.round(shown * minutesPerUnit) !== minutes)
      setText(String(Number((minutes / minutesPerUnit).toFixed(2))))
  }, [minutes, minutesPerUnit, text])
  const id = useId()
  return (
    <UiField data-invalid={Boolean(error)} className="gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center border border-input bg-background">
        <Input
          id={id}
          inputMode="decimal"
          className="border-0"
          aria-invalid={Boolean(error)}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            const value = Number(event.target.value)
            form.setValue(
              name,
              Number.isFinite(value) && event.target.value.trim()
                ? Math.round(value * minutesPerUnit)
                : Number.NaN,
              { shouldDirty: true, shouldValidate: true },
            )
          }}
        />
        <span className="shrink-0 px-3 text-sm text-muted-foreground">
          {unit}
        </span>
      </div>
      {error ? (
        <FieldError message={error} />
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </UiField>
  )
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240]

function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`
  const hours = minutes / 60
  return hours === 1 ? "1 hour" : `${hours} hours`
}

function durationOptions(current: number) {
  const values = DURATIONS.includes(current)
    ? DURATIONS
    : [...DURATIONS, current].filter(Number.isFinite).sort((a, b) => a - b)
  return values.map((minutes) => ({
    value: String(minutes),
    label: <>{durationLabel(minutes)}</>,
  }))
}

function ResourceForm({
  isPending,
  onSubmit,
}: {
  isPending: boolean
  onSubmit: (values: {
    capacity: number
    kind: "equipment" | "other" | "room" | "staff"
    name: string
  }) => void
}) {
  const [capacity, setCapacity] = useState(1)
  const [kind, setKind] = useState<"equipment" | "other" | "room" | "staff">(
    "staff",
  )
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  // Lives inside the open-times form, so it adds on click or Enter instead of submitting.
  const add = () => {
    if (!name.trim()) {
      setError("Type a name to add.")
      return
    }
    setError(null)
    onSubmit({ capacity, kind, name: name.trim() })
    setName("")
  }
  return (
    <div>
      <FieldGroup className="min-w-0 grid gap-3">
        <p className="text-sm font-medium">Add a person, room or tool</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_120px_110px_auto] sm:items-end">
          <Field label="Name" className="col-span-2 sm:col-span-1">
            <Input
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                add()
              }}
              placeholder="e.g. Dr. Yusuf"
              value={name}
            />
          </Field>
          <Field label="Kind">
            <SelectControl
              onValueChange={(value) =>
                setKind(value as "equipment" | "other" | "room" | "staff")
              }
              value={kind}
              options={[
                { value: "staff", label: <>Person</> },
                { value: "room", label: <>Room</> },
                { value: "equipment", label: <>Tool</> },
                { value: "other", label: <>Other</> },
              ]}
            />
          </Field>
          <Field label="Bookings at a time">
            <Input
              min="1"
              onChange={(event) => setCapacity(Number(event.target.value) || 1)}
              type="number"
              value={capacity}
            />
          </Field>
          <SubmitButton
            isSubmitting={isPending}
            variant="outline"
            disabled={isPending}
            type="button"
            onClick={add}
          >
            {isPending ? "Adding…" : "Add"}
          </SubmitButton>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </FieldGroup>
    </div>
  )
}

const WEEKDAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
]

function currentAvailabilityRule(
  form: ReturnType<
    typeof useFormContext<ServiceCommerceBookingConfigurationFormValues>
  >,
) {
  return (
    form.getValues("availabilityRules")[0] ?? {
      daysOfWeek: [1, 2, 3, 4, 5],
      endLocalTime: "17:00",
      id: crypto.randomUUID(),
      startLocalTime: "09:00",
    }
  )
}

function BookingResources({
  onChange,
  options,
  selected,
}: {
  onChange: (next: BookingResourceOption[]) => void
  options: BookingResourceOption[]
  selected: BookingResourceOption[]
}) {
  return (
    <FieldSet className="grid gap-2 border-t border-border pt-4">
      <FieldLegend
        variant="label"
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        Who or what is booked
      </FieldLegend>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody yet. Add a person, room or tool below, then tick it.
        </p>
      ) : (
        <div className="grid gap-2">
          {options.map((resource) => {
            const checked = selected.some((item) => item.id === resource.id)
            return (
              <CheckboxField
                className="min-h-11 items-center border border-border px-3"
                key={resource.id}
                label={
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span>{resource.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {resource.capacity === 1
                        ? "1 booking at a time"
                        : `${resource.capacity} bookings at a time`}
                    </span>
                  </span>
                }
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked
                        ? mergeBookingResources(selected, [resource])
                        : selected.filter((item) => item.id !== resource.id),
                    )
                  }
                />
              </CheckboxField>
            )
          })}
        </div>
      )}
    </FieldSet>
  )
}

function toLocalDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function BookingExceptions({
  form,
}: {
  form: ReturnType<
    typeof useFormContext<ServiceCommerceBookingConfigurationFormValues>
  >
}) {
  const exceptions = form.watch("exceptions")
  const update = (
    index: number,
    value: ServiceCommerceBookingConfigurationFormValues["exceptions"][number],
  ) =>
    form.setValue(
      "exceptions",
      exceptions.map((exception, currentIndex) =>
        currentIndex === index ? value : exception,
      ),
      { shouldDirty: true, shouldValidate: true },
    )
  return (
    <FieldSet className="grid gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <FieldLegend
            variant="label"
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Days off and extra openings
          </FieldLegend>
          <p className="text-xs text-muted-foreground">
            Close for a holiday, open extra hours, or take more or fewer
            bookings for a while.
          </p>
        </div>
        <Button
          onClick={() =>
            form.setValue(
              "exceptions",
              [
                ...exceptions,
                {
                  endAt: new Date(Date.now() + 2 * 60 * 60_000),
                  id: crypto.randomUUID(),
                  kind: "closed",
                  startAt: new Date(Date.now() + 60 * 60_000),
                },
              ],
              { shouldDirty: true, shouldValidate: true },
            )
          }
          size="sm"
          type="button"
          variant="outline"
        >
          Add a change
        </Button>
      </div>
      {exceptions.map((exception, index) => (
        <div
          className="grid gap-3 bg-muted/40 p-3 sm:grid-cols-2"
          key={exception.id}
        >
          <Field label="What changes">
            <SelectControl
              onValueChange={(value) => {
                const kind = value as typeof exception.kind
                const timing = {
                  endAt: exception.endAt,
                  id: exception.id,
                  startAt: exception.startAt,
                }
                update(
                  index,
                  kind === "capacity_override"
                    ? {
                        ...timing,
                        capacity:
                          exception.kind === "capacity_override"
                            ? exception.capacity
                            : 1,
                        kind,
                      }
                    : { ...timing, kind },
                )
              }}
              value={exception.kind}
              options={[
                { value: "closed", label: <>Closed</> },
                { value: "open", label: <>Extra opening</> },
                {
                  value: "capacity_override",
                  label: <>Different number of bookings</>,
                },
              ]}
            />
          </Field>
          {exception.kind === "capacity_override" ? (
            <Field label="Bookings at a time">
              <Input
                min="1"
                onChange={(event) =>
                  update(index, {
                    ...exception,
                    capacity: Number(event.target.value) || 1,
                  })
                }
                type="number"
                value={exception.capacity}
              />
            </Field>
          ) : null}
          <Field label="From">
            <DateControl
              onValueChange={(value) =>
                update(index, {
                  ...exception,
                  startAt: new Date(value),
                })
              }
              type="datetime-local"
              value={toLocalDateTime(exception.startAt)}
            />
          </Field>
          <Field label="To">
            <DateControl
              onValueChange={(value) =>
                update(index, {
                  ...exception,
                  endAt: new Date(value),
                })
              }
              type="datetime-local"
              value={toLocalDateTime(exception.endAt)}
            />
          </Field>
          <Button
            className="w-fit"
            onClick={() =>
              form.setValue(
                "exceptions",
                exceptions.filter((_, currentIndex) => currentIndex !== index),
                { shouldDirty: true, shouldValidate: true },
              )
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            Remove
          </Button>
        </div>
      ))}
      <FieldError
        message={
          form.formState.errors.exceptions
            ? "Each change must end after it starts."
            : undefined
        }
      />
    </FieldSet>
  )
}

function Field({
  children,
  className,
  label,
}: { children: React.ReactNode; className?: string; label: string }) {
  const id = useId()
  const [control, ...supplemental] = Children.toArray(children)
  const error = supplemental.flatMap((child) =>
    isValidElement<{ message?: string }>(child) && child.props.message
      ? [child.props.message]
      : [],
  )[0]
  return (
    <UiField data-invalid={Boolean(error)} className={cn("gap-1.5", className)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {isValidElement<{
        id?: string
        "aria-invalid"?: boolean
        "aria-describedby"?: string
      }>(control)
        ? cloneElement(control, {
            id,
            "aria-invalid": Boolean(error) || control.props["aria-invalid"],
            "aria-describedby":
              [control.props["aria-describedby"], error ? `${id}-error` : null]
                .filter(Boolean)
                .join(" ") || undefined,
          })
        : control}
      {supplemental.map((child) =>
        isValidElement<{ id?: string }>(child) && child.type === FieldError
          ? cloneElement(child, { id: `${id}-error` })
          : child,
      )}
    </UiField>
  )
}

function FieldError({ message, id }: { message?: string; id?: string }) {
  return message ? <UiFieldError id={id}>{message}</UiFieldError> : null
}

function BookingNotice({ message }: { message: string }) {
  return (
    <FormFeedback appearance="dashboard" variant="default">
      {message}
    </FormFeedback>
  )
}

function BookingSkeleton() {
  return <div className="h-56 animate-pulse bg-muted" />
}
