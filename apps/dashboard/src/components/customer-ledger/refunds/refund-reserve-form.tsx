"use client"
import { useCustomerLedgerCommand } from "@/hooks/use-customer-ledger-command"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { FormActions, SubmitButton, Switch } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { RefundCommandStatus } from "./refund-command-status"
import {
  type RefundRequestDetail,
  refundActions,
  reserveAckKey,
} from "./refund-model"

type ReservePayload = Omit<
  RouterInputs["customerLedger"]["reserveRefund"],
  "clientCommandId"
>

/**
 * Approve a requested refund and hold its amount. Holding stops the money
 * being used on an Order or returned twice; it doesn't send anything.
 */
export function RefundReserveForm({
  detail,
  actorUserId,
  tenantId,
  onRefresh,
  onBusyChange,
}: {
  detail: RefundRequestDetail
  actorUserId: string
  tenantId: string
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
  const reserve = useMutation(
    trpc.customerLedger.reserveRefund.mutationOptions(),
  )
  const [checkedKey, setCheckedKey] = useState<string | null>(null)
  const currentKey = reserveAckKey(detail)
  // Approval needs the server's canApprove and a destination it could read.
  const allowed = refundActions(detail).approve
  const verified = allowed && checkedKey === currentKey
  useEffect(() => {
    onBusyChange(command.pending)
    return () => onBusyChange(false)
  }, [command.pending, onBusyChange])
  const amount = formatFinanceMoney(detail.amountMinor, detail.currencyCode)

  async function approve() {
    // Re-read at press time: a refreshed request makes the check stale.
    if (!refundActions(detail).approve || reserveAckKey(detail) !== checkedKey)
      return
    const payload: ReservePayload = {
      bookId: detail.bookId,
      accountId: detail.accountId,
      expectedRevision: detail.accountRevision,
      requestId: detail.id,
      expectedVersion: detail.version,
      expectedDestinationFingerprint: detail.destinationFingerprint,
      identityReviewAttested: true,
    }
    await command.run("reserveRefund", payload, (clientCommandId) =>
      reserve.mutateAsync({ ...payload, clientCommandId }),
    )
  }

  return (
    <section className="grid gap-4">
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the switch is the label's child */}
      <label className="flex cursor-pointer items-start justify-between gap-4 border border-border px-3 py-2.5">
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">
            Customer and destination verified
          </span>
          <span className="text-xs text-muted-foreground">
            Checked against the original payer and payment. An account-name
            lookup alone doesn’t prove the account is theirs.
          </span>
        </span>
        <Switch
          checked={verified}
          disabled={!allowed || command.pending || command.saved}
          onCheckedChange={(checked) =>
            setCheckedKey(checked === true ? currentKey : null)
          }
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Approving checks that {amount} is still available, then holds it for
        this refund. It can’t be used on an Order while it’s held. No money is
        sent from here.
      </p>
      <RefundCommandStatus
        command={command}
        onRefresh={() => {
          setCheckedKey(null)
          onRefresh()
        }}
      />
      {command.saved ? null : (
        <FormActions>
          <SubmitButton
            type="button"
            isSubmitting={command.pending}
            disabled={!verified || !command.ready || command.pending}
            onClick={() => void approve()}
          >
            Approve and hold {amount}
          </SubmitButton>
        </FormActions>
      )}
    </section>
  )
}
