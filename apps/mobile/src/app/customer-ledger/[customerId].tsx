import { CustomerLedgerScreen } from "@/components/mobile/customer-ledger/customer-ledger-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"
export default function CustomerLedgerRoute() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>()
  return (
    <WorkflowModalScreen
      title="Statement"
      back
      closeLabel="Back to customer accounts"
      closeHref="/finance-modal"
    >
      <CustomerLedgerScreen customerId={customerId} />
    </WorkflowModalScreen>
  )
}
