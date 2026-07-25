import { CreateSaleContent, WorkflowModalScreen } from "@/components/mobile"
import { useAuthContext } from "@/hooks/use-auth"
import { showOperationSuccess } from "@/lib/operation-success-navigation"
import { useLocalSearchParams, useNavigation } from "expo-router"

export default function CreateSaleModalRoute() {
  const navigation = useNavigation()
  const params = useLocalSearchParams<{
    catalogItemId?: string
    customerEmail?: string
    customerId?: string
    customerName?: string
    customerPhone?: string
    kind?: string
  }>()
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
        initialCatalogItemId={params.catalogItemId}
        initialCustomer={
          params.customerName
            ? {
                email: params.customerEmail,
                id: params.customerId ?? `customer:${params.customerName}`,
                name: params.customerName,
                phone: params.customerPhone,
              }
            : undefined
        }
        itemKind={itemKind}
        onComplete={(completion) =>
          showOperationSuccess(navigation, {
            amount: completion.amount,
            customer: completion.customer,
            itemCount: String(completion.itemCount),
            kind: "order",
            paymentState: completion.paymentState,
            reference: completion.reference,
            status: completion.status,
          })
        }
        presentation="screen"
      />
    </WorkflowModalScreen>
  )
}
