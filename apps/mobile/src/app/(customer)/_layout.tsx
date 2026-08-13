import { initializeCustomerConversationStore } from "@/lib/customer-conversation-store"
import { setLastMobileShell } from "@/lib/customer-shell-preference"
import { CustomerConversationAPIProvider } from "@/trpc/customer-client"
import { Stack } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, View } from "react-native"

export default function CustomerLayout() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void initializeCustomerConversationStore()
      .then(() => setLastMobileShell("customer"))
      .finally(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Opening Personal conversations" />
      </View>
    )
  }

  return (
    <CustomerConversationAPIProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </CustomerConversationAPIProvider>
  )
}
