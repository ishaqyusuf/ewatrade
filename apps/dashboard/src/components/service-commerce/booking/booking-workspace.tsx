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
} from "@ewatrade/ui"

import { FormSelectControl } from "@/components/forms/form-controls"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import {
  ServiceCommerceBookingConfigurationFormProvider,
  type ServiceCommerceBookingConfigurationFormValues,
} from "@/components/service-commerce/form-context"
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
        setMessage("Booking resource saved and selected for this offering.")
      },
    }),
  )
  const updateConfiguration = useMutation(
    trpc.serviceCommerce.updateBookingConfiguration.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        await invalidateConfiguration()
        updateId.current = null
        setMessage("Booking availability saved and revalidated.")
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
        setMessage("Booking link is ready to share with this customer.")
      },
    }),
  )

  if (!offeringId) {
    return (
      <BookingNotice message="Choose a Service offering before configuring booking. This link is incomplete or stale." />
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

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 border border-border bg-background p-4 sm:p-5">
        <div>
          <h2 className="font-semibold">Booking availability</h2>
          <p className="text-sm text-muted-foreground">
            Store-scoped time, capacity, payment, and cancellation policy.
          </p>
        </div>
        {configuration.isLoading ? <BookingSkeleton /> : null}
        {configuration.isError ? (
          <div className="grid gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p>
              No active booking configuration is available for this offering.
              Create a resource below, then save the configuration.
            </p>
            <Button
              appearance="form"
              className="w-fit"
              onClick={() => void configuration.refetch()}
              variant="outline"
            >
              Retry configuration
            </Button>
          </div>
        ) : null}
        {!configuration.isLoading ? (
          <form
            onSubmit={form.handleSubmit((values) => {
              if (values.resources.length === 0) {
                setMessage("Create at least one booking resource first.")
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
            })}
          >
            <FieldGroup className="min-w-0 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Store timezone">
                  <Input {...form.register("timezone")} />
                </Field>
                <Field label="Appointment duration (minutes)">
                  <Input
                    min="1"
                    type="number"
                    {...form.register("slotDurationMinutes", {
                      valueAsNumber: true,
                    })}
                  />
                </Field>
                <Field label="Customer lead time (minutes)">
                  <Input
                    min="0"
                    type="number"
                    {...form.register("leadTimeMinutes", {
                      valueAsNumber: true,
                    })}
                  />
                </Field>
                <Field label="Hold duration (minutes)">
                  <Input
                    min="1"
                    type="number"
                    {...form.register("holdDurationMinutes", {
                      valueAsNumber: true,
                    })}
                  />
                </Field>
                <Field label="Booking horizon (minutes)">
                  <Input
                    min="1"
                    type="number"
                    {...form.register("bookingHorizonMinutes", {
                      valueAsNumber: true,
                    })}
                  />
                  <FieldError
                    message={
                      form.formState.errors.bookingHorizonMinutes?.message
                    }
                  />
                </Field>
                <Field label="First reminder (minutes before)">
                  <Input
                    min="0"
                    type="number"
                    {...form.register("reminderLeadMinutes", {
                      valueAsNumber: true,
                    })}
                  />
                </Field>
                <Field label="Cancellation window (minutes before)">
                  <Input
                    min="0"
                    type="number"
                    {...form.register(
                      "cancellationPolicy.allowedUntilMinutesBeforeStart",
                      { valueAsNumber: true },
                    )}
                  />
                  <FieldError
                    message={
                      form.formState.errors.cancellationPolicy
                        ?.allowedUntilMinutesBeforeStart?.message
                    }
                  />
                </Field>
                <Field label="Cancellation refund policy">
                  <FormSelectControl
                    control={form.control}
                    name={"cancellationPolicy.refundPolicy"}
                    options={[
                      { value: "manual_review", label: <>Manual review</> },
                      {
                        value: "full_before_cutoff",
                        label: <>Full before cutoff</>,
                      },
                      { value: "none", label: <>No refund</> },
                    ]}
                  />
                  <FieldError
                    message={
                      form.formState.errors.cancellationPolicy?.refundPolicy
                        ?.message
                    }
                  />
                </Field>
              </div>
              <FieldSet className="grid gap-2 border border-border p-4">
                <FieldLegend
                  variant="label"
                  className="px-1 text-sm font-medium"
                >
                  Payment policy
                </FieldLegend>
                <ControlField label={<>Requirement</>}>
                  <FormSelectControl
                    control={form.control}
                    name={"paymentPolicy.requirement"}
                    options={[
                      { value: "none", label: <>No payment required</> },
                      { value: "deposit", label: <>Deposit required</> },
                      { value: "full", label: <>Full payment required</> },
                    ]}
                  />
                </ControlField>
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
                    <FieldError
                      message={
                        form.formState.errors.paymentPolicy?.depositMinor
                          ?.message
                      }
                    />
                  </Field>
                ) : null}
                <FieldError
                  message={form.formState.errors.paymentPolicy?.message}
                />
              </FieldSet>
              <FieldSet className="grid gap-2 border border-border p-4">
                <FieldLegend
                  variant="label"
                  className="px-1 text-sm font-medium"
                >
                  Working hours
                </FieldLegend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Starts">
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
                  </Field>
                  <Field label="Ends">
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
                </div>
                <FieldSet className="grid gap-2">
                  <FieldLegend variant="label" className="text-sm font-medium">
                    Open weekdays
                  </FieldLegend>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map(({ label, value }) => {
                      const rule = currentAvailabilityRule(form)
                      const selected = rule.daysOfWeek.includes(value)
                      return (
                        <CheckboxField key={value} label={label}>
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
                        ?.message
                    }
                  />
                </FieldSet>
                <p className="text-xs text-muted-foreground">
                  Weekday hours are applied to each selected resource.
                  Exceptions remain server-authorized and are never inferred in
                  the browser.
                </p>
              </FieldSet>
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
              <FormActions>
                <SubmitButton
                  isSubmitting={pending}
                  disabled={pending || form.watch("resources").length === 0}
                  type="submit"
                >
                  {updateConfiguration.isPending
                    ? "Saving availability…"
                    : "Save booking availability"}
                </SubmitButton>
              </FormActions>
            </FieldGroup>
          </form>
        ) : null}
      </section>

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

      <section className="grid gap-3 border border-border bg-background p-4 sm:p-5">
        <div>
          <h2 className="font-semibold">Booking source</h2>
          <p className="text-sm text-muted-foreground">
            Choose the eligible Service request this appointment belongs to.
          </p>
        </div>
        {sourceRequests.isLoading ? (
          <div className="h-10 animate-pulse bg-muted" />
        ) : sourceRequests.isError ? (
          <div className="grid gap-2 text-sm text-destructive" role="alert">
            <p>Service requests are unavailable.</p>
            <Button
              appearance="form"
              className="w-fit"
              onClick={() => void sourceRequests.refetch()}
              size="sm"
              variant="outline"
            >
              Retry requests
            </Button>
          </div>
        ) : eligibleSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active Service request includes this offering yet. Create or open
            a request first, then return here to issue its booking link.
          </p>
        ) : (
          <ControlField
            label={<>Service request</>}
            afterControl=<span
              className="text-xs text-muted-foreground"
              id="booking-source-help"
            >
              The public link is scoped to this request and cannot be reused for
              another customer.
            </span>
          >
            <SelectControl
              aria-describedby="booking-source-help"
              onValueChange={(value) =>
                void params.setParams({
                  sourceId: value || null,
                  sourceKind: value ? "service" : null,
                })
              }
              value={source?.id ?? ""}
              options={[
                { value: "", label: <>Choose a request</> },
                ...(eligibleSources.map((request) => {
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
                }) ?? []),
              ]}
            />
          </ControlField>
        )}
      </section>

      {source ? (
        <section className="grid gap-3 border border-border bg-background p-4 sm:p-5">
          <div>
            <h2 className="font-semibold">Customer booking link</h2>
            <p className="text-sm text-muted-foreground">
              Issue one expiring public capability for this eligible source.
            </p>
          </div>
          <Button
            appearance="form"
            className="w-fit"
            disabled={pending || !configuration.data}
            onClick={() => {
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
            {createCapability.isPending
              ? "Creating link…"
              : "Create booking link"}
          </Button>
        </section>
      ) : (
        <p className="border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Select an eligible Service request above to issue its customer booking
          link. Configuration remains Store-scoped.
        </p>
      )}
      {createdLink ? (
        <section className="grid gap-3 border border-primary/30 bg-primary/5 p-4 sm:p-5">
          <div>
            <h2 className="font-semibold">Customer booking link</h2>
            <p className="text-sm text-muted-foreground">
              Send this expiring, request-scoped link to the selected customer.
            </p>
          </div>
          <a
            className="break-all text-sm font-medium text-primary underline"
            href={createdLink}
            rel="noreferrer"
            target="_blank"
          >
            {createdLink}
          </a>
          <Button
            appearance="form"
            className="w-fit"
            onClick={() =>
              navigator.clipboard
                ?.writeText(createdLink)
                .then(() => setMessage("Booking link copied."))
                .catch(() => setMessage("Copy the booking link shown above."))
            }
            type="button"
            variant="outline"
          >
            Copy link
          </Button>
        </section>
      ) : null}
      {message ? <BookingNotice message={message} /> : null}
    </div>
  )
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
    "room",
  )
  const [name, setName] = useState("")
  return (
    <form
      className="border border-border bg-background p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) onSubmit({ capacity, kind, name: name.trim() })
      }}
    >
      <FieldGroup className="min-w-0 grid gap-4">
        <div>
          <h2 className="font-semibold">Booking resources</h2>
          <p className="text-sm text-muted-foreground">
            Create a room, staff member, or equipment resource before assigning
            it to this Service offering.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Resource name">
            <Input
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </Field>
          <Field label="Type">
            <SelectControl
              onValueChange={(value) =>
                setKind(value as "equipment" | "other" | "room" | "staff")
              }
              value={kind}
              options={[
                { value: "room", label: <>Room</> },
                { value: "staff", label: <>Staff</> },
                { value: "equipment", label: <>Equipment</> },
                { value: "other", label: <>Other</> },
              ]}
            />
          </Field>
          <Field label="Capacity">
            <Input
              min="1"
              onChange={(event) => setCapacity(Number(event.target.value) || 1)}
              required
              type="number"
              value={capacity}
            />
          </Field>
        </div>
        <FormActions>
          <SubmitButton
            isSubmitting={isPending}
            className="w-fit"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Saving resource…" : "Add resource"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
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
    <FieldSet className="grid gap-2 border border-border p-4">
      <FieldLegend variant="label" className="px-1 text-sm font-medium">
        Assigned resources
      </FieldLegend>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a resource below, then select it for this offering.
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
                      Capacity {resource.capacity}
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
    <FieldSet className="grid gap-3 border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <FieldLegend variant="label" className="text-sm font-medium">
            Availability exceptions
          </FieldLegend>
          <p className="text-xs text-muted-foreground">
            Record closures, extra opening hours, or a temporary capacity
            override.
          </p>
        </div>
        <Button
          appearance="form"
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
          Add exception
        </Button>
      </div>
      {exceptions.map((exception, index) => (
        <div
          className="grid gap-3 bg-muted/40 p-3 sm:grid-cols-2"
          key={exception.id}
        >
          <Field label="Type">
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
                { value: "open", label: <>Open</> },
                { value: "capacity_override", label: <>Capacity override</> },
              ]}
            />
          </Field>
          {exception.kind === "capacity_override" ? (
            <Field label="Temporary capacity">
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
          <Field label="Starts">
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
          <Field label="Ends">
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
            appearance="form"
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
            Remove exception
          </Button>
        </div>
      ))}
      <FieldError message={form.formState.errors.exceptions?.message} />
    </FieldSet>
  )
}

function Field({
  children,
  label,
}: { children: React.ReactNode; label: string }) {
  const id = useId()
  const [control, ...supplemental] = Children.toArray(children)
  const error = supplemental.flatMap((child) =>
    isValidElement<{ message?: string }>(child) && child.props.message
      ? [child.props.message]
      : [],
  )[0]
  return (
    <UiField data-invalid={Boolean(error)} className="gap-1.5">
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
