import { AuthMethodButton } from "@/components/mobile/auth-header"
import { RowDivider } from "@/components/mobile/green-till/kit"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getPlan } from "@/lib/retail-ops-subscription"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { Share } from "react-native"

export function OwnerSignupHomeCards() {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [shareError, setShareError] = useState<string | null>(null)
  const current = useQuery(
    trpc.tenant.current.queryOptions(undefined, {
      enabled: auth.isAuthenticated && !offline,
      retry: false,
    }),
  )
  const owner = ["OWNER", "ADMIN"].includes(
    current.data?.membership.role ?? auth.profile?.role?.toUpperCase() ?? "",
  )
  const summary = useQuery(
    trpc.tenant.ownerSignupSummary.queryOptions(undefined, {
      enabled: owner && !offline,
      retry: false,
    }),
  )
  const preview = useQuery(
    trpc.tenant.storefrontPreview.queryOptions(undefined, {
      enabled: owner && !offline,
      retry: false,
    }),
  )
  const tenant = current.data?.tenant
  if (!owner) return null
  if (!tenant)
    return current.isError || offline ? (
      <View className="mt-4 gap-3 rounded-[20px] bg-card p-3.5">
        <Text className="text-sm text-muted-foreground">
          Connect to load your store link.
        </Text>
        <AuthMethodButton
          label="Try again"
          onPress={() => void current.refetch()}
        />
      </View>
    ) : null
  const plan = getPlan(tenant.retailOpsPlanId ?? "starter")
  const limited = plan.limits.storefrontItems !== null
  const url = `https://${tenant.slug}.ewatrade.com`
  return (
    <View className="mt-4 gap-4">
      <View className="gap-3 rounded-[20px] bg-card p-3.5">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="text-sm font-bold text-foreground">
            Share your store
          </Text>
          <Text className="rounded-full bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary">
            {plan.name}
          </Text>
        </View>
        <Text selectable className="text-sm text-primary">
          {tenant.slug}.ewatrade.com
        </Text>
        <Text className="text-xs text-muted-foreground">
          {limited
            ? "Your first 3 items show. Upgrade to list everything and let customers message you."
            : "Everything you list can show here. Customer messages are included once your store chat is set up."}
        </Text>
        {limited ? (
          <View
            accessibilityLabel="Your first three storefront items"
            className="gap-2"
          >
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                className="min-h-11 justify-center rounded-2xl border border-border px-3.5"
              >
                <Text className="text-xs text-foreground">
                  {preview.data?.[index]?.name ??
                    (offline
                      ? "Connect to preview items"
                      : preview.isError
                        ? "Preview unavailable"
                        : preview.isPending
                          ? "Loading items…"
                          : `Item ${index + 1} · add what you sell`)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <AuthMethodButton
          icon="Share2"
          label="Share store link"
          onPress={() => {
            setShareError(null)
            void Share.share({ message: url, url }).catch(() =>
              setShareError(
                "Could not open sharing. Copy the store link above and try again.",
              ),
            )
          }}
        />
        {limited ? (
          <AuthMethodButton
            label="See plans"
            onPress={() => router.push("/subscription-modal")}
          />
        ) : null}
        {shareError ? (
          <Text accessibilityRole="alert" className="text-xs text-destructive">
            {shareError}
          </Text>
        ) : null}
      </View>
      {summary.isError ? (
        <AuthMethodButton
          label="Retry loading your other businesses"
          onPress={() => void summary.refetch()}
        />
      ) : null}
      {summary.data &&
      summary.data.readyBusinesses.length +
        summary.data.pendingBusinesses.length >
        1 ? (
        <View className="overflow-hidden rounded-[20px] bg-card">
          <Text className="px-3.5 py-3 text-sm font-bold text-foreground">
            Your businesses
          </Text>
          {summary.data.readyBusinesses.map((business) => (
            <View
              key={business.id}
              className="min-h-11 flex-row items-center gap-3 px-3.5 py-3"
            >
              <View className="flex-1">
                <Text className="text-sm font-bold text-foreground">
                  {business.name}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {business.slug}.ewatrade.com
                </Text>
              </View>
              <Text className="text-xs font-bold text-primary">Ready</Text>
              <RowDivider />
            </View>
          ))}
          {summary.data.pendingBusinesses.map((business) => (
            <View
              key={business.slug}
              className="min-h-11 flex-row items-center gap-3 px-3.5 py-3"
            >
              <View className="flex-1">
                <Text className="text-sm font-bold text-foreground">
                  {business.name}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Waiting for an upgrade
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Upgrade to set up ${business.name}`}
                className="min-h-11 justify-center px-3.5"
                onPress={() => router.push("/subscription-modal")}
              >
                <Text className="text-xs font-bold text-primary">Upgrade</Text>
              </Pressable>
              <RowDivider />
            </View>
          ))}
          <Text className="px-3.5 py-3 text-xs text-muted-foreground">
            Switch businesses from the top of Home.
          </Text>
        </View>
      ) : null}
    </View>
  )
}
