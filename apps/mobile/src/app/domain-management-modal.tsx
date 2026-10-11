import {
  DomainManagementContent,
  WorkflowModalScreen,
} from "@/components/mobile"
import { EmptyState } from "@/components/mobile/empty-state"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useLocalSearchParams } from "expo-router"
import { View } from "react-native"

export default function DomainManagementModalRoute() {
  const trpc = useTRPC()
  const params = useLocalSearchParams<{
    domainOrderId?: string | string[]
  }>()
  const domainOrderId = Array.isArray(params.domainOrderId)
    ? params.domainOrderId[0]
    : params.domainOrderId
  // Held back until launch (owner, 11 Oct 2026). Only an explicit "off" from
  // the API blocks the screen; offline, the content shows its own state.
  const availability = useQuery(
    trpc.domains.availability.queryOptions(undefined, { retry: false }),
  )

  return (
    <WorkflowModalScreen
      closeLabel="Close domain management"
      title="Website & domain"
    >
      {availability.data?.enabled === false ? (
        <View className="px-[18px] pt-4">
          <EmptyState
            icon="Globe"
            message="Custom domains are coming soon. Your free ẸwáTrade store address keeps working."
            title="Website & domain isn’t available yet"
          />
        </View>
      ) : (
        <DomainManagementContent initialOrderId={domainOrderId} />
      )}
    </WorkflowModalScreen>
  )
}
