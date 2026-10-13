"use client"

import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button, Input, cn } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { orderMoney } from "../order-draft"
import { formatOrderTime } from "./order-overview-model"

type ChangeOptions = RouterOutputs["orders"]["changeOptions"]
type Approval = NonNullable<ChangeOptions["approvals"]["return"]>
type Pending = RouterOutputs["orders"]["pendingChangeApprovals"][number]
type Mode = "OFF" | "OPEN" | "APPROVAL_REQUIRED"

/** Keep checking while someone waits on a decision for this order. */
export function hasOpenOrderApproval(options: ChangeOptions | undefined) {
  if (!options) return false
  return (
    options.approvals.pending.length > 0 ||
    options.approvals.return?.status === "pending" ||
    options.approvals.refund?.status === "pending"
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
  onDone,
  extra,
}: {
  approvalId: string
  onDone: () => Promise<unknown> | unknown
  extra?: React.ReactNode
}) {
  const [note, setNote] = useState("")
  const decide = useDecide(onDone)
  return (
    <div className="grid gap-2">
      <Input
        aria-label="Note to the person who asked"
        maxLength={500}
        placeholder="Note (optional)"
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
          Not approve
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
  const mine = [options.approvals.return, options.approvals.refund].filter(
    (row): row is Approval => Boolean(row),
  )
  if (!options.approvals.pending.length && !mine.length) return null
  return (
    <div className="grid gap-3">
      {options.approvals.pending.map((approval) => (
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
          <DecideRow approvalId={approval.id} onDone={onDone} />
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
export function ChangeApprovalsCard({ timeZone }: { timeZone?: string }) {
  const trpc = useTRPC()
  const pending = useQuery(
    trpc.orders.pendingChangeApprovals.queryOptions(undefined, {
      refetchInterval: 30_000,
      retry: false,
    }),
  )
  const rows: Pending[] = pending.data ?? []
  if (!rows.length) return null
  return (
    <section
      aria-label="Approvals waiting"
      className="grid gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
    >
      <div>
        <h2 className="font-semibold">
          {rows.length} {rows.length === 1 ? "approval" : "approvals"} waiting
        </h2>
        <p className="text-sm text-muted-foreground">
          Returns and refunds your team asked for today. Once you approve, the
          person who asked records it before the end of the day.
        </p>
      </div>
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-2 rounded-lg border bg-card p-3">
            <p className="text-sm font-medium">
              {row.requestedBy ?? "A team member"} asks to {ACTION[row.kind]} ·{" "}
              {row.orderNumber}
              {row.customerName ? ` · ${row.customerName}` : ""}
            </p>
            <Facts
              approval={row}
              currencyCode={row.currencyCode}
              timeZone={timeZone}
            />
            <DecideRow
              approvalId={row.id}
              onDone={() => pending.refetch()}
              extra={
                <Link
                  href={`/sales/orders/${encodeURIComponent(row.orderId)}`}
                  className="inline-flex items-center px-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Open order
                </Link>
              }
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

const MODES: Array<{
  value: Mode
  label: string
  returns: string
  refunds: string
}> = [
  {
    value: "OPEN",
    label: "Open",
    returns: "Staff record returns; money back needs a manager.",
    refunds: "Owners, admins and managers give money back.",
  },
  {
    value: "APPROVAL_REQUIRED",
    label: "Needs approval",
    returns: "Staff and managers ask; an owner or admin approves.",
    refunds: "Managers and staff ask; an owner or admin approves.",
  },
  {
    value: "OFF",
    label: "Off",
    returns: "No returns at this store.",
    refunds: "No money goes back, from refunds or returns.",
  },
]

function ModeGroup({
  name,
  label,
  value,
  disabled,
  onChange,
}: {
  name: "returns" | "refunds"
  label: string
  value: Mode
  disabled: boolean
  onChange: (mode: Mode) => void
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {MODES.map((mode) => (
        <label
          key={mode.value}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
            value === mode.value && "border-primary bg-primary/5",
            disabled && "cursor-not-allowed opacity-70",
          )}
        >
          <input
            type="radio"
            name={name}
            className="mt-1 accent-[var(--primary)]"
            checked={value === mode.value}
            disabled={disabled}
            onChange={() => onChange(mode.value)}
          />
          <span className="grid">
            <span className="text-sm font-medium">{mode.label}</span>
            <span className="text-sm text-muted-foreground">{mode[name]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/** Owner/Admin: how the selected Store handles returns and refunds. */
export function ReturnRefundPolicyForm() {
  const trpc = useTRPC()
  const client = useQueryClient()
  const policy = useQuery(
    trpc.orders.changePolicy.queryOptions(undefined, { retry: false }),
  )
  const [draft, setDraft] = useState<{
    returnsMode: Mode
    refundsMode: Mode
  } | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (policy.data)
      setDraft({
        refundsMode: policy.data.refundsMode,
        returnsMode: policy.data.returnsMode,
      })
  }, [policy.data])
  const save = useMutation(
    trpc.orders.updateChangePolicy.mutationOptions({
      onSuccess: async () => {
        setSaved(true)
        await Promise.allSettled([
          client.invalidateQueries({
            queryKey: trpc.orders.changePolicy.queryKey(),
          }),
          client.invalidateQueries({
            queryKey: trpc.orders.changeOptions.pathKey(),
          }),
        ])
      },
    }),
  )
  if (policy.isPending) return <p>Loading…</p>
  if (policy.isError)
    return (
      <p role="alert" className="text-destructive">
        {policy.error.message}
      </p>
    )
  if (!draft) return null
  const dirty =
    draft.returnsMode !== policy.data.returnsMode ||
    draft.refundsMode !== policy.data.refundsMode
  const disabled = !policy.data.canEdit || save.isPending
  const change = (patch: Partial<typeof draft>) => {
    setSaved(false)
    setDraft({ ...draft, ...patch })
  }
  return (
    <div className="grid max-w-2xl gap-6">
      <p className="text-sm text-muted-foreground">
        For {policy.data.storeName ?? "this store"}. Owners and admins never
        need approval. Requests show on Home and on the order; an approval lasts
        until the end of the day and only the person who asked can use it. A
        return that gives money back also follows the Refunds setting.
      </p>
      <ModeGroup
        name="returns"
        label="Returns"
        value={draft.returnsMode}
        disabled={disabled}
        onChange={(returnsMode) => change({ returnsMode })}
      />
      <ModeGroup
        name="refunds"
        label="Refunds"
        value={draft.refundsMode}
        disabled={disabled}
        onChange={(refundsMode) => change({ refundsMode })}
      />
      {save.isError ? (
        <p role="alert" className="text-destructive">
          {save.error.message}
        </p>
      ) : saved && !dirty ? (
        <output className="block text-sm text-emerald-700 dark:text-emerald-300">
          Saved. New returns and refunds at this store follow these settings.
        </output>
      ) : null}
      <div>
        <Button
          disabled={disabled || !dirty}
          onClick={() => save.mutate(draft)}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}
