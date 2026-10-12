"use client"

import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { type ReactNode, useId } from "react"

type Booking = RouterOutputs["serviceCommerce"]["assistantBookingDetail"]
const label = (value: string) => value.replaceAll("_", " ")
const money = (value: number | null, currency: string) =>
  value === null ? "Not recorded" : formatFinanceMoney(String(value), currency)

function UtcTime({ value }: { value: string | null }) {
  return value ? (
    <time dateTime={value}>{new Date(value).toISOString()}</time>
  ) : (
    <>Not recorded</>
  )
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{title}</dt>
      <dd className="break-words font-medium tabular-nums">{children}</dd>
    </div>
  )
}

export function AssistantBookingContent({
  booking: b,
  checkedAt,
}: { booking: Booking; checkedAt: number }) {
  const savedId = useId()
  const paymentId = useId()
  const resourceId = useId()
  const orderId = useId()
  return (
    <div className="grid gap-5 text-sm">
      <section className="grid gap-3" aria-labelledby={savedId}>
        <h3 id={savedId} className="text-lg font-medium">
          Saved booking
        </h3>
        <dl className="grid grid-cols-2 gap-4">
          <Fact title="Stored status">{label(b.status)}</Fact>
          <Fact title="Saved revision">{b.revision}</Fact>
          <Fact title="Start (UTC)">
            <UtcTime value={b.startAt} />
          </Fact>
          <Fact title="End (UTC)">
            <UtcTime value={b.endAt} />
          </Fact>
          <Fact title="Saved timezone">{b.timezone}</Fact>
          <Fact title="Reserved capacity">{b.reservedCapacity}</Fact>
        </dl>
        <p className="text-muted-foreground">
          These are the saved time and reserved capacity for this original
          booking. Remaining capacity was not checked.
        </p>
      </section>
      <section
        className="grid gap-3 rounded-lg border p-4"
        aria-labelledby={paymentId}
      >
        <h3 id={paymentId} className="font-medium">
          Saved payment policy
        </h3>
        <dl className="grid grid-cols-2 gap-4">
          <Fact title="Stored booking payment status">
            {label(b.payment.storedStatus)}
          </Fact>
          <Fact title="Payment requirement">
            {label(b.payment.requirement)}
          </Fact>
          <Fact title="Saved payable amount">
            {money(b.payment.payableMinor, b.payment.currencyCode)}
          </Fact>
          <Fact title="Saved required amount">
            {money(b.payment.requiredMinor, b.payment.currencyCode)}
          </Fact>
          <Fact title="Saved deposit">
            {money(b.payment.depositMinor, b.payment.currencyCode)}
          </Fact>
          <Fact title="Saved policy revision">{b.payment.policyRevision}</Fact>
        </dl>
        <p className="text-muted-foreground">
          The stored booking payment status and policy amounts are separate from
          the current Order facts below. Provider settlement was not checked.
        </p>
      </section>
      <section
        className="grid gap-3 rounded-lg border p-4"
        aria-labelledby={orderId}
      >
        <h3 id={orderId} className="font-medium">
          Current original Order
        </h3>
        {b.payment.currentOrder ? (
          <dl className="grid grid-cols-2 gap-4">
            <Fact title="Order">{b.payment.currentOrder.orderNumber}</Fact>
            <Fact title="Current Order status">
              {label(b.payment.currentOrder.status)}
            </Fact>
            <Fact title="Stored Order payment status">
              {label(b.payment.currentOrder.storedPaymentStatus)}
            </Fact>
            <Fact title="Current Order total">
              {money(
                b.payment.currentOrder.totalMinor,
                b.payment.currentOrder.currencyCode,
              )}
            </Fact>
            <Fact title="Recorded amount paid">
              {money(
                b.payment.currentOrder.recordedAmountPaidMinor,
                b.payment.currentOrder.currencyCode,
              )}
            </Fact>
          </dl>
        ) : (
          <p>
            No current Order is linked to this booking. This does not establish
            a zero balance or paid outcome.
          </p>
        )}
      </section>
      <section
        className="grid gap-3 rounded-lg border p-4"
        aria-labelledby={resourceId}
      >
        <h3 id={resourceId} className="font-medium">
          Current resource and configuration
        </h3>
        <p className="font-medium">{b.resource.label}</p>
        <dl className="grid grid-cols-2 gap-4">
          <Fact title="Resource kind">{label(b.resource.kind)}</Fact>
          <Fact title="Current resource status">
            {label(b.resource.status)}
          </Fact>
          <Fact title="Current resource capacity">
            {b.resource.currentCapacity}
          </Fact>
          <Fact title="Current resource revision">
            {b.resource.currentRevision}
          </Fact>
          <Fact title="Configuration at booking">
            {b.configuration.bookedRevision}
          </Fact>
          <Fact title="Current configuration revision">
            {b.configuration.currentRevision}
          </Fact>
          <Fact title="Current configuration status">
            {label(b.configuration.currentStatus)}
          </Fact>
        </dl>
        <p className="text-muted-foreground">
          Current resource capacity is a configured total, not a count of
          available slots.
        </p>
      </section>
      <section className="grid gap-3">
        <h3 className="font-medium">Saved cancellation terms</h3>
        <dl className="grid grid-cols-2 gap-4">
          <Fact title="Window before start">
            {b.cancellationPolicy.windowMinutesBeforeStart} minutes
          </Fact>
          <Fact title="Refund policy">
            {label(b.cancellationPolicy.refundPolicy)}
          </Fact>
          <Fact title="Saved revision">{b.cancellationPolicy.revision}</Fact>
        </dl>
        <p className="text-muted-foreground">
          These saved terms are not a current cancellation or refund decision.
        </p>
      </section>
      <section className="grid gap-3">
        <h3 className="font-medium">Recorded milestones (UTC)</h3>
        <dl className="grid gap-3">
          {(
            [
              ["Confirmed", b.milestones.confirmedAt],
              ["Arrived", b.milestones.arrivedAt],
              ["Started", b.milestones.startedAt],
              ["Completed", b.milestones.completedAt],
              ["Cancelled", b.milestones.cancelledAt],
              ["No-show recorded", b.milestones.noShowAt],
            ] as const
          ).map(([title, value]) => (
            <Fact key={title} title={title}>
              <UtcTime value={value} />
            </Fact>
          ))}
        </dl>
      </section>
      <p className="border-t pt-4 text-muted-foreground">
        Checked at <UtcTime value={new Date(checkedAt).toISOString()} /> (UTC).
        This view changes no booking, payment, refund or public capability.
      </p>
    </div>
  )
}
