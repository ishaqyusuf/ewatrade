"use client"
import { CustomerLedgerContent } from "@/components/customer-ledger/customer-ledger-content"
import { customerLedgerTitles } from "@/components/customer-ledger/customer-ledger-sheet-header"
import {
  CustomerLedgerFormProvider,
  useCustomerLedgerForm,
} from "@/components/customer-ledger/forms/form-context"
import { useCustomerLedgerParams } from "@/hooks/use-customer-ledger-params"
import { Dialog, DialogContent, DialogTitle, Sheet } from "@ewatrade/ui"
import { SheetFrame } from "./sheet-frame"
export function CustomerLedgerSheet(props: {
  actorUserId: string
  tenantId: string
  customerId?: string
}) {
  const { ledgerAccount } = useCustomerLedgerParams()
  return (
    <CustomerLedgerFormProvider
      key={`${props.actorUserId}:${props.tenantId}:${ledgerAccount}`}
    >
      <LedgerSheet {...props} />
    </CustomerLedgerFormProvider>
  )
}
function LedgerSheet(props: {
  actorUserId: string
  tenantId: string
  customerId?: string
}) {
  const {
    ledgerAction,
    ledgerAccount,
    ledgerEntry,
    ledgerAllocation,
    close,
    backToEntry,
  } = useCustomerLedgerParams()
  const { locked } = useCustomerLedgerForm()
  // Undo is a view inside the entry's own sheet, not a sheet of its own.
  const undoView =
    (ledgerAction === "release" || ledgerAction === "reverse") &&
    Boolean(ledgerEntry)
  const content =
    ledgerAction && ledgerAccount ? (
      <CustomerLedgerContent
        key={`${ledgerAccount}:${ledgerAction}:${ledgerEntry}:${ledgerAllocation}`}
        {...props}
        accountId={ledgerAccount}
        mode={ledgerAction}
        entryId={ledgerEntry ?? undefined}
        allocationId={ledgerAllocation ?? undefined}
      />
    ) : null
  // A reminder or summary is a message to share, so it is a modal; records
  // (payments, starting balance, entries) stay in the right sheet.
  if (ledgerAction === "remind" || ledgerAction === "summary")
    return (
      <Dialog
        open={Boolean(ledgerAccount)}
        onOpenChange={(open) => {
          if (!open) void close()
        }}
      >
        {ledgerAccount ? (
          <DialogContent className="grid max-w-lg gap-5 p-6 max-md:content-start">
            <DialogTitle className="pr-8 text-lg font-semibold">
              {customerLedgerTitles[ledgerAction]}
            </DialogTitle>
            {content}
          </DialogContent>
        ) : null}
      </Dialog>
    )
  return (
    <Sheet
      open={Boolean(ledgerAction && ledgerAccount)}
      onOpenChange={(open, details) => {
        if (!open) {
          if (locked) {
            details.cancel()
            return
          }
          void close()
        }
      }}
    >
      {ledgerAction && ledgerAccount ? (
        <SheetFrame
          title={customerLedgerTitles[ledgerAction]}
          closeDisabled={locked}
          back={
            undoView
              ? {
                  label: "Back to entry",
                  onClick: () => {
                    if (!locked) void backToEntry()
                  },
                }
              : undefined
          }
        >
          {content}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
