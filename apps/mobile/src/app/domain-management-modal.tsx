import {
  DomainManagementContent,
  WorkflowModalScreen,
} from "@/components/mobile"
import { useLocalSearchParams } from "expo-router"

export default function DomainManagementModalRoute() {
  const params = useLocalSearchParams<{
    domainOrderId?: string | string[]
  }>()
  const domainOrderId = Array.isArray(params.domainOrderId)
    ? params.domainOrderId[0]
    : params.domainOrderId

  return (
    <WorkflowModalScreen
      closeLabel="Close domain management"
      title="Website & domain"
    >
      <DomainManagementContent initialOrderId={domainOrderId} />
    </WorkflowModalScreen>
  )
}
