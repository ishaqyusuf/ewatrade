import { WorkflowModalScreen } from "@/components/mobile"
import { ClassicSaleSuccessSheet } from "@/components/mobile/appearances/classic/sale-success-sheet"
import {
  type CreateSaleCompletion,
  CreateSaleContent,
} from "@/components/mobile/create-sale/create-sale-screen"
import { CreateSaleWorkflowChrome } from "@/components/mobile/create-sale/create-sale-workflow-chrome"
import { useAuthContext } from "@/hooks/use-auth"
import type { OperationSuccessParams } from "@/lib/operation-success-navigation"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { useLocalSearchParams } from "expo-router"
import { useState } from "react"

export default function CreateSaleModalRoute() {
  const params = useLocalSearchParams<{
    catalogItemId?: string
    offeringId?: string
    customerEmail?: string
    customerId?: string
    customerDirectoryId?: string
    customerName?: string
    customerPhone?: string
    kind?: string
  }>()
  const { profile } = useAuthContext()
  const itemKind = params.kind === "service" ? "service" : undefined
  const [success, setSuccess] = useState<OperationSuccessParams | null>(null)

  return (
    // iOS presents this route natively above the root, so its checkout sheets
    // (account chooser, success) host here; the root host would sit behind it.
    <BottomSheetModalProvider>
      <WorkflowModalScreen
        chrome={CreateSaleWorkflowChrome}
        allowSalesRep
        closeLabel="Close create sale"
        title={itemKind === "service" ? "New service order" : "Create sale"}
      >
        <CreateSaleContent
          attendantName={profile?.name ?? "Store Owner"}
          initialCatalogItemId={params.catalogItemId}
          initialOfferingId={params.offeringId}
          initialCustomer={
            params.customerName
              ? {
                  email: params.customerEmail,
                  id: params.customerId ?? `customer:${params.customerName}`,
                  directoryId: params.customerDirectoryId,
                  name: params.customerName,
                  phone: params.customerPhone,
                }
              : undefined
          }
          itemKind={itemKind}
          onRecorded={(completion) => {
            // The success rises as a sheet over the checkout.
            setSuccess(saleSuccessParams(completion, itemKind === "service"))
          }}
          presentation="screen"
        />
        {success ? <ClassicSaleSuccessSheet params={success} /> : null}
      </WorkflowModalScreen>
    </BottomSheetModalProvider>
  )
}

function saleSuccessParams(
  completion: CreateSaleCompletion,
  service: boolean,
): OperationSuccessParams {
  return {
    amount: completion.amount,
    orderId: completion.orderId,
    paymentMethod: completion.paymentMethod,
    unitCount: completion.unitCount,
    balance: completion.balance,
    customer: completion.customer,
    itemCount: String(completion.itemCount),
    kind: "order",
    paymentState: completion.paymentState,
    reference: completion.reference,
    status: completion.status,
    ...(completion.moneyAccount
      ? { moneyAccount: completion.moneyAccount }
      : {}),
    ...(service ? { saleKind: "service" as const } : {}),
  }
}
