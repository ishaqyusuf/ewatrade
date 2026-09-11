import { OrderDetailScreen } from "@/components/mobile/order-detail/order-detail-screen"
import { useLocalSearchParams } from "expo-router"

export default function CommercialOrderRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  return <OrderDetailScreen orderId={orderId ?? ""} />
}
