"use client"
import type { ReceiptView } from "@ewatrade/storefront-contracts/receipt"
import { Badge } from "@ewatrade/ui"
const appointmentCopy: Record<string, { label: string; note: string }> = {
  SCHEDULED: {
    label: "Booked",
    note: "The business booked this time for you.",
  },
  CONFIRMED: {
    label: "Booked",
    note: "The business booked this time for you.",
  },
  ARRIVED: {
    label: "In progress",
    note: "You've arrived. The business has started.",
  },
  IN_SERVICE: {
    label: "In progress",
    note: "You've arrived. The business has started.",
  },
  COMPLETED: { label: "Done", note: "This appointment is done." },
  CANCELLED: {
    label: "Cancelled",
    note: "This appointment was cancelled. The business will agree a new time with you.",
  },
  NO_SHOW: {
    label: "Missed",
    note: "This appointment was missed. Message the business to book a new time.",
  },
}

/** Live appointments are the ones a customer should still turn up for. */
export function isLiveAppointment(status: string | undefined) {
  return (
    status === "SCHEDULED" ||
    status === "CONFIRMED" ||
    status === "ARRIVED" ||
    status === "IN_SERVICE"
  )
}

function appointmentWhen(appointment: NonNullable<ReceiptView["appointment"]>) {
  const zone = { timeZone: appointment.timezone }
  const day = new Date(appointment.startsAt).toLocaleDateString("en-NG", {
    ...zone,
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  const time = (value: string, withZone: boolean) =>
    new Date(value).toLocaleTimeString("en-NG", {
      ...zone,
      hour: "numeric",
      minute: "2-digit",
      ...(withZone ? { timeZoneName: "short" as const } : {}),
    })
  return appointment.endsAt
    ? `${day}, ${time(appointment.startsAt, false)} to ${time(appointment.endsAt, true)}`
    : `${day}, ${time(appointment.startsAt, true)}`
}

/** A preferred date is only ever the customer's preference, never a booking. */
export function preferredDateNote(appointmentStatus: string | undefined) {
  return isLiveAppointment(appointmentStatus)
    ? " (your preference, not the booked time)"
    : " (your preference, not booked yet)"
}

/** The business's appointment as the customer should read it. */
export function ReceiptAppointment({
  appointment,
  fallbackName,
}: {
  appointment: NonNullable<ReceiptView["appointment"]>
  fallbackName: string
}) {
  const live = isLiveAppointment(appointment.status)
  const copy = appointmentCopy[appointment.status] ?? appointmentCopy.CONFIRMED
  const when = appointmentWhen(appointment)
  return (
    <div
      className="sf-feature-card-panel"
      data-appointment-status={appointment.status}
    >
      <div className="sf-feature-panel-head">
        <h2 className="sf-feature-subtitle">Appointment</h2>
        <Badge variant={live ? "secondary" : "outline"}>{copy?.label}</Badge>
      </div>
      <p>{appointment.serviceName || fallbackName}</p>
      <p>
        {live || appointment.status === "COMPLETED" ? (
          <strong>{when}</strong>
        ) : (
          <del className="sf-feature-muted">{when}</del>
        )}
      </p>
      <p className="sf-feature-muted">{copy?.note}</p>
    </div>
  )
}
