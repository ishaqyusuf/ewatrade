import { WhatsAppMessageSettingsScreen } from "@/components/mobile/customer-messages/settings-screen"
import { useAuthContext } from "@/hooks/use-auth"
import { customerMessageEvents } from "@ewatrade/customer-messages/client"
import { useLocalSearchParams } from "expo-router"

export default function WhatsAppMessageSettingsRoute() {
  const { eventKey } = useLocalSearchParams<{ eventKey?: string }>()
  const { profile } = useAuthContext()
  const initialEvent = customerMessageEvents.find(
    (event) => event.key === eventKey,
  )?.key
  return (
    <WhatsAppMessageSettingsScreen
      key={`${profile?.id}:${profile?.businessId}:${profile?.storeId}:${initialEvent ?? ""}`}
      initialEvent={initialEvent}
    />
  )
}
