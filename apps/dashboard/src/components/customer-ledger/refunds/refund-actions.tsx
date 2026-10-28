"use client"
import { CustomerMessageEditor } from "@/components/business-banking/customer-message-editor"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useState } from "react"
import { RefundCancelForm } from "./refund-cancel-form"
import { RefundDetailsRequestForm } from "./refund-details-request-form"
import { type RefundRequestDetail, refundActions } from "./refund-model"
import { RefundReserveForm } from "./refund-reserve-form"
import { RefundReturnForm } from "./refund-return-form"

/**
 * What can happen next to one refund request, decided only by the server's
 * status and flags (see refundActions). Approving, asking for details,
 * recording money already sent and cancelling stay separate, each with its
 * own review before anything is saved.
 */
export function RefundActions({
  detail,
  actorUserId,
  tenantId,
  refreshing,
  busy,
  onRefresh,
  onBusyChange,
}: {
  detail: RefundRequestDetail
  actorUserId: string
  tenantId: string
  refreshing: boolean
  /** A change is being saved: keep this exact review in place. */
  busy: boolean
  onRefresh: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [view, setView] = useState<"main" | "cancel" | "details">("main")
  const allowed = refundActions(detail)
  const amount = formatFinanceMoney(detail.amountMinor, detail.currencyCode)
  const shared = { detail, actorUserId, tenantId, onRefresh, onBusyChange }

  if (allowed.status === null)
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertDescription>
          This refund is in a state this screen doesn’t recognise (
          {detail.status}
          ). Nothing can be changed here. Refresh, or check with whoever manages
          your finance setup.
        </AlertDescription>
      </Alert>
    )
  if (allowed.status === "COMPLETED")
    return (
      <section className="grid gap-3">
        <h3 className="text-sm font-medium">Tell {detail.customerName}</h3>
        <CustomerMessageEditor
          initialText={`Hello ${detail.customerName}, your ${amount} refund has been sent.${detail.outgoingReference ? ` Reference: ${detail.outgoingReference}.` : ""}`}
          whatsappUrl={null}
          noPhoneNote="Enter their number for this message, or copy it."
        />
      </section>
    )
  if (allowed.status === "CANCELLED")
    return (
      <p className="text-sm text-muted-foreground">
        This request was cancelled. No return was recorded for this request.
      </p>
    )
  if (view === "cancel" && allowed.cancel)
    return <RefundCancelForm {...shared} onBack={() => setView("main")} />
  if (view === "details" && allowed.askForDetails)
    return (
      <RefundDetailsRequestForm {...shared} onBack={() => setView("main")} />
    )

  const unreadable = (
    <Alert appearance="dashboard" variant="destructive">
      <AlertDescription>
        {allowed.status === "RESERVED"
          ? "Recording the return is paused because the saved destination can’t be read, so it can’t be shown or checked."
          : "Approval is paused because the saved destination can’t be read, so it can’t be checked."}{" "}
        Try again later. You can still cancel the request.
      </AlertDescription>
    </Alert>
  )
  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          disabled={refreshing || busy}
          onClick={onRefresh}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {allowed.status === "REQUESTED" &&
      detail.reviewState === "NEEDS_DETAILS" &&
      detail.reviewNote ? (
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">
            Ask {detail.customerName} (optional)
          </h3>
          <CustomerMessageEditor
            initialText={`Hello ${detail.customerName}, before we can return your ${amount} we need: ${detail.reviewNote}`}
            whatsappUrl={null}
            noPhoneNote="Sending this is up to you. The saved note above doesn’t message them."
          />
        </section>
      ) : null}
      {allowed.status === "RESERVED" ? (
        <>
          <p className="border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm">
            Approved and held. No money has been sent from here. Send it from
            your bank, then record it below.
          </p>
          {allowed.recordReturn ? <RefundReturnForm {...shared} /> : unreadable}
        </>
      ) : allowed.approve ? (
        <RefundReserveForm {...shared} />
      ) : allowed.readable ? (
        <p className="text-sm text-muted-foreground">
          This request can’t be approved right now. Refresh to see its latest
          state.
        </p>
      ) : (
        unreadable
      )}
      {allowed.askForDetails || allowed.cancel ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          {allowed.askForDetails ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setView("details")}
            >
              Ask for more details
            </Button>
          ) : null}
          {allowed.cancel ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setView("cancel")}
            >
              Cancel request
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
