"use client"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { Sheet } from "@ewatrade/ui"
import { useState } from "react"
import { RefundRequestDetailView } from "./refund-request-detail"
import { RefundRequestEntry } from "./refund-request-entry"
import { RefundRequestForm } from "./refund-request-form"
import { RefundRequestList } from "./refund-request-list"
import { useRefundParams } from "./use-refund-params"

/**
 * Customer refund requests (MB-01): record a new request from a customer's
 * statement, then review, approve and hold, record money already returned,
 * or cancel. The open request lives in the URL; its sheet can't close while
 * a change is being saved.
 */
export function CustomerRefunds({
  actorUserId,
  tenantId,
  accountId,
}: {
  actorUserId: string
  tenantId: string
  /** One customer account (their statement); omit for every customer. */
  accountId?: string
}) {
  const {
    refundRequest,
    refundStatus,
    refundAction,
    setParams,
    open,
    startRequest,
    close,
  } = useRefundParams()
  const [busy, setBusy] = useState(false)
  // A new request needs a customer's account; there's no customer picker.
  const creating =
    refundAction === "new" && Boolean(accountId) && !refundRequest
  return (
    <>
      <RefundRequestEntry
        accountId={accountId}
        busy={busy}
        onStart={() => {
          if (!busy) void startRequest()
        }}
      />
      <RefundRequestList
        accountId={accountId}
        status={refundStatus}
        selectedId={refundRequest}
        showCustomer={!accountId}
        quiet={Boolean(accountId)}
        busy={busy}
        // A change being saved keeps its own request and review in place.
        onStatusChange={(status) => {
          if (!busy) void setParams({ refundStatus: status })
        }}
        onOpen={(id) => {
          if (!busy) void open(id)
        }}
      />
      <Sheet
        open={Boolean(refundRequest) || creating}
        onOpenChange={(next, details) => {
          if (next) return
          if (busy) {
            details.cancel()
            return
          }
          void close()
        }}
      >
        {creating && accountId ? (
          <SheetFrame
            title="New refund request"
            description="Customer funds"
            closeDisabled={busy}
          >
            <RefundRequestForm
              key={`${actorUserId}:${tenantId}:${accountId}`}
              accountId={accountId}
              actorUserId={actorUserId}
              tenantId={tenantId}
              onDone={() => void close()}
              onBusyChange={setBusy}
            />
          </SheetFrame>
        ) : refundRequest ? (
          <SheetFrame
            title="Refund request"
            description="Customer funds"
            closeDisabled={busy}
          >
            <RefundRequestDetailView
              key={`${actorUserId}:${tenantId}:${refundRequest}`}
              requestId={refundRequest}
              actorUserId={actorUserId}
              tenantId={tenantId}
              expectedAccountId={accountId}
              busy={busy}
              onBusyChange={setBusy}
            />
          </SheetFrame>
        ) : null}
      </Sheet>
    </>
  )
}
