import { SubscriptionPlanContent, WorkflowModalScreen } from "@/components/mobile"
import { useBusinessStore } from "@/store/businessStore"
import { useRetailOpsStore } from "@/store/retailOpsStore"
import { useRouter } from "expo-router"

function isActiveRecord<T extends { businessId?: string | null }>(
  record: T,
  activeBusinessId: string | null,
) {
  return !activeBusinessId || (record.businessId ?? activeBusinessId) === activeBusinessId
}

export default function SubscriptionModalRoute() {
  const router = useRouter()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const businesses = useBusinessStore((state) => state.businesses)
  const products = useRetailOpsStore((state) => state.products)
  const staff = useRetailOpsStore((state) => state.staff)

  return (
    <WorkflowModalScreen closeLabel="Close subscription" title="Subscription">
      <SubscriptionPlanContent
        onComplete={() => router.replace("/dashboard")}
        presentation="screen"
        usage={{
          businesses: businesses.length,
          products: products.filter((product) =>
            isActiveRecord(product, activeBusinessId),
          ).length,
          staff: staff.filter((staffMember) =>
            isActiveRecord(staffMember, activeBusinessId),
          ).length,
        }}
      />
    </WorkflowModalScreen>
  )
}
