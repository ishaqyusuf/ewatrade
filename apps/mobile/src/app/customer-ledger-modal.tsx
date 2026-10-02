import { CustomerLedgerDirectory } from "@/components/mobile/customer-ledger/customer-ledger-directory"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
export default function CustomerLedgerDirectoryRoute() {
  return (
    <WorkflowModalScreen
      title="Customer accounts"
      closeLabel="Close customer accounts"
      closeHref="/finance-modal"
    >
      <CustomerLedgerDirectory />
    </WorkflowModalScreen>
  )
}
