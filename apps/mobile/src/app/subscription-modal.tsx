import {
  SubscriptionPlanContent,
  WorkflowModalScreen,
} from "@/components/mobile"
import { SUBSCRIPTION_SCREEN_COPY } from "@/components/mobile/subscription-plan-presentation"
import { useBusinessStore } from "@/store/businessStore"

export default function SubscriptionModalRoute() {
  const businesses = useBusinessStore((state) => state.businesses)

  return (
    <WorkflowModalScreen
      closeLabel="Close plan and billing"
      title={SUBSCRIPTION_SCREEN_COPY.title}
    >
      <SubscriptionPlanContent
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
