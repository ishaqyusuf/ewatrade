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

  // Time is read only here (effects), never during render: the React Compiler
  // caches render values on their inputs, so a render-time Date.now() went
  // stale and kept a due-now sale "in the future".
  useEffect(() => {
    const now = Date.now()
    if (!hasProductLines) return
    if (dueAt <= now) {
      // Catch up once; after clock reaches the due time nothing re-runs.
      if (clock < dueAt) setClock(now)
      return
    }
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
    now: new Date(clock),
  })
}
