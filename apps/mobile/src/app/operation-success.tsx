import { OperationSuccessScreen } from "@/components/mobile/operation-success-screen"
import type { OperationSuccessParams } from "@/lib/operation-success-navigation"
import { useLocalSearchParams } from "expo-router"

export default function OperationSuccessRoute() {
  const params = useLocalSearchParams<OperationSuccessParams>()

  return <OperationSuccessScreen params={params} />
}
