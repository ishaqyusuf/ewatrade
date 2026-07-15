import { CreateSaleContent, WorkflowModalScreen } from "@/components/mobile"
import { useAuthContext } from "@/hooks/use-auth"
import { useRouter } from "expo-router"

export default function CreateSaleModalRoute() {
  const router = useRouter()
  const { profile } = useAuthContext()

  return (
    <WorkflowModalScreen
      allowSalesRep
      closeLabel="Close create sale"
      title="Create sale"
    >
      <CreateSaleContent
        attendantName={profile?.name ?? "Store Owner"}
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
