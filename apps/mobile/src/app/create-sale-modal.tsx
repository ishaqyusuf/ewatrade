import { CreateSaleContent, WorkflowModalScreen } from "@/components/mobile"
import { useAuthContext } from "@/hooks/use-auth"
import { useLocalSearchParams, useRouter } from "expo-router"

export default function CreateSaleModalRoute() {
  const router = useRouter()
  const params = useLocalSearchParams<{ kind?: string }>()
  const { profile } = useAuthContext()
  const itemKind = params.kind === "service" ? "service" : undefined

  return (
    <WorkflowModalScreen
      allowSalesRep
      closeLabel="Close create sale"
      title={itemKind === "service" ? "New service order" : "Create sale"}
    >
      <CreateSaleContent
        attendantName={profile?.name ?? "Store Owner"}
        itemKind={itemKind}
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
