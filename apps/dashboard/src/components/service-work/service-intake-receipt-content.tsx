"use client"
import type { ServiceIntakeReceiptRecord } from "@ewatrade/db/service-intake-receipt"
import { Button } from "@ewatrade/ui"
import { formatDue, formatMoney, label } from "./service-utils"

export function ServiceIntakeReceiptContent({
  receipt: r,
  timeZone,
  onOpenOrder,
  onOpenJob,
}: {
  receipt: ServiceIntakeReceiptRecord
  timeZone: string
  onOpenOrder: (id: string) => void
  onOpenJob: (id: string) => void
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <h3 className="font-medium">{r.orderNumber} · Confirmed intake</h3>
        <p className="text-sm text-muted-foreground">
          {r.customer.name ?? "Walk-in contact"}
          {r.customer.phone ? ` · ${r.customer.phone}` : ""}
          {r.customer.email ? ` · ${r.customer.email}` : ""}
        </p>
        <p className="text-xs break-all text-muted-foreground">
          Intake {r.intakeId}
        </p>
        <p className="text-sm">
          Confirmed{" "}
          {r.confirmedAt
            ? formatDue(r.confirmedAt, timeZone)
            : "Time unavailable"}
        </p>
      </div>
      <div className="divide-y border-y">
        {r.lines.map((line) => (
          <div key={line.orderLineId} className="grid gap-1 py-3">
            <p className="font-medium">
              {line.itemName} · {line.variantName} · {line.offeringName}
            </p>
            <p className="text-sm">
              {line.quantity} ×{" "}
              {formatMoney(line.unitPriceMinor, r.currencyCode)} ·{" "}
              {formatMoney(line.totalMinor, r.currencyCode)}
            </p>
            <p className="text-xs text-muted-foreground">
              {line.workPolicy === "TRACKED"
                ? "Tracked Job Line"
                : "Charge-only Order line"}{" "}
              · {label(line.authorizationPolicy)}
            </p>
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt>Original subtotal</dt>
        <dd className="text-right">
          {formatMoney(r.subtotalMinor, r.currencyCode)}
        </dd>
        <dt>Service charge</dt>
        <dd className="text-right">
          {formatMoney(r.serviceChargeMinor, r.currencyCode)}
        </dd>
        <dt>Original total</dt>
        <dd className="text-right font-medium">
          {formatMoney(r.totalMinor, r.currencyCode)}
        </dd>
        <dt>Initial recorded payment</dt>
        <dd className="text-right">
          {formatMoney(r.initialPaymentMinor, r.currencyCode)}
        </dd>
        <dt>Balance at intake</dt>
        <dd className="text-right">
          {formatMoney(r.initialBalanceMinor, r.currencyCode)}
        </dd>
      </dl>
      {r.initialPayment ? (
        <p className="text-sm">
          Payment: {label(r.initialPayment.method)}
          {r.initialPayment.reference ? ` · ${r.initialPayment.reference}` : ""}
          . Recorded {formatDue(r.initialPayment.recordedAt, timeZone)}.
        </p>
      ) : null}
      <p className="text-sm">
        {label(r.serviceLevel)} · {label(r.priority)} · Promised:{" "}
        {formatDue(r.promisedAt, timeZone)}
      </p>
      {r.assigneeUserId ? (
        <p className="text-sm break-all">
          Original assignee: {r.assigneeUserId}
        </p>
      ) : null}
      {r.instructions ? (
        <div className="text-sm">
          <p className="font-medium">Saved instructions</p>
          <p className="whitespace-pre-wrap">{r.instructions}</p>
        </div>
      ) : null}
      {r.conditionNote ? (
        <div className="text-sm">
          <p className="font-medium">Saved condition</p>
          <p className="whitespace-pre-wrap">{r.conditionNote}</p>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        These are original intake facts. Open the Order for current payments and
        balance; current work status is shown below.
      </p>
      <Button variant="outline" onClick={() => onOpenOrder(r.orderId)}>
        Open {r.orderNumber}
      </Button>
      {r.jobs.length ? (
        r.jobs.map((job, index) => (
          <div key={job.id} className="grid gap-2 border-t pt-3">
            <p className="font-medium">
              Job {index + 1} · {job.lines.length} tracked line(s)
            </p>
            {job.lines.map((line) => (
              <p key={line.id} className="text-sm">
                {line.allocatedQuantity} · {label(line.status)} ·{" "}
                {label(line.authorizationStatus)}
              </p>
            ))}
            <Button variant="outline" onClick={() => onOpenJob(job.id)}>
              Open service work
            </Button>
          </div>
        ))
      ) : (
        <p className="text-sm">
          Charge-only services. No tracked Job was created.
        </p>
      )}
    </div>
  )
}
