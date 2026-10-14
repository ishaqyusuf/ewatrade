import { CustomerMessageScreen } from "@/components/mobile/customer-messages/message-screen"
import { useAuthContext } from "@/hooks/use-auth"
import {
  type CustomerMessageEventKey,
  customerMessageEvents,
} from "@ewatrade/customer-messages/client"
import { useLocalSearchParams } from "expo-router"

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

/** Opaque ids only; keyed by user, business and Store so a switch starts clean. */
export default function CustomerMessageRoute() {
  const params = useLocalSearchParams<{
    orderId?: string
    eventKey?: string
    sourceId?: string
  }>()
  const { profile } = useAuthContext()
  const orderId = one(params.orderId)
  const eventKey = customerMessageEvents.find(
    (event) => event.key === one(params.eventKey),
  )?.key as CustomerMessageEventKey | undefined
  const sourceId = one(params.sourceId)
  if (!orderId) return null
  return (
    <CustomerMessageScreen
      key={`${profile?.id}:${profile?.businessId}:${profile?.storeId}:${orderId}:${eventKey ?? ""}:${sourceId ?? ""}`}
      orderId={orderId}
      eventKey={eventKey}
      sourceId={sourceId}
    />
  )
}
