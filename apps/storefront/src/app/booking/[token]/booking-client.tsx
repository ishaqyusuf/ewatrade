"use client"

import { useActionState, useMemo, useRef, useState } from "react"

import { type PublicBookingActionState, submitPublicBooking } from "./actions"

const INITIAL_PUBLIC_BOOKING_STATE: PublicBookingActionState = {
  kind: "idle",
  message: null,
}

type Slot = {
  endAt: Date | string
  remainingCapacity: number
  resourceId: string
  resourceLabel: string
  startAt: Date | string
}

function formatSlot(value: Date | string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value))
}

export function BookingClient({
  accessToken,
  booking,
  configurationRevision,
  nextHref,
  offeringId,
  previousHref,
  slots,
  timezone,
}: {
  accessToken: string
  booking?: {
    endAt: Date | string
    id: string
    nextOperations: string[]
    paymentStatus: string
    resourceLabel: string | null
    revision: number
    startAt: Date | string
    status: string
    timezone: string
  } | null
  configurationRevision: number
  nextHref?: string
  offeringId: string
  previousHref?: string | null
  slots: Slot[]
  timezone: string
}) {
  const [state, action, pending] = useActionState(
    submitPublicBooking,
    INITIAL_PUBLIC_BOOKING_STATE,
  )
  const [selected, setSelected] = useState<Slot | null>(slots[0] ?? null)
  const operationId = useRef(crypto.randomUUID())
  const selectedLabel = useMemo(
    () =>
      selected
        ? `${selected.resourceLabel}, ${formatSlot(selected.startAt, timezone)}`
        : null,
    [selected, timezone],
  )

  const currentBooking =
    state.kind === "managed"
      ? state.booking
      : booking
        ? {
            ...booking,
            endAt: String(booking.endAt),
            startAt: String(booking.startAt),
          }
        : null

  if (state.kind === "confirmed") {
    return (
      <section className="grid gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
        <div>
          <h2 className="text-lg font-semibold">Appointment confirmed</h2>
          <p className="mt-1 text-sm">{state.message}</p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-emerald-800">When</dt>
            <dd className="font-medium">
              {formatSlot(state.booking.startAt, state.booking.timezone)}
            </dd>
          </div>
          <div>
            <dt className="text-emerald-800">Location or resource</dt>
            <dd className="font-medium">
              {state.booking.resourceLabel ?? "Appointment resource"}
            </dd>
          </div>
        </dl>
        {state.manageAccessToken ? (
          <a
            className="min-h-11 w-fit rounded-lg border border-emerald-300 px-4 py-3 text-sm font-medium"
            href={`/booking/${encodeURIComponent(state.manageAccessToken)}`}
          >
            Manage this appointment
          </a>
        ) : null}
      </section>
    )
  }

  if (state.kind === "cancelled") {
    return (
      <section className="grid gap-2 rounded-xl border border-border bg-muted/40 p-5">
        <h2 className="text-lg font-semibold">Appointment cancelled</h2>
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </section>
    )
  }

  if (currentBooking) {
    const canCancel = currentBooking.nextOperations.includes("cancel")
    const canReschedule = currentBooking.nextOperations.includes("reschedule")
    return (
      <section className="grid gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <p className="text-sm text-muted-foreground">Appointment details</p>
          <h2 className="text-lg font-semibold capitalize">
            {currentBooking.status.replaceAll("_", " ")}
          </h2>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">When</dt>
            <dd className="font-medium">
              {formatSlot(currentBooking.startAt, currentBooking.timezone)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location or resource</dt>
            <dd className="font-medium">
              {currentBooking.resourceLabel ?? "Appointment resource"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Payment</dt>
            <dd className="font-medium capitalize">
              {currentBooking.paymentStatus.replaceAll("_", " ")}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {canReschedule ? (
            <p className="text-sm text-muted-foreground">
              To reschedule, choose an available time below. Availability is
              checked again before the change is confirmed.
            </p>
          ) : null}
          {canCancel ? (
            <form action={action}>
              <input name="intent" type="hidden" value="cancel" />
              <input name="accessToken" type="hidden" value={accessToken} />
              <input
                name="clientOperationId"
                type="hidden"
                value={operationId.current}
              />
              <input name="bookingId" type="hidden" value={currentBooking.id} />
              <input
                name="expectedRevision"
                type="hidden"
                value={currentBooking.revision}
              />
              <button
                className="min-h-11 rounded-lg border border-destructive/30 px-4 text-sm font-medium text-destructive disabled:opacity-60"
                disabled={pending}
                type="submit"
              >
                {pending ? "Cancelling…" : "Cancel appointment"}
              </button>
            </form>
          ) : null}
        </div>
        {canReschedule && slots.length > 0 ? (
          <RescheduleSlots
            accessToken={accessToken}
            booking={currentBooking}
            operationId={operationId.current}
            slots={slots}
            timezone={timezone}
          />
        ) : canReschedule ? (
          <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            No alternative times are available in this window. Try another week
            or contact the business.
          </p>
        ) : null}
        {state.kind === "error" ? (
          <BookingError message={state.message} />
        ) : null}
      </section>
    )
  }

  if (state.kind === "held") {
    return (
      <section className="grid gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div>
          <h2 className="text-lg font-semibold">Confirm your appointment</h2>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Hold expires {formatSlot(state.expiresAt, timezone)}.
          </p>
        </div>
        <form action={action} className="grid gap-3">
          <input name="intent" type="hidden" value="confirm" />
          <input name="accessToken" type="hidden" value={state.confirmToken} />
          <input
            name="clientOperationId"
            type="hidden"
            value={operationId.current}
          />
          <button
            className="min-h-12 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "Confirming…" : "Confirm appointment"}
          </button>
        </form>
      </section>
    )
  }

  if (slots.length === 0) {
    return (
      <section className="grid gap-3 rounded-xl border border-border bg-muted/40 p-5">
        <h2 className="font-semibold">No times are available yet</h2>
        <p className="text-sm text-muted-foreground">
          Try again later or contact the business for another appointment time.
        </p>
        <button
          className="min-h-11 w-fit rounded-lg border border-border px-4 text-sm font-medium"
          onClick={() => window.location.reload()}
          type="button"
        >
          Refresh availability
        </button>
      </section>
    )
  }

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">Choose an appointment time</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          All times are shown in {timezone}. Availability is checked again when
          you continue.
        </p>
      </div>
      <div aria-label="Available appointment times" className="grid gap-2">
        {slots.map((slot) => {
          const active =
            selected?.resourceId === slot.resourceId &&
            new Date(selected.startAt).getTime() ===
              new Date(slot.startAt).getTime()
          return (
            <button
              aria-pressed={active}
              className={`grid min-h-16 grid-cols-[1fr_auto] items-center gap-3 rounded-lg border p-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                active ? "border-primary bg-primary/5" : "border-border bg-card"
              }`}
              key={`${slot.resourceId}:${String(slot.startAt)}`}
              onClick={() => setSelected(slot)}
              type="button"
            >
              <span>
                <span className="block font-medium">
                  {formatSlot(slot.startAt, timezone)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {slot.resourceLabel}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {slot.remainingCapacity} left
              </span>
            </button>
          )
        })}
      </div>
      {nextHref ? (
        <nav aria-label="Availability weeks" className="flex flex-wrap gap-2">
          {previousHref ? (
            <a
              className="min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-medium"
              href={previousHref}
            >
              Previous week
            </a>
          ) : null}
          <a
            className="min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-medium"
            href={nextHref}
          >
            Next week
          </a>
        </nav>
      ) : null}
      <form action={action} className="grid gap-3 border-t border-border pt-4">
        <input name="intent" type="hidden" value="hold" />
        <input name="accessToken" type="hidden" value={accessToken} />
        <input
          name="clientOperationId"
          type="hidden"
          value={operationId.current}
        />
        <input
          name="expectedConfigurationRevision"
          type="hidden"
          value={configurationRevision}
        />
        <input name="offeringId" type="hidden" value={offeringId} />
        <input
          name="resourceId"
          type="hidden"
          value={selected?.resourceId ?? ""}
        />
        <input
          name="slotStartAt"
          type="hidden"
          value={selected ? new Date(selected.startAt).toISOString() : ""}
        />
        <input
          name="slotEndAt"
          type="hidden"
          value={selected ? new Date(selected.endAt).toISOString() : ""}
        />
        <p className="text-sm text-muted-foreground">
          {selectedLabel
            ? `Selected: ${selectedLabel}`
            : "Choose a time to continue."}
        </p>
        <button
          className="min-h-12 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          disabled={!selected || pending}
          type="submit"
        >
          {pending ? "Holding time…" : "Continue to confirmation"}
        </button>
      </form>
      {state.kind === "error" ? <BookingError message={state.message} /> : null}
    </section>
  )
}

function RescheduleSlots({
  accessToken,
  booking,
  operationId,
  slots,
  timezone,
}: {
  accessToken: string
  booking: {
    id: string
    revision: number
  }
  operationId: string
  slots: Slot[]
  timezone: string
}) {
  const [state, action, pending] = useActionState(
    submitPublicBooking,
    INITIAL_PUBLIC_BOOKING_STATE,
  )
  const [selected, setSelected] = useState<Slot | null>(slots[0] ?? null)
  return (
    <form action={action} className="grid gap-3 border-t border-border pt-4">
      <h3 className="font-medium">Choose a new time</h3>
      <div className="grid gap-2">
        {slots.map((slot) => {
          const active =
            selected?.resourceId === slot.resourceId &&
            new Date(selected.startAt).getTime() ===
              new Date(slot.startAt).getTime()
          return (
            <button
              aria-pressed={active}
              className={`min-h-12 rounded-lg border px-3 text-left text-sm ${
                active ? "border-primary bg-primary/5" : "border-border"
              }`}
              key={`${slot.resourceId}:${String(slot.startAt)}`}
              onClick={() => setSelected(slot)}
              type="button"
            >
              {formatSlot(slot.startAt, timezone)} · {slot.resourceLabel}
            </button>
          )
        })}
      </div>
      <input name="intent" type="hidden" value="reschedule" />
      <input name="accessToken" type="hidden" value={accessToken} />
      <input name="bookingId" type="hidden" value={booking.id} />
      <input name="expectedRevision" type="hidden" value={booking.revision} />
      <input
        name="clientOperationId"
        type="hidden"
        value={`${operationId}:reschedule`}
      />
      <input
        name="resourceId"
        type="hidden"
        value={selected?.resourceId ?? ""}
      />
      <input
        name="slotStartAt"
        type="hidden"
        value={selected ? new Date(selected.startAt).toISOString() : ""}
      />
      <input
        name="slotEndAt"
        type="hidden"
        value={selected ? new Date(selected.endAt).toISOString() : ""}
      />
      <button
        className="min-h-12 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        disabled={!selected || pending}
        type="submit"
      >
        {pending ? "Rescheduling…" : "Reschedule appointment"}
      </button>
      {state.kind === "managed" ? (
        <a
          className="min-h-11 w-fit rounded-lg border border-border px-4 py-3 text-sm font-medium"
          href={`/booking/${encodeURIComponent(state.manageAccessToken ?? accessToken)}`}
        >
          View updated appointment
        </a>
      ) : null}
      {state.kind === "error" ? <BookingError message={state.message} /> : null}
    </form>
  )
}

function BookingError({ message }: { message: string }) {
  return (
    <div
      className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
      role="alert"
    >
      <p>{message}</p>
      <button
        className="min-h-10 w-fit rounded-lg border border-destructive/30 px-3 font-medium"
        onClick={() => window.location.reload()}
        type="button"
      >
        Refresh available times
      </button>
    </div>
  )
}
