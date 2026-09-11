import { getSaleFulfillmentOption } from "@/components/mobile/sale-checkout-model"
import { useEffect, useState } from "react"
import { AppState } from "react-native"

export function useSaleFulfillment({
  deliveryDueAt,
  hasProductLines,
  requested,
}: Omit<Parameters<typeof getSaleFulfillmentOption>[0], "now">) {
  const [clock, setClock] = useState(Date.now)
  const dueAt = deliveryDueAt.getTime()

  useEffect(() => {
    const now = Date.now()
    if (!hasProductLines || dueAt <= now) return
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(dueAt - now + 50, 60_000),
    )
    return () => clearTimeout(timer)
  }, [clock, dueAt, hasProductLines])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setClock(Date.now())
    })
    return () => subscription.remove()
  }, [])

  return getSaleFulfillmentOption({
    deliveryDueAt,
    hasProductLines,
    requested,
    now: new Date(Math.max(clock, Date.now())),
  })
}
