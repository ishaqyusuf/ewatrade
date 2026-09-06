import { OrderDetailCurrentQaScreen } from "@/components/mobile/order-detail-current-qa-screen"
import { Redirect, useLocalSearchParams } from "expo-router"

export default function OrderDetailCurrentQaRoute() {
  const { theme } = useLocalSearchParams<{ theme?: string }>()
  if (
    !__DEV__ ||
    (theme !== undefined && theme !== "light" && theme !== "dark")
  ) {
    return <Redirect href="/design-system" />
  }
  return (
    <OrderDetailCurrentQaScreen theme={theme === "dark" ? "dark" : "light"} />
  )
}
