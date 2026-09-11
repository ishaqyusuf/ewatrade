import {
  CustomerBookChrome,
  CustomerBookContent,
} from "@/components/mobile/customer-book/customer-book-screen"
import { WorkflowModalScreen } from "@/components/mobile/workflow-modal-screen"
import { useLocalSearchParams } from "expo-router"

function singleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined
}

export default function CustomerBookModalRoute() {
  const params = useLocalSearchParams<{
    create?: string | string[]
    customerId?: string | string[]
    customerName?: string | string[]
    customerOrderId?: string | string[]
  }>()
  const create = singleParam(params.create)
  const customerId = singleParam(params.customerId)
  const customerName = singleParam(params.customerName)
  const customerOrderId = singleParam(params.customerOrderId)

  return (
    <WorkflowModalScreen
      chrome={CustomerBookChrome}
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
