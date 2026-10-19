"use client"

import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { type ReactNode, useId } from "react"

type Original = RouterOutputs["serviceAssistantRequests"]["original"]
const statuses: Record<string, string> = {
  SUBMITTED: "Submitted",
  NEEDS_INFORMATION: "Needs information",
  QUOTED: "Quoted",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
  CONVERTED: "Converted to Order",
}
const channels: Record<string, string> = {
  WEB: "Web request form",
  STAFF: "Entered by staff",
  WHATSAPP: "WhatsApp",
}
const quoteStatuses: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  SUPERSEDED: "Superseded",
  REVOKED: "Revoked",
}
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/
const quantity = /^\d{1,32}(?:\.\d{1,6})?$/

function UtcTime({ value }: { value: string | null }) {
  return value && iso.test(value) ? (
    <time dateTime={value}>{value}</time>
  ) : (
    <>Not recorded</>
  )
}
function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{title}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  )
}
function total(minor: number, currency: string) {
  if (!Number.isSafeInteger(minor) || minor < 0 || !/^[A-Z]{3}$/.test(currency))
    return "Amount unavailable"
  try {
    return formatFinanceMoney(String(minor), currency)
  } catch {
    return "Amount unavailable"
  }
}
function renderable(r: Original) {
  return (
    Boolean(statuses[r.request.status]) &&
    Boolean(channels[r.request.channelOrigin]) &&
    r.lines.length <= 100 &&
    r.lines.every(
      (line) => quantity.test(line.quantity) && /[1-9]/.test(line.quantity),
    ) &&
    (r.currentQuote === null || Boolean(quoteStatuses[r.currentQuote.status]))
  )
}

/**
 * One exact saved Service Request. Saved request facts stay separate from the
 * current canonical quotation; nothing here replies, quotes or converts. The
 * sheet owner checks freshness, origin and current scope first.
 */
export function AssistantServiceRequestContent({
  record: r,
  checkedAt,
}: {
  record: Original
  checkedAt: number
}) {
  const customerId = useId()
  const detailsId = useId()
  const linesId = useId()
  const staffId = useId()
  const quoteId = useId()
  if (!renderable(r))
    return (
      <p role="alert">
        This saved Service Request is in an unsupported state. No customer, line
        or quotation facts are shown.
      </p>
    )
  const q = r.currentQuote
  return (
    <div className="grid gap-5 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{statuses[r.request.status]}</Badge>
        <Badge variant="outline">Saved request</Badge>
      </div>
      <section className="grid gap-3" aria-labelledby={customerId}>
        <h3 id={customerId} className="text-lg font-medium">
          Customer as submitted
        </h3>
        <dl className="grid grid-cols-2 gap-4">
          <Fact title="Name">{r.request.customer.name ?? "Not recorded"}</Fact>
          <Fact title="Phone">
            {r.request.customer.phone ?? "Not recorded"}
          </Fact>
          <Fact title="Email">
            {r.request.customer.email ?? "Not recorded"}
          </Fact>
          <Fact title="Came in via">{channels[r.request.channelOrigin]}</Fact>
          <Fact title="Contact opt-in (stored)">
            {r.request.contactOptIn ? "Yes" : "No"}
          </Fact>
          <Fact title="Consent version (stored)">
            {r.request.consentVersion ?? "None recorded"}
          </Fact>
        </dl>
        <p className="text-muted-foreground">
          Stored opt-in and consent are saved facts, not permission to send
          anything.
        </p>
      </section>
      <section className="grid gap-3" aria-labelledby={detailsId}>
        <h3 id={detailsId} className="font-medium">
          Request details
        </h3>
        <p className="whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-4">
          {r.request.details?.trim()
            ? r.request.details
            : "No details recorded"}
        </p>
        <dl className="grid grid-cols-2 gap-4">
          <Fact title="Form">{r.form.label}</Fact>
          <Fact title="Requested for (UTC)">
            {r.request.requestedAt ? (
              <UtcTime value={r.request.requestedAt} />
            ) : (
              "Not stated"
            )}
          </Fact>
          <Fact title="Received (UTC)">
            <UtcTime value={r.request.createdAt} />
          </Fact>
          <Fact title="Last updated (UTC)">
            <UtcTime value={r.request.updatedAt} />
          </Fact>
        </dl>
      </section>
      <section className="grid gap-3" aria-labelledby={linesId}>
        <h3 id={linesId} className="font-medium">
          Saved lines ({r.lines.length})
        </h3>
        <table className="w-full border-collapse text-left">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-2 font-normal">Offering</th>
              <th className="py-1.5 pr-2 font-normal">Options</th>
              <th className="py-1.5 text-right font-normal">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((line) => (
              <tr key={line.id} className="border-t align-top">
                <td className="py-1.5 pr-2">
                  {line.offeringName} · {line.variantName}
                  {line.details?.trim() ? (
                    <div className="whitespace-pre-wrap text-muted-foreground">
                      {line.details}
                    </div>
                  ) : null}
                </td>
                <td className="py-1.5 pr-2">
                  {line.optionSelections.length
                    ? line.optionSelections
                        .map((option) => `${option.group}: ${option.value}`)
                        .join(", ")
                    : "—"}
                </td>
                <td className="break-all py-1.5 text-right tabular-nums">
                  {line.quantity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-muted-foreground">
          Saved names, options and exact quantities — not current Catalog
          prices.
        </p>
      </section>
      <section className="grid gap-2" aria-labelledby={staffId}>
        <h3 id={staffId} className="font-medium">
          Staff response
        </h3>
        <p className="whitespace-pre-wrap break-words">
          {r.request.staffResponse?.trim()
            ? r.request.staffResponse
            : "No staff response recorded"}
        </p>
      </section>
      <section
        className="grid gap-3 rounded-lg border p-4"
        aria-labelledby={quoteId}
      >
        <h3
          id={quoteId}
          className="flex flex-wrap items-center gap-2 font-medium"
        >
          Current quotation
          {q ? (
            <Badge variant="outline">
              Current, separate from the saved request
            </Badge>
          ) : null}
        </h3>
        {q ? (
          <>
            <dl className="grid grid-cols-2 gap-4">
              <Fact title="Version">v{q.version}</Fact>
              <Fact title="Status">{quoteStatuses[q.status]}</Fact>
              <Fact title="Stored version total">
                {total(q.totalMinor, q.currencyCode)}
              </Fact>
              <Fact title="Expires (UTC)">
                {q.expiresAt ? (
                  <UtcTime value={q.expiresAt} />
                ) : (
                  "No expiry recorded"
                )}
              </Fact>
              <Fact title="Order">
                {q.acceptedOrderId
                  ? "Accepted into an Order"
                  : "No accepted Order"}
              </Fact>
            </dl>
            <p className="text-muted-foreground">
              The stored version total is not the selected offer, an amount
              payable, acceptance or payment proof, or permission to act.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            No canonical quotation exists for this request.
          </p>
        )}
      </section>
      <p className="border-t pt-4 text-muted-foreground">
        Checked at <UtcTime value={new Date(checkedAt).toISOString()} /> (UTC).
        This view changes no request, quotation or Order.
      </p>
    </div>
  )
}
