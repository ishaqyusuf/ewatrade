"use client"
import { useCustomerLedgerCommand } from "@/hooks/use-customer-ledger-command"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Button,
  ControlField,
  FormActions,
  SubmitButton,
  Textarea,
} from "@ewatrade/ui"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { RefundCommandStatus } from "./refund-command-status"
import { type RefundRequestDetail, refundActions } from "./refund-model"

type NeedDetailsPayload = Omit<
  RouterInputs["customerLedger"]["requestRefundDetails"],
  "clientCommandId"
>

const NOTE_MAX = 400

/**
 * Save "more details needed" on a requested refund. The note is kept on the
 * request for the team; it doesn't message the customer, hold or send money.
 * The saved state shown afterwards comes from the server.
 */
export function RefundDetailsRequestForm({
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
  const save = useMutation(
    trpc.customerLedger.requestRefundDetails.mutationOptions(),
  )
  const [note, setNote] = useState("")
  const [reviewing, setReviewing] = useState(false)
  useEffect(() => {
    onBusyChange(command.pending)
    return () => onBusyChange(false)
  }, [command.pending, onBusyChange])
  const allowed = refundActions(detail).askForDetails
  const trimmed = note.trim()

  async function confirm() {
    // Re-read at press time: only a requested refund at this version.
    if (!refundActions(detail).askForDetails || !trimmed) return
    const payload: NeedDetailsPayload = {
      bookId: detail.bookId,
      accountId: detail.accountId,
      expectedRevision: detail.accountRevision,
      requestId: detail.id,
      expectedVersion: detail.version,
      note: trimmed,
    }
    await command.run("requestRefundDetails", payload, (clientCommandId) =>
      save.mutateAsync({ ...payload, clientCommandId }),
    )
  }

  return (
    <section className="grid gap-4">
      <h3 className="text-base font-medium">Ask for more details</h3>
      {reviewing ? (
        <>
          <p className="whitespace-pre-wrap border border-border px-3 py-2 text-sm">
            {trimmed}
          </p>
          <p className="text-xs text-muted-foreground">
            Saves this note on the request. It doesn’t message{" "}
            {detail.customerName}, hold or send money. You can send them a
            message yourself afterwards.
          </p>
        </>
      ) : (
        <ControlField
          label="What’s needed"
          description={`${note.length} / ${NOTE_MAX} · seen by your team`}
        >
          <Textarea
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            disabled={command.pending}
            placeholder="For example: the account name doesn’t match the payer"
            onChange={(event) => setNote(event.target.value)}
          />
        </ControlField>
      )}
      <RefundCommandStatus command={command} onRefresh={onRefresh} />
      {command.saved ? null : (
        <FormActions>
          <Button
            variant="outline"
            disabled={command.pending}
            onClick={() => (reviewing ? setReviewing(false) : onBack())}
          >
            {reviewing ? "Edit note" : "Back"}
          </Button>
          {reviewing ? (
            <SubmitButton
              type="button"
              isSubmitting={command.pending}
              disabled={
                !allowed || !trimmed || !command.ready || command.pending
              }
              onClick={() => void confirm()}
            >
              Save request for details
            </SubmitButton>
          ) : (
            <Button
              disabled={!allowed || !trimmed}
              onClick={() => setReviewing(true)}
            >
              Review
            </Button>
          )}
        </FormActions>
      )}
    </section>
  )
}
