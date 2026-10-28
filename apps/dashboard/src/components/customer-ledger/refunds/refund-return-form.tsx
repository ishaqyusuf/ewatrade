"use client"
import { useCustomerLedgerCommand } from "@/hooks/use-customer-ledger-command"
import { eligibleLedgerMoneyAccounts } from "@/lib/customer-ledger/command-input"
import { useTRPC } from "@/trpc/client"
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import {
  Alert,
  AlertDescription,
  Button,
  ControlField,
  DatePicker,
  FieldGroup,
  FormActions,
  Input,
  SelectControl,
  SubmitButton,
  Switch,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { RefundCommandStatus } from "./refund-command-status"
import {
  type RefundRequestDetail,
  localDay,
  maskedAccountNumber,
  refundActions,
  refundBankLabel,
  returnAckKey,
  returnEffectiveAt,
} from "./refund-model"

type CompletePayload = Omit<
  RouterInputs["customerLedger"]["completeRefund"],
  "clientCommandId"
>

/**
 * Record a held refund the business has already sent from its own bank.
 * This posts the canonical return on the customer's statement; it never
 * starts a transfer.
 */
export function RefundReturnForm({
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
  const complete = useMutation(
    trpc.customerLedger.completeRefund.mutationOptions(),
  )
  const money = useQuery(
    trpc.finance.balances.queryOptions(
      { bookId: detail.bookId },
      { retry: false },
    ),
  )
  // Only a successful current read counts: while loading, or after a failed
  // refetch that left older accounts cached, nothing can be picked or recorded.
  const moneyReady = money.status === "success"
  const banks = moneyReady
    ? eligibleLedgerMoneyAccounts(money.data?.accounts ?? [], "BANK_TRANSFER")
    : []
  // Fixed for this form so a retry sends exactly the same moment.
  const [openedAt] = useState(() => new Date())
  const [chosenAccount, setChosenAccount] = useState("")
  const moneyAccountId = banks.some((account) => account.id === chosenAccount)
    ? chosenAccount
    : banks.length === 1
      ? (banks[0]?.id ?? "")
      : ""
  const [day, setDay] = useState(() => localDay(openedAt))
  const [reference, setReference] = useState("")
  const [checkedKey, setCheckedKey] = useState<string | null>(null)
  const when = returnEffectiveAt(day, {
    openedAt,
    approvedAt: detail.approvedAt,
  })
  const currentKey =
    "at" in when
      ? returnAckKey(detail, { moneyAccountId, day, reference })
      : null
  // Recording needs a reserved request whose destination the server could read.
  const allowed = refundActions(detail).recordReturn
  const destination = detail.destination
  const sent =
    allowed && moneyReady && currentKey !== null && checkedKey === currentKey
  useEffect(() => {
    onBusyChange(command.pending)
    return () => onBusyChange(false)
  }, [command.pending, onBusyChange])
  const amount = formatFinanceMoney(detail.amountMinor, detail.currencyCode)

  async function record() {
    // Re-read at press time: the request, accounts or fields may have changed.
    if (
      !refundActions(detail).recordReturn ||
      !moneyReady ||
      !("at" in when) ||
      !sent
    )
      return
    const payload: CompletePayload = {
      bookId: detail.bookId,
      accountId: detail.accountId,
      expectedRevision: detail.accountRevision,
      requestId: detail.id,
      expectedVersion: detail.version,
      moneyAccountId,
      outgoingReference: reference.trim(),
      effectiveAt: when.at,
    }
    await command.run("completeRefund", payload, (clientCommandId) =>
      complete.mutateAsync({ ...payload, clientCommandId }),
    )
  }

  return (
    <section className="grid gap-4">
      <h3 className="text-base font-medium">Record money returned</h3>
      <FieldGroup>
        {money.isError ? (
          <Alert appearance="dashboard" variant="destructive">
            <AlertDescription>
              Money accounts couldn’t load. {money.error.message}
            </AlertDescription>
            <Button variant="outline" onClick={() => void money.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : (
          <ControlField
            label="Sent from"
            description={
              money.isPending
                ? "Loading bank accounts…"
                : banks.length
                  ? "The bank account the money left."
                  : "No bank account in Finance takes bank transfers. Add one in Finance → Money accounts."
            }
          >
            <SelectControl
              aria-label="Sent from"
              value={moneyAccountId}
              disabled={command.pending || !banks.length}
              placeholder="Choose a bank account"
              onValueChange={setChosenAccount}
              options={banks.map((account) => ({
                value: account.id,
                label: account.name,
              }))}
            />
          </ControlField>
        )}
        <ControlField
          label="Date sent"
          error={"problem" in when ? when.problem : undefined}
        >
          <DatePicker
            value={day}
            min={detail.approvedAt ? localDay(detail.approvedAt) : undefined}
            max={localDay(openedAt)}
            placeholder="Choose a date"
            onValueChange={setDay}
          />
        </ControlField>
        <ControlField
          label="Outgoing bank reference"
          description="From your bank app or transfer receipt."
        >
          <Input
            value={reference}
            maxLength={160}
            disabled={command.pending}
            placeholder="Reference from your bank"
            onChange={(event) => setReference(event.target.value)}
          />
        </ControlField>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the switch is the label's child */}
        <label className="flex cursor-pointer items-start justify-between gap-4 border border-border px-3 py-2.5">
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">
              I already sent {amount} to{" "}
              {destination
                ? `${refundBankLabel(destination)} · ${maskedAccountNumber(destination.accountNumber)}`
                : "the saved account"}
            </span>
            <span className="text-xs text-muted-foreground">
              This records money already returned. It doesn’t send a bank
              transfer.
            </span>
          </span>
          <Switch
            checked={sent}
            disabled={
              !allowed ||
              currentKey === null ||
              command.pending ||
              command.saved
            }
            onCheckedChange={(checked) =>
              setCheckedKey(checked === true ? currentKey : null)
            }
          />
        </label>
      </FieldGroup>
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
            disabled={!sent || !command.ready || command.pending}
            onClick={() => void record()}
          >
            Record {amount} returned
          </SubmitButton>
        </FormActions>
      )}
    </section>
  )
}
