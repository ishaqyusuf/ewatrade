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
  const titles: Record<string, string> = {
    apply: "Apply credit",
    entry: "Entry",
    opening: "Opening balance",
    receipt: "Record payment",
    refund: "Return credit",
    release: "Release allocation",
    reverse: "Correct entry",
  }
  const title = titles[params.mode] ?? "Customer record"
  return (
    <WorkflowModalScreen
      title={title}
      back
      closeLabel="Back to statement"
      closeHref="/finance-modal"
    >
      <CustomerLedgerActionScreen {...params} />
    </WorkflowModalScreen>
  )
}
