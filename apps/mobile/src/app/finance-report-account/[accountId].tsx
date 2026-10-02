import { FinanceReportAccountScreen } from "@/components/mobile/finance-reports/finance-report-account-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

export default function FinanceReportAccountRoute() {
  const params = useLocalSearchParams<{
    accountId: string
    from: string
    through: string
    snapshot: string
  }>()
  return (
    <WorkflowModalScreen
      title="Report account"
      closeLabel="Close report account"
      closeHref="/finance-reports-modal"
    >
      <FinanceReportAccountScreen
        accountId={params.accountId ?? ""}
        from={params.from ?? ""}
        through={params.through ?? ""}
        snapshot={params.snapshot ?? ""}
      />
    </WorkflowModalScreen>
  )
}
