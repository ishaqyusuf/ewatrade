import { RecordReturnScreen } from "@/components/mobile/returnables/record-return-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

const single = (value: string | string[] | undefined) =>
  typeof value === "string" && value ? value : undefined

export default function RecordReturnRoute() {
  const params = useLocalSearchParams<{
    catalogItemId?: string
    customerId?: string
    orderId?: string
  }>()
  return (
    <WorkflowModalScreen
      allowSalesRep
      back
      closeLabel="Close record return"
      title="Record return"
    >
      <RecordReturnScreen
        catalogItemId={single(params.catalogItemId)}
        customerId={single(params.customerId)}
        orderId={single(params.orderId)}
      />
    </WorkflowModalScreen>
  )
}
