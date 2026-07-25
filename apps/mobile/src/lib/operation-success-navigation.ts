import { CommonActions } from "@react-navigation/native"

export type OperationSuccessKind = "order" | "product" | "service"

export type OperationSuccessParams = {
  amount?: string
  customer?: string
  itemCount?: string
  kind: OperationSuccessKind
  name?: string
  paymentState?: "paid" | "partially_paid" | "pending"
  reference?: string
  status?: "created" | "queued"
}

type OperationSuccessNavigation = {
  dispatch: (action: ReturnType<typeof CommonActions.reset>) => void
}

export function showOperationSuccess(
  navigation: OperationSuccessNavigation,
  params: OperationSuccessParams,
) {
  navigation.dispatch(
    CommonActions.reset({
      index: 1,
      routes: [{ name: "dashboard" }, { name: "operation-success", params }],
    }),
  )
}
