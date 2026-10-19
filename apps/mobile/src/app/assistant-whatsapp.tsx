import { AssistantWhatsAppScreen } from "@/components/mobile/assistant-whatsapp/screen"
import { useAuthContext } from "@/hooks/use-auth"
import { getDataCacheGeneration } from "@/trpc/client"

export default function AssistantWhatsAppRoute() {
  const { profile } = useAuthContext()
  return (
    <AssistantWhatsAppScreen
      key={`${profile?.id}:${profile?.businessId}:${profile?.storeId}:${profile?.role}:${getDataCacheGeneration()}`}
    />
  )
}
