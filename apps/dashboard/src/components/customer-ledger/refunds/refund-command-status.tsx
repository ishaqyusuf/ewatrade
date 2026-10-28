"use client"
import type { useCustomerLedgerCommand } from "@/hooks/use-customer-ledger-command"
import { Alert, AlertDescription, Button } from "@ewatrade/ui"

type LedgerCommand = ReturnType<typeof useCustomerLedgerCommand>

/**
 * The customer account's saved-submission state, the same recovery the
 * statement forms use: an uncertain earlier write is checked before anything
 * new is sent, and only the server's answer counts as saved.
 */
export function RefundCommandStatus({
  command,
  onRefresh,
}: {
  command: LedgerCommand
  onRefresh: () => void
}) {
  return (
    <>
      {command.retained ? (
        <Alert appearance="dashboard">
          <AlertDescription>
            We couldn’t confirm whether the last change to this customer’s money
            was saved. Check first. If you try again, use exactly the same
            details; they aren’t kept on this device.
          </AlertDescription>
          <Button
            variant="outline"
            disabled={command.pending}
            onClick={() => void command.acknowledge()}
          >
            Check if it was saved
          </Button>
        </Alert>
      ) : null}
      {command.error ? (
        <Alert appearance="dashboard" variant="destructive">
          <AlertDescription>{command.error}</AlertDescription>
          <Button
            variant="outline"
            disabled={command.pending}
            onClick={onRefresh}
          >
            Refresh and review again
          </Button>
        </Alert>
      ) : null}
      {command.notice ? (
        <output aria-live="polite" className="text-sm">
          {command.notice}
        </output>
      ) : null}
    </>
  )
}
