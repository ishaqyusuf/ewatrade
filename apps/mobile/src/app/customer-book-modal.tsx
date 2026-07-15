import { CustomerBookContent, WorkflowModalScreen } from "@/components/mobile"
import { useRouter } from "expo-router"

export default function CustomerBookModalRoute() {
  const router = useRouter()

  return (
    <WorkflowModalScreen
      allowSalesRep
      closeLabel="Close customer book"
      title="Customers"
    >
      <CustomerBookContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
