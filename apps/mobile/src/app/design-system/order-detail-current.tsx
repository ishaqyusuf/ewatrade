import { OrderDetailCurrentQaScreen } from "@/components/mobile/order-detail-current-qa-screen"
import { Redirect, useLocalSearchParams } from "expo-router"

export default function OrderDetailCurrentQaRoute() {
  const { action, state, theme } = useLocalSearchParams<{
    action?: string
    state?: string
    theme?: string
  }>()
  if (
    !__DEV__ ||
    (action !== undefined &&
      !["customer", "fulfil-all", "fulfil-line", "payment"].includes(action)) ||
    (theme !== undefined && theme !== "light" && theme !== "dark") ||
    (state !== undefined &&
      !["offline", "paid", "populated", "scheduled"].includes(state))
  ) {
    return <Redirect href="/design-system" />
  }
  return (
    <OrderDetailCurrentQaScreen
      action={
        action === "customer" ||
        action === "fulfil-all" ||
        action === "fulfil-line" ||
        action === "payment"
          ? action
          : null
      }
      state={
        state === "offline" || state === "paid" || state === "scheduled"
          ? state
          : "populated"
      }
      theme={theme === "dark" ? "dark" : "light"}
    />
  )
}
