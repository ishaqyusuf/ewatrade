import { CustomerBookContent, WorkflowModalScreen } from "@/components/mobile"
import { useLocalSearchParams } from "expo-router"

export default function CustomerBookModalRoute() {
  const { create, customerId, customerName, customerOrderId } =
    useLocalSearchParams<{
      create?: string
      customerId?: string
      customerName?: string
      customerOrderId?: string
    }>()

  return (
    <WorkflowModalScreen
      allowSalesRep
      closeLabel="Close customer book"
      hideHeader={Boolean(customerOrderId)}
      title="Customers"
    >
      <CustomerBookContent
        createOnOpen={create === "true"}
        initialCustomerId={customerId}
        initialCustomerName={customerName}
        initialOrderId={customerOrderId}
      />
    </WorkflowModalScreen>
  )
}
