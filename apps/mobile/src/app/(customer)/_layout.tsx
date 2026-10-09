import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { initializeCustomerConversationStore } from "@/lib/customer-conversation-store"
import { setLastMobileShell } from "@/lib/customer-shell-preference"
import { stackTransitions } from "@/lib/screen-transitions"
import { CustomerConversationAPIProvider } from "@/trpc/customer-client"
import { Stack } from "expo-router"
import { useEffect, useState } from "react"
import { Platform, View } from "react-native"

const transitions = stackTransitions(Platform.OS)

export default function CustomerLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void initializeCustomerConversationStore()
      .then(() => setLastMobileShell("customer"))
      .finally(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <View className="flex-1 bg-background px-4 pt-16">
        <ListSkeleton
          count={6}
          label="Opening Personal conversations"
          variant="person"
        />
      </View>
    )
  }

  return (
    <CustomerConversationAPIProvider>
      <Stack screenOptions={{ headerShown: false, ...transitions.push }} />
    </CustomerConversationAPIProvider>
  )
}
