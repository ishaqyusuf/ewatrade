"use client"

import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button, Input, cn } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRef, useState } from "react"
import { orderMoney } from "../order-draft"
import { formatOrderTime } from "./order-overview-model"

type ChangeOptions = RouterOutputs["orders"]["changeOptions"]
type Approval = NonNullable<ChangeOptions["approvals"]["return"]>
type Pending = RouterOutputs["orders"]["pendingChangeApprovals"][number]

/**
 * Keep checking while a request is waiting, or approved but not yet recorded
 * (it may be used from another device or lapse at midnight).
 */
export function hasOpenOrderApproval(options: ChangeOptions | undefined) {
  if (!options) return false
  return (
    (options.approvals?.pending.length ?? 0) > 0 ||
    ["pending", "approved"].includes(options.approvals?.return?.status ?? "") ||
    ["pending", "approved"].includes(options.approvals?.refund?.status ?? "")
  )
}

const ACTION = { return: "return items", refund: "give a refund" } as const

function Banner({
  tone,
  title,
  children,
  testId,
}: {
  tone: "amber" | "sky" | "mint" | "rose"
  title: string
  children: React.ReactNode
  testId?: string
}) {
  return (
    <section
      data-testid={testId}
      className={cn(
        "grid gap-3 rounded-xl border p-4 text-sm",
        tone === "amber" && "border-amber-500/30 bg-amber-500/5",
        tone === "sky" && "border-sky-500/30 bg-sky-500/5",
        tone === "mint" && "border-emerald-500/30 bg-emerald-500/5",
        tone === "rose" && "border-red-500/30 bg-red-500/5",
      )}
    >
      <p className="font-medium">{title}</p>
      {children}
    </section>
  )
}

function Facts({
  approval,
  currencyCode,
  timeZone,
}: {
  approval: Pick<
    Approval,
    "summary" | "reason" | "amountMinor" | "requestedBy" | "requestedAt"
  >
  currencyCode: string
  timeZone?: string
}) {
  return (
    <div className="grid gap-1 text-muted-foreground">
      <p className="text-foreground">{approval.summary}</p>
      <p>
        Reason: {approval.reason}
        {approval.amountMinor > 0
          ? ` · ${orderMoney(approval.amountMinor, currencyCode)}`
          : ""}
      </p>
      <p>
        Asked by {approval.requestedBy ?? "a team member"} at{" "}
        {formatOrderTime(approval.requestedAt, timeZone)}
      </p>
    </div>
  )
}

function useDecide(onDone: () => Promise<unknown> | unknown) {
  const trpc = useTRPC()
  const client = useQueryClient()
  return useMutation(
    trpc.orders.decideChangeApproval.mutationOptions({
      onSuccess: async () => {
        await Promise.allSettled([
          onDone(),
          client.invalidateQueries({
            queryKey: trpc.orders.pendingChangeApprovals.queryKey(),
          }),
        ])
      },
    }),
  )
}

function DecideRow({
  approvalId,
  requestedBy,
  onDone,
  extra,
}: {
  approvalId: string
  requestedBy?: string | null
  onDone: () => Promise<unknown> | unknown
  extra?: React.ReactNode
}) {
  const [note, setNote] = useState("")
  const decide = useDecide(onDone)
  const firstName = requestedBy?.split(/\s+/)[0]
  return (
    <div className="grid gap-2">
      <Input
        aria-label={`Note to ${requestedBy ?? "the person who asked"}`}
        maxLength={500}
        placeholder={
          firstName ? `Note to ${firstName} (optional)` : "Note (optional)"
        }
        value={note}
        disabled={decide.isPending}
        onChange={(event) => setNote(event.target.value)}
      />
      {decide.isError ? (
        <p role="alert" className="text-destructive">
          {decide.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={decide.isPending}
          onClick={() =>
            decide.mutate({
              approvalId,
              decision: "approve",
              note: note.trim() || undefined,
            })
          }
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={decide.isPending}
          onClick={() =>
            decide.mutate({
              approvalId,
              decision: "reject",
              note: note.trim() || undefined,
            })
          }
        >
          Decline
        </Button>
        {extra}
      </div>
    </div>
  )
}

function MineBanner({
  approval,
  currencyCode,
  timeZone,
  onDone,
  onAskAgain,
}: {
  approval: Approval
  currencyCode: string
  timeZone?: string
  onDone: () => Promise<unknown>
  onAskAgain: (kind: Approval["kind"]) => void
}) {
  const trpc = useTRPC()
  const [reference, setReference] = useState("")
  const operationId = useRef(`approved-${crypto.randomUUID()}`).current
  const record = useMutation(
    trpc.orders.recordApprovedChange.mutationOptions({ onSuccess: onDone }),
  )
  const withdraw = useMutation(
    trpc.orders.withdrawChangeApproval.mutationOptions({ onSuccess: onDone }),
  )
  const error = record.error?.message ?? withdraw.error?.message ?? null
  const facts = (
    <Facts
      approval={approval}
      currencyCode={currencyCode}
      timeZone={timeZone}
    />
  )
  if (approval.status === "approved")
    return (
      <Banner
        tone="mint"
        title={`Approved by ${approval.decidedBy ?? "an owner"} · record it before the end of today`}
        testId="order-approval-approved"
      >
        {approval.decisionNote ? <p>“{approval.decisionNote}”</p> : null}
        {facts}
        {approval.amountMinor > 0 ? (
          <Input
            aria-label="Reference"
            maxLength={160}
            placeholder="Reference (optional)"
            value={reference}
            disabled={record.isPending}
            onChange={(event) => setReference(event.target.value)}
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        <div>
          <Button
            size="sm"
            disabled={record.isPending}
            onClick={() =>
              record.mutate({
                approvalId: approval.id,
                clientOperationId: operationId,
                reference: reference.trim() || undefined,
              })
            }
          >
            {record.isPending
              ? "Saving…"
              : approval.kind === "return"
                ? "Record return"
                : "Record refund"}
          </Button>
        </div>
      </Banner>
    )
  if (approval.status === "rejected")
    return (
      <Banner
        tone="rose"
        title={`Not approved by ${approval.decidedBy ?? "an owner"}`}
      >
        {approval.decisionNote ? <p>“{approval.decisionNote}”</p> : null}
        {facts}
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAskAgain(approval.kind)}
          >
            Ask again
          </Button>
        </div>
      </Banner>
    )
  return (
    <Banner
      tone="sky"
      title="Waiting for an owner or admin"
      testId="order-approval-waiting"
    >
      {facts}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={withdraw.isPending}
          onClick={() => withdraw.mutate({ approvalId: approval.id })}
        >
          Withdraw request
        </Button>
      </div>
    </Banner>
  )
}

/**
 * Return/refund requests on this order: approvers decide each waiting one;
 * the person who asked sees theirs (waiting, approved → record, or not).
 */
export function OrderApprovalBanners({
  options,
  currencyCode,
  timeZone,
  onDone,
  onAskAgain,
}: {
  options: ChangeOptions | undefined
  currencyCode: string
  timeZone?: string
  onDone: () => Promise<unknown>
  onAskAgain: (kind: Approval["kind"]) => void
}) {
  if (!options) return null
  const mine = [options.approvals?.return, options.approvals?.refund].filter(
    (row): row is Approval => Boolean(row),
  )
  if (!options.approvals?.pending.length && !mine.length) return null
  return (
    <div className="grid gap-3">
      {(options.approvals?.pending ?? []).map((approval) => (
        <Banner
          key={approval.id}
          tone="amber"
          title={`${approval.requestedBy ?? "A team member"} asks to ${ACTION[approval.kind]}`}
          testId="order-approval-review"
        >
          <Facts
            approval={approval}
            currencyCode={currencyCode}
            timeZone={timeZone}
          />
          <DecideRow
            approvalId={approval.id}
            requestedBy={approval.requestedBy}
            onDone={onDone}
          />
        </Banner>
      ))}
      {mine.map((approval) => (
        <MineBanner
          key={approval.id}
          approval={approval}
          currencyCode={currencyCode}
          timeZone={timeZone}
          onDone={onDone}
          onAskAgain={onAskAgain}
        />
      ))}
    </div>
  )
}

/** Home: requests waiting for this Owner/Admin in the selected Store. */
export function usePendingChangeApprovals() {
  const trpc = useTRPC()
  return useQuery(
    trpc.orders.pendingChangeApprovals.queryOptions(undefined, {
      refetchInterval: 30_000,
      retry: false,
    }),
  )
}

/** One row per request, inside the Overview's Needs you card. */
export function ChangeApprovalRows({
  rows,
  timeZone,
  onDone,
}: {
  rows: Pending[]
  timeZone?: string
  onDone: () => Promise<unknown>
}) {
  return (
    <ul className="grid border-t border-border">
      {rows.map((row) => (
        <li
          key={row.id}
          className="grid gap-x-5 gap-y-2.5 border-b border-border py-3.5 text-sm last:border-b-0 last:pb-0.5 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start"
        >
          <div className="min-w-0">
            <p className="font-semibold">
              {row.kind === "refund" ? "Refund" : "Return"}
              {row.amountMinor > 0
                ? ` ${orderMoney(row.amountMinor, row.currencyCode)}`
                : ""}{" "}
              · {row.orderNumber}
            </p>
            <p className="text-muted-foreground">
              {row.summary}
              {row.reason ? ` · ${row.reason}` : ""}
            </p>
            <p className="text-muted-foreground">
              {row.requestedBy ?? "A team member"} ·{" "}
              {formatOrderTime(row.requestedAt, timeZone)}
              {row.customerName ? ` · ${row.customerName}` : ""}
            </p>
          </div>
          <DecideRow
            approvalId={row.id}
            requestedBy={row.requestedBy}
            onDone={onDone}
            extra={
              <Link
                href={`/sales/orders/${encodeURIComponent(row.orderId)}`}
                className="inline-flex items-center px-2 text-sm text-muted-foreground hover:text-foreground"
              >
                View order
              </Link>
            }
          />
        </li>
      ))}
    </ul>
  )
}
