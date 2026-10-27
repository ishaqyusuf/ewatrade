"use client"
import {
  Button,
  ControlField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectControl,
  SubmitButton,
  toast,
} from "@ewatrade/ui"

import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type RefObject, useRef, useState } from "react"
import {
  CANCEL_REASONS,
  RESCHEDULE_REASONS,
  type StaffBookingRow,
  bookingActions,
  bookingCommandError,
  bookingStatusLabel,
  formatBookingWhen,
  formatDayKey,
  formatSlotTime,
  operationIdFor,
  upcomingDayKeys,
  zonedDayWindow,
} from "./booking-appointments-state"

type Scope = { offeringId: string; sourceId: string; storeId: string }
type Dialogs =
  | { kind: "reschedule"; bookingId: string }
  | { kind: "cancel"; bookingId: string }
  | null

/** Booked times for one customer request, with staff reschedule and cancel. */
export function BookingAppointments(scope: Scope) {
  const trpc = useTRPC()
  const bookings = useQuery(
    trpc.serviceCommerce.sourceBookings.queryOptions(scope, { retry: false }),
  )
  const [dialog, setDialog] = useState<Dialogs>(null)
  const triggers = useRef(new Map<string, HTMLButtonElement | null>())
  // Focus returns to the button that opened the dialog, or the list if it's gone.
  const listRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const open = (next: NonNullable<Dialogs>) => {
    returnFocus.current =
      triggers.current.get(`${next.kind}:${next.bookingId}`) ?? null
    setDialog(next)
  }
  const booking = bookings.data?.find((row) => row.id === dialog?.bookingId)

  if (bookings.isLoading) return <div className="h-16 animate-pulse bg-muted" />
  if (bookings.isError)
    return (
      <div className="grid gap-2 text-sm text-destructive" role="alert">
        <p>Booked times didn’t load. {bookings.error.message}</p>
        <Button
          className="w-fit"
          onClick={() => void bookings.refetch()}
          size="sm"
          variant="outline"
        >
          Try again
        </Button>
      </div>
    )
  const rows = bookings.data ?? []
  return (
    <div className="grid gap-2" ref={listRef} tabIndex={-1}>
      <p className="text-sm font-medium">Booked times</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing booked for this request yet.
        </p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => {
            const actions = bookingActions(row.status)
            const ended = ["cancelled", "no_show"].includes(row.status)
            return (
              <li
                className="flex flex-wrap items-center gap-3 border border-border px-3 py-2.5"
                key={row.id}
              >
                <div className="min-w-0 flex-1">
                  <p className={ended ? "text-sm line-through" : "text-sm"}>
                    {formatBookingWhen(row)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bookingStatusLabel(row.status)} · {row.resource.label}
                  </p>
                </div>
                {actions.canReschedule ? (
                  <Button
                    onClick={() =>
                      open({ bookingId: row.id, kind: "reschedule" })
                    }
                    ref={(node) => {
                      triggers.current.set(`reschedule:${row.id}`, node)
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Reschedule
                  </Button>
                ) : null}
                {actions.canCancel ? (
                  <Button
                    onClick={() => open({ bookingId: row.id, kind: "cancel" })}
                    ref={(node) => {
                      triggers.current.set(`cancel:${row.id}`, node)
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel booking
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <RescheduleDialog
        booking={dialog?.kind === "reschedule" ? booking : undefined}
        onClose={() => setDialog(null)}
        onStale={() => void bookings.refetch()}
        returnFocus={returnFocus}
        fallbackFocus={listRef}
        scope={scope}
      />
      <CancelDialog
        booking={dialog?.kind === "cancel" ? booking : undefined}
        onClose={() => setDialog(null)}
        onStale={() => void bookings.refetch()}
        returnFocus={returnFocus}
        fallbackFocus={listRef}
        scope={scope}
      />
    </div>
  )
}

type DialogProps = {
  booking: StaffBookingRow | undefined
  fallbackFocus: RefObject<HTMLElement | null>
  onClose: () => void
  onStale: () => void
  returnFocus: RefObject<HTMLElement | null>
  scope: Scope
}

function focusTarget(
  returnFocus: RefObject<HTMLElement | null>,
  fallback: RefObject<HTMLElement | null>,
) {
  // After cancelling, the trigger unmounts; fall back to the list.
  return () =>
    returnFocus.current?.isConnected ? returnFocus.current : fallback.current
}

function useRevise(scope: Scope, onStale: () => void) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const operation = useRef<{ key: string; id: string } | null>(null)
  const mutation = useMutation(
    trpc.serviceCommerce.reviseBooking.mutationOptions({
      onError: (error) => {
        if (bookingCommandError(error).kind === "stale") onStale()
      },
      onSettled: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.serviceCommerce.sourceBookings.queryKey(scope),
        }),
    }),
  )
  const submit = (
    payload: Omit<
      Parameters<typeof mutation.mutate>[0],
      "clientOperationId" | "storeId"
    >,
    handlers: { onError?: (error: unknown) => void; onSuccess: () => void },
  ) => {
    operation.current = operationIdFor(operation.current, payload, () =>
      crypto.randomUUID(),
    )
    mutation.mutate(
      {
        ...payload,
        clientOperationId: operation.current.id,
        storeId: scope.storeId,
      },
      handlers,
    )
  }
  return { mutation, submit }
}

function RescheduleDialog({
  booking,
  fallbackFocus,
  onClose,
  onStale,
  returnFocus,
  scope,
}: DialogProps) {
  return (
    <Dialog
      open={Boolean(booking)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="max-w-[520px] p-5 text-foreground"
        finalFocus={focusTarget(returnFocus, fallbackFocus)}
      >
        {booking ? (
          <RescheduleForm
            booking={booking}
            key={booking.id}
            onClose={onClose}
            onStale={onStale}
            scope={scope}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RescheduleForm({
  booking,
  onClose,
  onStale,
  scope,
}: Omit<DialogProps, "booking" | "fallbackFocus" | "returnFocus"> & {
  booking: StaffBookingRow
}) {
  const trpc = useTRPC()
  const days = upcomingDayKeys(new Date(), booking.timezone, 14)
  const [day, setDay] = useState(days[0] ?? "")
  const [slot, setSlot] = useState<{ startAt: string; endAt: string } | null>(
    null,
  )
  const [reason, setReason] = useState<string>(RESCHEDULE_REASONS[0].value)
  const [error, setError] = useState<string | null>(null)
  const dayWindow = zonedDayWindow(day, booking.timezone)
  const slots = useQuery(
    trpc.serviceCommerce.staffBookingSlots.queryOptions(
      {
        ...dayWindow,
        offeringId: scope.offeringId,
        resourceId: booking.resource.id,
        sourceId: scope.sourceId,
        storeId: scope.storeId,
      },
      { enabled: Boolean(day), retry: false, staleTime: 0 },
    ),
  )
  const { mutation, submit } = useRevise(scope, onStale)
  const open = (slots.data?.slots ?? []).filter(
    (item) => item.startAt !== booking.startAt,
  )
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!slot) {
          setError("Pick a new time.")
          return
        }
        setError(null)
        submit(
          {
            bookingId: booking.id,
            expectedRevision: booking.revision,
            newSlotEndAt: new Date(slot.endAt),
            newSlotStartAt: new Date(slot.startAt),
            operation: "reschedule",
            reasonCode: reason,
            resourceId: booking.resource.id,
          },
          {
            onError: (failure) => {
              if (bookingCommandError(failure).kind !== "slot_taken") return
              setSlot(null)
              void slots.refetch()
            },
            onSuccess: () => {
              toast(
                `Moved to ${formatBookingWhen({ ...slot, timezone: booking.timezone })}.`,
              )
              onClose()
            },
          },
        )
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg font-medium text-foreground">
          Reschedule booking
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Now {formatBookingWhen(booking)} with {booking.resource.label}. Times
          are in {booking.timezone}.
        </DialogDescription>
      </DialogHeader>
      <ControlField label="Day">
        <SelectControl
          onValueChange={(value) => {
            setDay(value)
            setSlot(null)
          }}
          options={days.map((key) => ({
            label: <>{formatDayKey(key)}</>,
            value: key,
          }))}
          value={day}
        />
      </ControlField>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Open times</legend>
        {slots.isLoading ? (
          <output className="h-20 animate-pulse bg-muted" aria-live="polite">
            <span className="sr-only">Loading open times…</span>
          </output>
        ) : slots.isError ? (
          <div className="grid gap-2 text-sm text-destructive" role="alert">
            <p>Open times didn’t load. {slots.error.message}</p>
            <Button
              className="w-fit"
              onClick={() => void slots.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        ) : open.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open times this day. Try another day.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {open.map((item) => {
              const selected = slot?.startAt === item.startAt
              return (
                <Button
                  aria-pressed={selected}
                  key={item.startAt}
                  onClick={() => {
                    setSlot({ endAt: item.endAt, startAt: item.startAt })
                    setError(null)
                    mutation.reset()
                  }}
                  size="sm"
                  type="button"
                  variant={selected ? "default" : "outline"}
                >
                  {formatSlotTime(item.startAt, booking.timezone)}
                </Button>
              )
            })}
          </div>
        )}
      </fieldset>
      <ControlField label="Reason">
        <SelectControl
          onValueChange={setReason}
          options={RESCHEDULE_REASONS.map((item) => ({
            label: <>{item.label}</>,
            value: item.value,
          }))}
          value={reason}
        />
      </ControlField>
      <CommandError error={error} mutationError={mutation.error} />
      <DialogFooter>
        <Button onClick={onClose} type="button" variant="outline">
          Keep current time
        </Button>
        <SubmitButton
          disabled={mutation.isPending}
          isSubmitting={mutation.isPending}
          type="submit"
        >
          {mutation.isPending ? "Moving…" : "Move booking"}
        </SubmitButton>
      </DialogFooter>
    </form>
  )
}

function CancelDialog({
  booking,
  fallbackFocus,
  onClose,
  onStale,
  returnFocus,
  scope,
}: DialogProps) {
  return (
    <Dialog
      open={Boolean(booking)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="max-w-[455px] p-5 text-foreground"
        finalFocus={focusTarget(returnFocus, fallbackFocus)}
      >
        {booking ? (
          <CancelForm
            booking={booking}
            key={booking.id}
            onClose={onClose}
            onStale={onStale}
            scope={scope}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CancelForm({
  booking,
  onClose,
  onStale,
  scope,
}: Omit<DialogProps, "booking" | "fallbackFocus" | "returnFocus"> & {
  booking: StaffBookingRow
}) {
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0].value)
  const { mutation, submit } = useRevise(scope, onStale)
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit(
          {
            bookingId: booking.id,
            expectedRevision: booking.revision,
            operation: "cancel",
            reasonCode: reason,
          },
          {
            onSuccess: () => {
              toast("Booking cancelled.")
              onClose()
            },
          },
        )
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg font-medium text-foreground">
          Cancel this booking?
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {formatBookingWhen(booking)} with {booking.resource.label}. The time
          opens up for others and the customer’s receipt shows it cancelled.
        </DialogDescription>
      </DialogHeader>
      <ControlField label="Reason">
        <SelectControl
          onValueChange={setReason}
          options={CANCEL_REASONS.map((item) => ({
            label: <>{item.label}</>,
            value: item.value,
          }))}
          value={reason}
        />
      </ControlField>
      <CommandError error={null} mutationError={mutation.error} />
      <DialogFooter>
        <Button onClick={onClose} type="button" variant="outline">
          Keep booking
        </Button>
        <SubmitButton
          disabled={mutation.isPending}
          isSubmitting={mutation.isPending}
          type="submit"
          variant="destructive"
        >
          {mutation.isPending ? "Cancelling…" : "Cancel booking"}
        </SubmitButton>
      </DialogFooter>
    </form>
  )
}

function CommandError({
  error,
  mutationError,
}: { error: string | null; mutationError: unknown }) {
  const message =
    error ?? (mutationError ? bookingCommandError(mutationError).message : null)
  return message ? (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null
}
