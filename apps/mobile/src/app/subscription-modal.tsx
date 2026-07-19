import { SubscriptionPlanContent, WorkflowModalScreen } from "@/components/mobile"
import { useBusinessStore } from "@/store/businessStore"
import { useRouter } from "expo-router"

export default function SubscriptionModalRoute() {
  const router = useRouter()
  const businesses = useBusinessStore((state) => state.businesses)

  return (
    <WorkflowModalScreen closeLabel="Close subscription" title="Subscription">
      <SubscriptionPlanContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
        usage={{
          businesses: businesses.length,
          products: 0,
          staff: 0,
        }}
      />
    </WorkflowModalScreen>
  )
}
