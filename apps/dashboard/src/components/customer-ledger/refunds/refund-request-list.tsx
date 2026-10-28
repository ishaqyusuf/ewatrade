"use client"
import { errorCode } from "@/components/business-banking/business-banking-model"
import { useTRPC } from "@/trpc/client"
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  SelectControl,
  cn,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { formatLedgerDate } from "../types"
import {
  REFUND_STATUSES,
  type RefundRequestRow,
  type RefundStatus,
  refundReviewLabel,
  refundStatus,
  refundStatusWords,
} from "./refund-model"

const FILTERS = [
  { value: "", label: "All requests" },
  ...REFUND_STATUSES.map((status) => ({
    value: status,
    label: refundStatusWords[status].label,
  })),
]

/**
 * Refund requests, oldest first, without destinations (the list never
 * carries bank details). One customer account when `accountId` is given;
 * `quiet` shows nothing until that account has a request (errors still show).
 */
export function RefundRequestList({
  accountId,
  status,
  selectedId,
  showCustomer,
  quiet = false,
  busy = false,
  onStatusChange,
  onOpen,
}: {
  accountId?: string
  status: RefundStatus | null
  selectedId: string | null
  showCustomer: boolean
  quiet?: boolean
  /** A refund change is saving: selection, filter and paging wait. */
  busy?: boolean
  onStatusChange: (status: RefundStatus | null) => void
  onOpen: (requestId: string) => void
}) {
  const trpc = useTRPC()
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const query = useQuery(
    trpc.customerLedger.refundRequests.queryOptions(
      {
        accountId,
        status: status ?? undefined,
        cursor: cursors.at(-1),
        limit: 20,
      },
      { retry: false },
    ),
  )
  const code = query.isError ? errorCode(query.error) : null
  if (
    quiet &&
    !query.isError &&
    !status &&
    cursors.length === 1 &&
    (query.isPending || query.data?.requests.length === 0)
  )
    return null
  return (
    <section className="grid gap-3">
      {quiet ? <h2 className="text-lg font-medium">Refund requests</h2> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SelectControl
          aria-label="Show"
          className="w-48"
          value={status ?? ""}
          disabled={busy}
          options={FILTERS}
          onValueChange={(value) => {
            setCursors([undefined])
            onStatusChange(refundStatus(value))
          }}
        />
        <Button
          variant="outline"
          disabled={query.isFetching || busy}
          onClick={() => void query.refetch()}
        >
          {query.isFetching && !query.isPending ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {query.isPending ? (
        <output aria-busy="true" className="text-sm text-muted-foreground">
          Loading refund requests…
        </output>
      ) : query.isError ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>
            {code === "FORBIDDEN"
              ? "Only owners and admins can manage customer refunds."
              : `Couldn’t load refund requests. ${query.error.message}`}
          </AlertDescription>
          {code === "FORBIDDEN" ? null : (
            <Button variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          )}
        </Alert>
      ) : query.data.requests.length === 0 ? (
        <p className="border border-dashed border-border p-4 text-sm text-muted-foreground">
          {status
            ? `No refund requests are ${refundStatusWords[status].label.toLowerCase()}.`
            : "No refund requests yet. Requests appear here when a customer asks for paid-ahead money back."}
        </p>
      ) : (
        <ul className="grid border border-border">
          {query.data.requests.map((request) => (
            <li
              key={request.id}
              className="border-t border-border first:border-t-0"
            >
              <RequestRow
                request={request}
                selected={request.id === selectedId}
                disabled={busy}
                showCustomer={showCustomer}
                onOpen={() => onOpen(request.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {query.isSuccess && (cursors.length > 1 || query.data.nextCursor) ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={cursors.length === 1 || query.isFetching || busy}
            onClick={() => setCursors((value) => value.slice(0, -1))}
          >
            Earlier
          </Button>
          <Button
            variant="outline"
            disabled={!query.data.nextCursor || query.isFetching || busy}
            onClick={() =>
              setCursors((value) => [
                ...value,
                query.data?.nextCursor ?? undefined,
              ])
            }
          >
            Later
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function RequestRow({
  request,
  selected,
  disabled,
  showCustomer,
  onOpen,
}: {
  request: RefundRequestRow
  selected: boolean
  disabled: boolean
  showCustomer: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      disabled={disabled}
      className={cn(
        "flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60",
        selected && "bg-muted/60",
      )}
      onClick={onOpen}
    >
      <span className="grid min-w-0 gap-0.5">
        <span className="font-medium">
          {showCustomer ? `${request.customerName} · ` : ""}
          <span className="tabular-nums">
            {formatFinanceMoney(request.amountMinor, request.currencyCode)}
          </span>
        </span>
        <span className="truncate text-muted-foreground">{request.reason}</span>
        <span className="text-xs text-muted-foreground">
          Requested {formatLedgerDate(request.createdAt)} ·{" "}
          {request.requestedByName}
        </span>
      </span>
      <Badge variant="outline" className="shrink-0">
        {refundReviewLabel(request)}
      </Badge>
    </button>
  )
}
