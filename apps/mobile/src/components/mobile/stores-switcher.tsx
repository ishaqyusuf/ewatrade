import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

/** Existing permitted Stores only. Store creation belongs in business settings. */
export function MobileStoresSwitcher() {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stores = useQuery(
    trpc.tenant.stores.queryOptions(undefined, {
      enabled: Boolean(auth.profile?.businessId) && !offline,
      retry: false,
    }),
  )
  if (stores.isError)
    return (
      <Text accessibilityRole="alert" className="px-4 text-sm text-destructive">
        Store access is unavailable. Refresh your session or contact the
        business Owner.
      </Text>
    )
  if (!stores.data) return null
  if (!stores.data.length)
    return (
      <Text
        accessibilityRole="alert"
        className="px-4 text-sm text-muted-foreground"
      >
        No Store access. Contact the business Owner.
      </Text>
    )
  if (stores.data.length < 2 && stores.data[0]?.id === auth.profile?.storeId)
    return null
  return (
    <View className="gap-2 px-4">
      <Text className="text-sm text-muted-foreground">Store</Text>
      <View className="flex-row flex-wrap gap-2">
        {stores.data
          .filter((row) => row.status === "ACTIVE")
          .map((store) => (
            <Pressable
              key={store.id}
              accessibilityRole="button"
              accessibilityState={{
                selected: auth.profile?.storeId === store.id,
              }}
              disabled={busy || offline}
              className="border border-border px-3 py-2"
              onPress={async () => {
                const initial = getSession()
                if (
                  !initial ||
                  busy ||
                  initial.profile.businessId !== auth.profile?.businessId
                )
                  return
                setBusy(true)
                setError(null)
                try {
                  const scope = await client.fetchQuery(
                    trpc.tenant.storeContext.queryOptions(
                      { storeId: store.id },
                      { staleTime: 0, retry: false },
                    ),
                  )
                  const latest = getSession()
                  if (
                    latest?.token !== initial.token ||
                    latest.profile.businessId !== initial.profile.businessId ||
                    latest.profile.storeId !== initial.profile.storeId
                  )
                    return
                  auth.applyAuthenticatedSession({
                    ...initial,
                    profile: {
                      ...initial.profile,
                      storeId: scope.activeStore.id,
                      storeName: scope.activeStore.name,
                      currencyCode: scope.activeStore.currencyCode,
                      role: scope.membership.role,
                      staffAccessMode: scope.membership.staffAccessMode,
                      catalogEditor: scope.membership.catalogEditor,
                    },
                  })
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Store access is unavailable.",
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Text className="text-sm text-foreground">{store.name}</Text>
            </Pressable>
          ))}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  )
}
