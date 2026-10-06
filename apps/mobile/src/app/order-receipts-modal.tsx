import { ReceiptScreen } from "@/components/mobile/receipts/receipt-screen"
import { parseReceiptIds } from "@/components/mobile/receipts/receipt-selection"
import { useAuthContext } from "@/hooks/use-auth"
import { useLocalSearchParams } from "expo-router"

export default function OrderReceiptsRoute() {
  const { orderIds } = useLocalSearchParams<{ orderIds?: string | string[] }>()
  const { profile } = useAuthContext()
  return (
    <ReceiptScreen
      key={`${profile?.businessId}:${profile?.storeId}:${orderIds}`}
      orderIds={parseReceiptIds(orderIds)}
    />
  )
}
