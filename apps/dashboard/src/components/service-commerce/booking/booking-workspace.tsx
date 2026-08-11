"use client"

import type { RegisterServiceCommerceFormReset } from "@/components/service-commerce/form-context"
import {
  ServiceCommerceBookingConfigurationFormProvider,
  type ServiceCommerceBookingConfigurationFormValues,
} from "@/components/service-commerce/form-context"
import { useServiceCommerceParams } from "@/hooks/use-service-commerce-params"
import { useTRPC } from "@/trpc/client"
import { serviceCommerceBookingConfigurationFormSchema } from "@ewatrade/service-commerce"
import { Button } from "@ewatrade/ui"
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

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

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
      <section className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div>
          <h2 className="font-semibold">Booking availability</h2>
          <p className="text-sm text-muted-foreground">
            Store-scoped time, capacity, payment, and cancellation policy.
          </p>
        </div>
        {configuration.isLoading ? <BookingSkeleton /> : null}
        {configuration.isError ? (
          <div className="grid gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p>
              No active booking configuration is available for this offering.
              Create a resource below, then save the configuration.
            </p>
            <Button
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
            className="grid gap-4"
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Store timezone">
                <input className={inputClass} {...form.register("timezone")} />
              </Field>
              <Field label="Appointment duration (minutes)">
                <input
                  className={inputClass}
                  min="1"
                  type="number"
                  {...form.register("slotDurationMinutes", {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Field label="Customer lead time (minutes)">
                <input
                  className={inputClass}
                  min="0"
                  type="number"
                  {...form.register("leadTimeMinutes", { valueAsNumber: true })}
                />
              </Field>
              <Field label="Hold duration (minutes)">
                <input
                  className={inputClass}
                  min="1"
                  type="number"
                  {...form.register("holdDurationMinutes", {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Field label="Booking horizon (minutes)">
                <input
                  className={inputClass}
                  min="1"
                  type="number"
                  {...form.register("bookingHorizonMinutes", {
                    valueAsNumber: true,
                  })}
                />
                <FieldError
                  message={form.formState.errors.bookingHorizonMinutes?.message}
                />
              </Field>
              <Field label="First reminder (minutes before)">
                <input
                  className={inputClass}
                  min="0"
                  type="number"
                  {...form.register("reminderLeadMinutes", {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Field label="Cancellation window (minutes before)">
                <input
                  className={inputClass}
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
                <select
                  className={inputClass}
                  {...form.register("cancellationPolicy.refundPolicy")}
                >
                  <option value="manual_review">Manual review</option>
                  <option value="full_before_cutoff">Full before cutoff</option>
                  <option value="none">No refund</option>
                </select>
                <FieldError
                  message={
                    form.formState.errors.cancellationPolicy?.refundPolicy
                      ?.message
                  }
                />
              </Field>
            </div>
            <fieldset className="grid gap-2 rounded-lg border border-border p-4">
              <legend className="px-1 text-sm font-medium">
                Payment policy
              </legend>
              <label className="grid gap-1 text-sm">
                Requirement
                <select
                  className={inputClass}
                  {...form.register("paymentPolicy.requirement")}
                >
                  <option value="none">No payment required</option>
                  <option value="deposit">Deposit required</option>
                  <option value="full">Full payment required</option>
                </select>
              </label>
              {form.watch("paymentPolicy.requirement") === "deposit" ? (
                <Field label="Deposit (minor currency units)">
                  <input
                    className={inputClass}
                    min="1"
                    type="number"
                    {...form.register("paymentPolicy.depositMinor", {
                      setValueAs: (value) =>
                        value === "" ? null : Number(value),
                    })}
                  />
                  <FieldError
                    message={
                      form.formState.errors.paymentPolicy?.depositMinor?.message
                    }
                  />
                </Field>
              ) : null}
              <FieldError
                message={form.formState.errors.paymentPolicy?.message}
              />
            </fieldset>
            <fieldset className="grid gap-2 rounded-lg border border-border p-4">
              <legend className="px-1 text-sm font-medium">
                Working hours
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Starts">
                  <input
                    className={inputClass}
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
                  <input
                    className={inputClass}
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
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Open weekdays</legend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(({ label, value }) => {
                    const rule = currentAvailabilityRule(form)
                    const selected = rule.daysOfWeek.includes(value)
                    return (
                      <label
                        className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm"
                        key={value}
                      >
                        <input
                          checked={selected}
                          onChange={(event) => {
                            const current = currentAvailabilityRule(form)
                            const daysOfWeek = event.target.checked
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
                          type="checkbox"
                        />
                        {label}
                      </label>
                    )
                  })}
                </div>
                <FieldError
                  message={
                    form.formState.errors.availabilityRules?.[0]?.daysOfWeek
                      ?.message
                  }
                />
              </fieldset>
              <p className="text-xs text-muted-foreground">
                Weekday hours are applied to each selected resource. Exceptions
                remain server-authorized and are never inferred in the browser.
              </p>
            </fieldset>
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
            <Button
              disabled={pending || form.watch("resources").length === 0}
              type="submit"
            >
              {updateConfiguration.isPending
                ? "Saving availability…"
                : "Save booking availability"}
            </Button>
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

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div>
          <h2 className="font-semibold">Booking source</h2>
          <p className="text-sm text-muted-foreground">
            Choose the eligible Service request this appointment belongs to.
          </p>
        </div>
        {sourceRequests.isLoading ? (
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        ) : sourceRequests.isError ? (
          <div className="grid gap-2 text-sm text-destructive" role="alert">
            <p>Service requests are unavailable.</p>
            <Button
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
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Service request</span>
            <select
              aria-describedby="booking-source-help"
              className={inputClass}
              onChange={(event) =>
                void params.setParams({
                  sourceId: event.target.value || null,
                  sourceKind: event.target.value ? "service" : null,
                })
              }
              value={source?.id ?? ""}
            >
              <option value="">Choose a request</option>
              {eligibleSources.map((request) => {
                const line = request.lines.find(
                  (item) => item.offeringId === offeringId,
                )
                return (
                  <option key={request.id} value={request.id}>
                    {request.customerName} · {line?.offeringName ?? "Service"}
                  </option>
                )
              })}
            </select>
            <span
              className="text-xs text-muted-foreground"
              id="booking-source-help"
            >
              The public link is scoped to this request and cannot be reused for
              another customer.
            </span>
          </label>
        )}
      </section>

      {source ? (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div>
            <h2 className="font-semibold">Customer booking link</h2>
            <p className="text-sm text-muted-foreground">
              Issue one expiring public capability for this eligible source.
            </p>
          </div>
          <Button
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
        <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Select an eligible Service request above to issue its customer booking
          link. Configuration remains Store-scoped.
        </p>
      )}
      {createdLink ? (
        <section className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
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
      className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) onSubmit({ capacity, kind, name: name.trim() })
      }}
    >
      <div>
        <h2 className="font-semibold">Booking resources</h2>
        <p className="text-sm text-muted-foreground">
          Create a room, staff member, or equipment resource before assigning it
          to this Service offering.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Resource name">
          <input
            className={inputClass}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </Field>
        <Field label="Type">
          <select
            className={inputClass}
            onChange={(event) =>
              setKind(
                event.target.value as "equipment" | "other" | "room" | "staff",
              )
            }
            value={kind}
          >
            <option value="room">Room</option>
            <option value="staff">Staff</option>
            <option value="equipment">Equipment</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Capacity">
          <input
            className={inputClass}
            min="1"
            onChange={(event) => setCapacity(Number(event.target.value) || 1)}
            required
            type="number"
            value={capacity}
          />
        </Field>
      </div>
      <Button className="w-fit" disabled={isPending} type="submit">
        {isPending ? "Saving resource…" : "Add resource"}
      </Button>
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
    <fieldset className="grid gap-2 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium">Assigned resources</legend>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a resource below, then select it for this offering.
        </p>
      ) : (
        <div className="grid gap-2">
          {options.map((resource) => {
            const checked = selected.some((item) => item.id === resource.id)
            return (
              <label
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 text-sm"
                key={resource.id}
              >
                <span className="flex items-center gap-2">
                  <input
                    checked={checked}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? mergeBookingResources(selected, [resource])
                          : selected.filter((item) => item.id !== resource.id),
                      )
                    }
                    type="checkbox"
                  />
                  <span className="font-medium">{resource.label}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Capacity {resource.capacity}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </fieldset>
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
    <fieldset className="grid gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <legend className="text-sm font-medium">
            Availability exceptions
          </legend>
          <p className="text-xs text-muted-foreground">
            Record closures, extra opening hours, or a temporary capacity
            override.
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
          Add exception
        </Button>
      </div>
      {exceptions.map((exception, index) => (
        <div
          className="grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2"
          key={exception.id}
        >
          <Field label="Type">
            <select
              className={inputClass}
              onChange={(event) => {
                const kind = event.target.value as typeof exception.kind
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
            >
              <option value="closed">Closed</option>
              <option value="open">Open</option>
              <option value="capacity_override">Capacity override</option>
            </select>
          </Field>
          {exception.kind === "capacity_override" ? (
            <Field label="Temporary capacity">
              <input
                className={inputClass}
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
            <input
              className={inputClass}
              onChange={(event) =>
                update(index, {
                  ...exception,
                  startAt: new Date(event.target.value),
                })
              }
              type="datetime-local"
              value={toLocalDateTime(exception.startAt)}
            />
          </Field>
          <Field label="Ends">
            <input
              className={inputClass}
              onChange={(event) =>
                update(index, {
                  ...exception,
                  endAt: new Date(event.target.value),
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
            Remove exception
          </Button>
        </div>
      ))}
      <FieldError message={form.formState.errors.exceptions?.message} />
    </fieldset>
  )
}

function Field({
  children,
  label,
}: { children: React.ReactNode; label: string }) {
  const id = useId()
  const [control, ...supplemental] = Children.toArray(children)
  return (
    <label className="grid gap-1.5 text-sm" htmlFor={id}>
      <span className="font-medium">{label}</span>
      {isValidElement(control)
        ? cloneElement(control, { id } as Record<string, string>)
        : control}
      {supplemental}
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="text-xs text-destructive">{message}</span>
  ) : null
}

function BookingNotice({ message }: { message: string }) {
  return (
    <output
      aria-live="polite"
      className="block rounded-lg border border-border bg-muted/40 p-4 text-sm"
    >
      {message}
    </output>
  )
}

function BookingSkeleton() {
  return <div className="h-56 animate-pulse rounded-lg bg-muted" />
}
