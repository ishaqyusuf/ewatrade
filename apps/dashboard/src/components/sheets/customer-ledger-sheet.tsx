"use client"
import { CustomerLedgerContent } from "@/components/customer-ledger/customer-ledger-content"
import { customerLedgerTitles } from "@/components/customer-ledger/customer-ledger-sheet-header"
import {
  CustomerLedgerFormProvider,
  useCustomerLedgerForm,
} from "@/components/customer-ledger/forms/form-context"
import { useCustomerLedgerParams } from "@/hooks/use-customer-ledger-params"
import { Sheet } from "@ewatrade/ui"
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
  const { ledgerAction, ledgerAccount, ledgerEntry, ledgerAllocation, close } =
    useCustomerLedgerParams()
  const { locked } = useCustomerLedgerForm()
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
          description="Business customer ledger · online financial records"
          closeDisabled={locked}
        >
          <CustomerLedgerContent
            key={`${ledgerAccount}:${ledgerAction}:${ledgerEntry}:${ledgerAllocation}`}
            {...props}
            accountId={ledgerAccount}
            mode={ledgerAction}
            entryId={ledgerEntry ?? undefined}
            allocationId={ledgerAllocation ?? undefined}
          />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
