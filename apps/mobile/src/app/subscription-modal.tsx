import {
  SubscriptionPlanContent,
  WorkflowModalScreen,
} from "@/components/mobile"
import { SUBSCRIPTION_SCREEN_COPY } from "@/components/mobile/subscription-plan-presentation"

export default function SubscriptionModalRoute() {
  return (
    <WorkflowModalScreen
      closeLabel="Close plan and billing"
      title={SUBSCRIPTION_SCREEN_COPY.title}
    >
      <SubscriptionPlanContent presentation="screen" />
    </WorkflowModalScreen>
  )
}
