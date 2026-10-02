import { CustomerLedgerActionScreen } from "@/components/mobile/customer-ledger/customer-ledger-action-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"
export default function CustomerLedgerActionRoute() {
  const params = useLocalSearchParams<{
    accountId: string
    mode: string
    entryId?: string
    allocationId?: string
    allocationAfter?: string
  }>()
  return (
    <WorkflowModalScreen
      title="Customer record"
      closeLabel="Close customer record"
      closeHref="/finance-modal"
    >
      <CustomerLedgerActionScreen {...params} />
    </WorkflowModalScreen>
  )
}
