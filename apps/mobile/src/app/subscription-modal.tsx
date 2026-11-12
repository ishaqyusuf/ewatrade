import {
  SubscriptionPlanContent,
  WorkflowModalScreen,
} from "@/components/mobile"
import { PlanPageOpened } from "@/components/mobile/growth/plan-page-opened"
import { SUBSCRIPTION_SCREEN_COPY } from "@/components/mobile/subscription-plan-presentation"

export default function SubscriptionModalRoute() {
  return (
    <WorkflowModalScreen
      closeLabel="Close plan and billing"
      title={SUBSCRIPTION_SCREEN_COPY.title}
    >
      <PlanPageOpened />
      <SubscriptionPlanContent presentation="screen" />
    </WorkflowModalScreen>
  )
}
