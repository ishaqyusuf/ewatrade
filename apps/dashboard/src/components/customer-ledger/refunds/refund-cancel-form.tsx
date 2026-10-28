"use client"
import { useCustomerLedgerCommand } from "@/hooks/use-customer-ledger-command"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { Button, FormActions, SubmitButton } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation } from "@tanstack/react-query"
import { useEffect } from "react"
import { RefundCommandStatus } from "./refund-command-status"
import { type RefundRequestDetail, refundActions } from "./refund-model"

type CancelPayload = Omit<
  RouterInputs["customerLedger"]["cancelRefund"],
  "clientCommandId"
>

/**
 * Close an unfinished request after reviewing it. A held amount becomes
 * usable again; nothing was or will be sent.
 */
export function RefundCancelForm({
  detail,
  actorUserId,
  tenantId,
  onBack,
  onRefresh,
  onBusyChange,
}: {
  detail: RefundRequestDetail
  actorUserId: string
  tenantId: string
  onBack: () => void
  onRefresh: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const trpc = useTRPC()
  const command = useCustomerLedgerCommand({
    actorUserId,
    tenantId,
    bookId: detail.bookId,
    accountId: detail.accountId,
  })
  const cancel = useMutation(trpc.customerLedger.cancelRefund.mutationOptions())
  useEffect(() => {
    onBusyChange(command.pending)
    return () => onBusyChange(false)
  }, [command.pending, onBusyChange])
  const amount = formatFinanceMoney(detail.amountMinor, detail.currencyCode)
  const held = detail.status === "RESERVED"

  const allowed = refundActions(detail).cancel
  async function confirm() {
    // The server's canCancel for this exact version, re-read at press time.
    if (!refundActions(detail).cancel) return
    const payload: CancelPayload = {
      bookId: detail.bookId,
      accountId: detail.accountId,
      expectedRevision: detail.accountRevision,
      requestId: detail.id,
      expectedVersion: detail.version,
    }
    await command.run("cancelRefund", payload, (clientCommandId) =>
      cancel.mutateAsync({ ...payload, clientCommandId }),
    )
  }

  return (
    <section className="grid gap-4">
      <h3 className="text-base font-medium">Cancel this refund request?</h3>
      <p className="text-sm">
        {held
          ? `This releases the ${amount} held for this refund.`
          : "This request holds no money, so nothing is released."}{" "}
        No money is sent. If you already sent it, go back and record the return
        instead.
      </p>
      <RefundCommandStatus command={command} onRefresh={onRefresh} />
      {command.saved ? null : (
        <FormActions>
          <Button variant="outline" disabled={command.pending} onClick={onBack}>
            Keep request
          </Button>
          <SubmitButton
            type="button"
            variant="destructive"
            isSubmitting={command.pending}
            disabled={!allowed || !command.ready || command.pending}
            onClick={() => void confirm()}
          >
            Cancel request
          </SubmitButton>
        </FormActions>
      )}
    </section>
  )
}
