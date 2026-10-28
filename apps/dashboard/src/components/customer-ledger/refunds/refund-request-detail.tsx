"use client"
import { errorCode } from "@/components/business-banking/business-banking-model"
import { useTRPC } from "@/trpc/client"
import { Alert, AlertDescription, Badge, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { type ReactNode, useState } from "react"
import { formatLedgerDate } from "../types"
import { RefundActions } from "./refund-actions"
import {
  type RefundRequestDetail,
  maskedAccountNumber,
  refundBankLabel,
  refundReviewLabel,
} from "./refund-model"

// Only what this request itself holds. Whether the source money is still
// available is checked by the server when you approve, not assumed here.
const FUNDS_WORDS: Record<string, string> = {
  REQUESTED:
    "Nothing is held yet. Approving checks that the money is still available.",
  RESERVED: "Held for this refund. It can’t be used on an Order.",
  COMPLETED: "Returned and recorded on the customer’s statement.",
  CANCELLED: "This request no longer holds any money.",
}

/**
 * One refund request from the authorized detail read, the only place the
 * saved destination is shown. Actions follow the server status; each one is
 * reviewed against this exact version before it is sent.
 */
export function RefundRequestDetailView({
  requestId,
  actorUserId,
  tenantId,
  expectedAccountId,
  busy,
  onBusyChange,
}: {
  requestId: string
  actorUserId: string
  tenantId: string
  /** Opened from one customer's statement: refuse another customer's request. */
  expectedAccountId?: string
  busy: boolean
  onBusyChange: (busy: boolean) => void
}) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.customerLedger.refundRequestDetail.queryOptions(
      { requestId },
      { retry: false, staleTime: 0 },
    ),
  )
  if (query.isPending)
    return (
      <output aria-busy="true" className="text-sm text-muted-foreground">
        Loading refund…
      </output>
    )
  if (query.isError) {
    const code = errorCode(query.error)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          {code === "FORBIDDEN"
            ? "Only owners and admins can manage customer refunds."
            : code === "NOT_FOUND"
              ? "This refund request isn’t in this business."
              : `${query.error.message} Nothing can be approved or recorded until it loads.`}
        </AlertDescription>
        {code === "FORBIDDEN" || code === "NOT_FOUND" ? null : (
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        )}
      </Alert>
    )
  }
  const detail = query.data
  if (expectedAccountId && detail.accountId !== expectedAccountId)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          This refund request belongs to a different customer. Open it from
          their statement or from Finance → Refunds.
        </AlertDescription>
      </Alert>
    )
  return (
    <div className="grid gap-5">
      <RefundFacts detail={detail} />
      <RefundActions
        // A refreshed version or account revision starts a fresh review.
        key={`${detail.id}:${detail.version}:${detail.accountRevision}`}
        detail={detail}
        actorUserId={actorUserId}
        tenantId={tenantId}
        refreshing={query.isFetching}
        busy={busy}
        onRefresh={() => void query.refetch()}
        onBusyChange={onBusyChange}
      />
    </div>
  )
}

function RefundFacts({ detail }: { detail: RefundRequestDetail }) {
  const [revealed, setRevealed] = useState(false)
  const amount = formatFinanceMoney(detail.amountMinor, detail.currencyCode)
  const destination = detail.destination
  const statementHref = `/customers/${encodeURIComponent(detail.customerId)}/statement?${new URLSearchParams(
    {
      ledgerAccount: detail.accountId,
      ledgerAction: "entry",
      ledgerEntry: detail.creditEntryId,
    },
  )}`
  const when = (at: Date | string, by: string | null) =>
    `${formatLedgerDate(at, true)}${by ? ` · ${by}` : ""}`
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-2xl font-semibold tabular-nums">{amount}</b>
        <Badge variant="outline">{refundReviewLabel(detail)}</Badge>
      </div>
      {detail.reviewState === "NEEDS_DETAILS" ? (
        <div className="grid gap-1 border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
          <b className="font-medium">More details needed</b>
          <span className="whitespace-pre-wrap">
            {detail.reviewNote ?? "No note was saved."}
          </span>
          {detail.reviewedAt ? (
            <span className="text-xs text-muted-foreground">
              Asked {when(detail.reviewedAt, detail.reviewedByName)}. Nothing is
              held or sent.
            </span>
          ) : null}
        </div>
      ) : null}
      <Facts
        rows={[
          ["Customer", detail.customerName],
          [
            "From",
            <Link
              key="source"
              href={statementHref}
              className="underline-offset-4 hover:underline"
            >
              Paid-ahead payment on their statement
            </Link>,
          ],
          ["Reason", detail.reason],
          ...(destination
            ? ([
                [
                  "Send to",
                  <span
                    key="to"
                    className="inline-flex flex-wrap justify-end gap-2"
                  >
                    <span>
                      {refundBankLabel(destination)} ·{" "}
                      <span className="font-mono">
                        {revealed
                          ? destination.accountNumber
                          : maskedAccountNumber(destination.accountNumber)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-4"
                      aria-pressed={revealed}
                      onClick={() => setRevealed((value) => !value)}
                    >
                      {revealed ? "Hide number" : "Show number"}
                    </button>
                  </span>,
                ],
                ["Account holder", destination.accountName],
              ] as Array<[string, ReactNode]>)
            : ([
                [
                  "Send to",
                  <span key="to" className="text-destructive">
                    Can’t be read right now
                  </span>,
                ],
              ] as Array<[string, ReactNode]>)),
          ["Funds", FUNDS_WORDS[detail.status] ?? detail.status],
          ["Requested", when(detail.createdAt, detail.requestedByName)],
          ...(detail.approvedAt
            ? ([
                ["Approved", when(detail.approvedAt, detail.approvedByName)],
              ] as Array<[string, ReactNode]>)
            : []),
          ...(detail.completedAt
            ? ([
                ["Returned", when(detail.completedAt, detail.completedByName)],
                ["Outgoing reference", detail.outgoingReference ?? "—"],
              ] as Array<[string, ReactNode]>)
            : []),
          ...(detail.cancelledAt
            ? ([
                ["Cancelled", when(detail.cancelledAt, detail.cancelledByName)],
              ] as Array<[string, ReactNode]>)
            : []),
        ]}
      />
    </section>
  )
}

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid border border-border text-sm">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(7rem,35%)_minmax(0,1fr)] gap-3 border-t border-border px-3 py-2 first:border-t-0"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-right">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
