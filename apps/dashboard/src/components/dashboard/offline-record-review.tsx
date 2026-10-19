"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { getDataCacheGeneration, useTRPC, useTRPCClient } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  canManageSalesOperations,
  canManageTenant,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@ewatrade/ui"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

type ReviewRow = RouterOutputs["offline"]["conflicts"][number]
type Decision = "approve" | "reject" | "retry" | "discard"
const labels: Record<Decision, string> = {
  approve: "apply",
  reject: "reject",
  retry: "retry",
  discard: "discard",
}

export function offlineReviewScope(
  context:
    | {
        actorUserId: string
        tenant: { id: string }
        membership: { id: string }
        activeStore: { id: string } | null
      }
    | undefined,
  storeId: string,
) {
  return context?.actorUserId && context.activeStore?.id === storeId
    ? JSON.stringify([
        context.actorUserId,
        context.tenant.id,
        context.membership.id,
        storeId,
      ])
    : null
}

/** Compare the exposed immutable facts, not just the selected database ID. */
export function offlineReviewFingerprint(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value))
    return `[${value.map(offlineReviewFingerprint).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${offlineReviewFingerprint(entry)}`,
      )
      .join(",")}}`
  return JSON.stringify(value) ?? "null"
}

export function offlineReviewActions(
  row: ReviewRow,
  role: string | undefined,
  actorId: string | undefined,
  storeId: string,
): Decision[] {
  const normalized = normalizeRole(role)
  if (!normalized || !canManageSalesOperations(normalized)) return []
  if (row.reviewKind === "suspended_recovery") {
    if (
      !canManageTenant(normalized) ||
      !actorId ||
      !row.actor?.id ||
      actorId === row.actor.id ||
      !row.recovery ||
      !row.recoveryEnvelope ||
      row.status !== "REVIEW_REQUIRED"
    )
      return []
    const actions: Decision[] = ["reject"]
    if (
      row.recoveryOrigin?.store?.id === storeId &&
      row.recoveryOrigin.store.status === "ACTIVE"
    )
      actions.unshift("approve")
    return actions.filter((decision) =>
      row.safeActions.some((action) => action === decision),
    )
  }
  if (row.recovery || row.recoveryEnvelope) return []
  if (
    row.reviewKind === "approval" &&
    row.status === "REVIEW_REQUIRED" &&
    row.conflictCode === null
  )
    return (["approve", "reject"] as const).filter((decision) =>
      row.safeActions.some((action) => action === decision),
    )
  if (
    row.reviewKind === "conflict" &&
    ["BLOCKED", "REVIEW_REQUIRED"].includes(row.status) &&
    row.conflictCode !== null
  )
    return (["retry", "discard"] as const).filter((decision) =>
      row.safeActions.some((action) => action === decision),
    )
  return []
}

export function offlineReviewOutcome(status: string) {
  if (status === "APPLIED" || status === "approved")
    return "Applied. The sale is recorded."
  if (status === "DISCARDED" || status === "rejected")
    return "Rejected or discarded. This offline record will not be applied."
  if (status === "PENDING")
    return "Ready for retry on the original device. The sale has not been recorded."
  if (["BLOCKED", "REVIEW_REQUIRED", "held"].includes(status))
    return "Still awaiting review. The sale has not been recorded; review the current conflict before deciding again."
  return "The current outcome is unavailable. Refresh its status before deciding again."
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
const text = (value: unknown) =>
  typeof value === "string" && value ? value : "Not recorded"

function RecordSummary({
  row,
  currencyCode,
  storeName,
}: { row: ReviewRow; currencyCode: string; storeName: string }) {
  const payload = object(row.recoveryEnvelope?.payload ?? row.payload)
  const payment = object(payload.initialPayment)
  const money = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
      ? formatMinorMoney(value, currencyCode)
      : "Not recorded"
  const lines = Array.isArray(payload.lines) ? payload.lines : []
  return (
    <div className="grid gap-3 text-sm">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 break-words">
        <dt className="text-muted-foreground">Record</dt>
        <dd>{row.clientCommandId}</dd>
        <dt className="text-muted-foreground">Staff</dt>
        <dd>
          {row.actor?.displayName ||
            row.actor?.name ||
            row.actor?.email ||
            "Unknown author"}
        </dd>
        <dt className="text-muted-foreground">Store</dt>
        <dd>{storeName}</dd>
        <dt className="text-muted-foreground">Phone time (claimed)</dt>
        <dd>{new Date(row.createdAtClient).toLocaleString()}</dd>
        <dt className="text-muted-foreground">Customer</dt>
        <dd>
          {text(payload.customerName)}
          {typeof payload.customerPhone === "string"
            ? ` · ${payload.customerPhone}`
            : ""}
        </dd>
        <dt className="text-muted-foreground">Payment</dt>
        <dd>
          {Object.keys(payment).length
            ? `${money(payment.amountMinor)} · ${text(payment.method)} · Account ${text(payment.moneyAccountId)}`
            : "No initial payment"}
        </dd>
        <dt className="text-muted-foreground">Fulfillment</dt>
        <dd>
          {payload.fulfillNow === true
            ? "Requested immediately"
            : "Not requested immediately"}
        </dd>
        <dt className="text-muted-foreground">Delivery due</dt>
        <dd>{text(payload.deliveryDueAt)}</dd>
        <dt className="text-muted-foreground">
          Discount / tax / service charge
        </dt>
        <dd>
          {[
            payload.discountMinor ?? 0,
            payload.taxMinor ?? 0,
            payload.serviceChargeMinor ?? 0,
          ]
            .map(money)
            .join(" / ")}
        </dd>
      </dl>
      <ul className="divide-y divide-border border-y border-border">
        {lines.map((value, index) => {
          const line = object(value)
          const custom = typeof line.custom === "string"
          const amount = custom
            ? line.amountMinor
            : (line.enteredTotalMinor ??
              line.approvedQuotePriceMinor ??
              line.expectedFixedPriceMinor)
          return (
            <li
              key={`${row.id}-line-${index}`}
              className="flex justify-between gap-4 py-2"
            >
              <span>
                {custom
                  ? text(line.description)
                  : `${text(line.quantity)} × Item ${text(line.offeringId)}`}
              </span>
              <span className="shrink-0 text-right">
                {money(amount)}
                <span className="block text-xs text-muted-foreground">
                  {custom || line.enteredTotalMinor !== undefined
                    ? "Line total"
                    : "Unit price"}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      {typeof payload.notes === "string" ? <p>{payload.notes}</p> : null}
      {row.conflictMessage ? (
        <FormFeedback appearance="dashboard">
          {row.conflictMessage}
        </FormFeedback>
      ) : null}
      {row.reviewKind === "suspended_recovery" ? (
        <p className="text-muted-foreground">
          This staff member's access changed. Only a different Owner or Admin
          can decide this exact saved record. Neither decision restores staff
          access.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Phone time is a claim. Catalog references remain references when item
        names are unavailable. Applying rechecks current stock, prices, accounts
        and permissions.
      </p>
    </div>
  )
}

type Selection = {
  row: ReviewRow
  fingerprint: string
  scope: string
  resource: number
}

export function OfflineRecordReview({
  store,
}: { store: { id: string; name: string; currencyCode: string } }) {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const cache = useQueryClient()
  const context = useQuery(
    trpc.tenant.current.queryOptions(undefined, { retry: false }),
  )
  const role = normalizeRole(context.data?.membership.role)
  const scope = offlineReviewScope(context.data, store.id)
  const canManage = Boolean(role && canManageSalesOperations(role) && scope)
  const records = useQuery(
    trpc.offline.conflicts.queryOptions(
      { storeId: store.id },
      { enabled: canManage, retry: false },
    ),
  )
  const generation = useRef(getDataCacheGeneration())
  const resource = useRef({ id: store.id, version: 0 })
  if (resource.current.id !== store.id)
    resource.current = { id: store.id, version: resource.current.version + 1 }
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const selected = useRef<Selection | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [decisionBlocked, setDecisionBlocked] = useState(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const active = (original: Selection) =>
    mounted.current &&
    selected.current === original &&
    resource.current.version === original.resource &&
    generation.current === getDataCacheGeneration()
  const close = () => {
    if (!inFlight.current) {
      selected.current = null
      setSelection(null)
    }
  }
  const choose = (row: ReviewRow) => {
    if (!scope || inFlight.current) return
    const next = {
      row: structuredClone(row),
      fingerprint: offlineReviewFingerprint(row),
      scope,
      resource: resource.current.version,
    }
    selected.current = next
    setSelection(next)
    setReason("")
    setDecisionBlocked(false)
    setError(null)
    setMessage(null)
  }
  const refresh = async (live: () => boolean) => {
    if (!live()) return
    await Promise.all([
      cache.invalidateQueries({
        queryKey: trpc.offline.conflicts.queryKey({ storeId: store.id }),
        refetchType: "none",
      }),
      cache.invalidateQueries(
        {
          queryKey: trpc.inventory.reconciliationReport.queryKey({
            storeId: store.id,
          }),
        },
        { throwOnError: true },
      ),
      cache.invalidateQueries(
        {
          queryKey: trpc.inventory.balanceReport.queryKey({
            includeCompatibleTotals: true,
            storeId: store.id,
          }),
        },
        { throwOnError: true },
      ),
      cache.invalidateQueries(
        {
          queryKey: trpc.orders.reportSummary.queryKey({ storeId: store.id }),
        },
        { throwOnError: true },
      ),
    ])
    if (live()) await records.refetch({ throwOnError: true })
  }
  async function refreshCurrentStore() {
    if (inFlight.current) return
    const originalResource = resource.current.version
    const live = () =>
      mounted.current &&
      resource.current.version === originalResource &&
      generation.current === getDataCacheGeneration()
    if (!live()) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const freshContext = await client.tenant.current.query()
      if (!live()) return
      if (offlineReviewScope(freshContext, store.id) !== scope) {
        setError(
          "Your business, Store or identity changed. Reopen Reports to refresh.",
        )
        return
      }
      await refresh(live)
    } catch {
      if (live())
        setError(
          "Could not refresh offline records and inventory. Try Refresh again.",
        )
    } finally {
      inFlight.current = false
      if (live()) setBusy(false)
    }
  }
  async function decide(decision: Decision) {
    const original = selection
    if (!original || !active(original) || inFlight.current || decisionBlocked)
      return
    if (
      reason.trim().length > 500 ||
      (original.row.reviewKind === "suspended_recovery" && !reason.trim())
    ) {
      setError("Add a decision reason of 1–500 characters.")
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    let dispatched = false
    try {
      const before = await client.tenant.current.query()
      if (!active(original)) return
      if (offlineReviewScope(before, store.id) !== original.scope)
        throw Error(
          "Your business, Store or identity changed. Close this record and refresh.",
        )
      const fresh = await client.offline.conflicts.query({ storeId: store.id })
      if (!active(original)) return
      const row = fresh.find((entry) => entry.id === original.row.id)
      if (!row || offlineReviewFingerprint(row) !== original.fingerprint)
        throw Error(
          "This record changed or was already reviewed. Close it and refresh before deciding.",
        )
      const after = await client.tenant.current.query()
      if (!active(original)) return
      if (
        offlineReviewScope(after, store.id) !== original.scope ||
        !offlineReviewActions(
          row,
          after.membership.role,
          after.actorUserId,
          store.id,
        ).includes(decision)
      )
        throw Error(
          "Your current access does not allow this decision. Close the record and refresh.",
        )
      dispatched = true
      const receipt =
        row.reviewKind === "suspended_recovery" &&
        row.recoveryEnvelope &&
        (decision === "approve" || decision === "reject")
          ? await client.offline.decideRecovery.mutate({
              commandId: row.id,
              decision,
              envelope: row.recoveryEnvelope,
              reason: reason.trim(),
            })
          : await client.offline.review.mutate({
              commandId: row.id,
              decision,
              reason: reason.trim() || undefined,
            })
      if (!active(original)) return
      setMessage(offlineReviewOutcome(receipt.status))
      selected.current = null
      setSelection(null)
      try {
        await refresh(
          () =>
            mounted.current &&
            resource.current.version === original.resource &&
            generation.current === getDataCacheGeneration(),
        )
      } catch {
        if (
          mounted.current &&
          resource.current.version === original.resource &&
          generation.current === getDataCacheGeneration()
        )
          setError(
            "The decision returned, but the lists did not refresh. Refresh to see the latest records.",
          )
      }
    } catch (failure) {
      if (active(original)) {
        setDecisionBlocked(true)
        setError(
          dispatched
            ? "Could not confirm this decision. Close the record and refresh its status before trying again."
            : failure instanceof Error
              ? failure.message
              : "Could not check this record. Refresh and try again.",
        )
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const actions = selection
    ? offlineReviewActions(
        selection.row,
        context.data?.membership.role,
        context.data?.actorUserId,
        store.id,
      )
    : []
  if (context.isPending)
    return (
      <p className="text-sm text-muted-foreground">
        Checking offline review access…
      </p>
    )
  if (context.isError || !scope)
    return (
      <p className="text-sm text-muted-foreground">
        Offline review is unavailable for the current Store. Refresh to check
        access.
      </p>
    )
  if (!canManage) return null
  return (
    <section
      className="grid gap-3 border-t border-border pt-5"
      aria-label="Offline record review"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium">
            Offline records to review
            {records.data ? ` · ${records.data.length}` : ""}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Only records received by the server for {store.name}. Records still
            saved only on a phone appear after that phone reconnects.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || records.isFetching}
          onClick={() => void refreshCurrentStore()}
        >
          Refresh
        </Button>
      </div>
      {message ? (
        <output aria-live="polite" className="text-sm">
          {message}
        </output>
      ) : null}
      {!selection && error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      {records.isPending ? (
        <p className="text-sm text-muted-foreground">Loading saved records…</p>
      ) : records.isError ? (
        <FormFeedback appearance="dashboard">
          Could not load offline records. Refresh to try again.
        </FormFeedback>
      ) : records.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No server records await review in this Store.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {records.data?.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm">
                  {row.actor?.displayName || row.actor?.name || "Staff member"}{" "}
                  · {row.clientCommandId}
                </p>
                <Badge variant="outline">
                  {row.reviewKind === "suspended_recovery"
                    ? "Held for Owner/Admin"
                    : row.reviewKind === "approval"
                      ? "Awaiting approval"
                      : "Conflict"}
                </Badge>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => choose(row)}
              >
                Review record
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={Boolean(selection && active(selection))}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent className="grid max-h-[85svh] max-w-xl gap-5 overflow-y-auto p-6 text-foreground max-md:content-start">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-lg font-semibold">
              Review saved offline record
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Review the exact saved facts, then confirm one decision. Awaiting
              review does not mean synced.
            </DialogDescription>
          </DialogHeader>
          {selection ? (
            <>
              <RecordSummary
                row={selection.row}
                currencyCode={store.currencyCode}
                storeName={store.name}
              />
              <label
                htmlFor={`offline-review-reason-${store.id}`}
                className="grid gap-2 text-sm"
              >
                Decision reason
                {selection.row.reviewKind === "suspended_recovery"
                  ? " (required)"
                  : " (optional)"}
                <Textarea
                  id={`offline-review-reason-${store.id}`}
                  maxLength={500}
                  value={reason}
                  disabled={busy}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              {error ? (
                <FormFeedback appearance="dashboard">{error}</FormFeedback>
              ) : null}
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Your current access or this record's origin does not permit a
                  decision here. Ask the Owner or Admin to review it.
                </p>
              ) : null}
              {selection.row.reviewKind === "conflict" ? (
                <p className="text-xs text-muted-foreground">
                  Retry queues the unchanged command for the original device; it
                  does not apply the sale here. Discard prevents that command
                  from applying.
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={close}
                >
                  Close
                </Button>
                {actions.map((decision) => (
                  <Button
                    key={decision}
                    type="button"
                    variant={
                      decision === "reject" || decision === "discard"
                        ? "outline"
                        : "default"
                    }
                    disabled={busy || decisionBlocked}
                    onClick={() => void decide(decision)}
                  >
                    {busy ? "Checking…" : `Confirm ${labels[decision]}`}
                  </Button>
                ))}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
