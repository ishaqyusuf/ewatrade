import { OrderDetailCurrentQaScreen } from "@/components/mobile/order-detail-current-qa-screen"
import { Redirect, useLocalSearchParams } from "expo-router"

export default function OrderDetailCurrentQaRoute() {
  const { state, theme } = useLocalSearchParams<{
    state?: string
    theme?: string
  }>()
  if (
    !__DEV__ ||
    (theme !== undefined && theme !== "light" && theme !== "dark") ||
    (state !== undefined &&
      !["offline", "paid", "populated", "scheduled"].includes(state))
  ) {
    return <Redirect href="/design-system" />
  }
  return (
    <OrderDetailCurrentQaScreen
      state={
        state === "offline" || state === "paid" || state === "scheduled"
          ? state
          : "populated"
      }
      theme={theme === "dark" ? "dark" : "light"}
    />
  )
}
