import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { setLastMobileShell } from "@/lib/customer-shell-preference"
import { useRouter } from "expo-router"
import type { ReactNode } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function CustomerShellHeader({
  accountControl,
  backToList = false,
  onBack,
  onToggleSound,
  onOpenTools,
  showAccountPrivacy = false,
  soundEnabled = false,
  storeName,
  storeStatus,
}: {
  accountControl?: ReactNode
  backToList?: boolean
  onBack?: () => void
  onToggleSound?: () => void
  onOpenTools?: () => void
  showAccountPrivacy?: boolean
  soundEnabled?: boolean
  storeName?: string
  storeStatus?: string
}) {
  const insets = useSafeAreaInsets()
  const largeTextLayout = useLargeTextLayout()
  const router = useRouter()
  const { accessProfile, isAuthenticated } = useAuthContext()

  if (backToList) {
    return (
      <View style={{ paddingTop: insets.top + 6 }}>
        <View className="flex-row items-center gap-2 bg-background px-3 pb-2">
          <Pressable
            accessibilityLabel="Back to conversations"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full"
            haptic
            onPress={
              onBack ?? (() => router.replace("/(customer)/conversations"))
            }
          >
            <Icon className="size-[20px] text-foreground" name="ArrowLeft" />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text
              accessibilityRole="header"
              className="text-lg font-bold text-foreground"
              numberOfLines={largeTextLayout ? 2 : 1}
            >
              {storeName || "Conversation"}
            </Text>
            {storeStatus ? (
              <Text
                className="text-xs font-medium text-muted-foreground"
                numberOfLines={largeTextLayout ? 2 : 1}
              >
                {storeStatus}
              </Text>
            ) : null}
          </View>
          {onOpenTools ? (
            <Pressable
              accessibilityLabel="Open store tools"
              accessibilityRole="button"
              onPress={onOpenTools}
              className="size-11 items-center justify-center rounded-full"
            >
              <Icon name="more" className="size-[20px] text-foreground" />
            </Pressable>
          ) : null}
          {onToggleSound ? (
            <Pressable
              accessibilityLabel={
                soundEnabled
                  ? "Disable foreground response sound"
                  : "Enable foreground response sound"
              }
              accessibilityRole="switch"
              accessibilityState={{ checked: soundEnabled }}
              className="size-11 items-center justify-center rounded-full"
              haptic
              onPress={onToggleSound}
            >
              <Icon
                className={
                  soundEnabled
                    ? "size-[20px] text-primary"
                    : "size-[20px] text-muted-foreground"
                }
                name="Bell"
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  }

  const accountActions =
    accountControl || showAccountPrivacy ? (
      <View className="flex-row items-center gap-2">
        {accountControl}
        {showAccountPrivacy ? (
          <Pressable
            accessibilityHint="Open account-wide privacy and deletion options"
            accessibilityLabel="Account and privacy"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
            haptic
            onPress={() => router.push("/account-privacy")}
          >
            <Icon className="size-[20px] text-foreground" name="User" />
          </Pressable>
        ) : null}
      </View>
    ) : null

  return (
    <View style={{ paddingTop: insets.top + 6 }}>
      <View
        className={
          largeTextLayout
            ? "gap-2 bg-background px-[18px] pb-4"
            : "min-h-20 flex-row items-center gap-4 bg-background px-[18px] pb-4"
        }
      >
        <View
          className={largeTextLayout ? "gap-0.5" : "min-w-0 flex-1 gap-0.5"}
        >
          <Text
            accessibilityRole="header"
            className="text-2xl font-extrabold tracking-tight text-foreground"
            numberOfLines={largeTextLayout ? undefined : 1}
          >
            Chats
          </Text>
          <Text
            className="text-sm font-medium text-muted-foreground"
            numberOfLines={largeTextLayout ? undefined : 1}
          >
            Your conversations with stores
          </Text>
        </View>
        {accountActions ? (
          <View className={largeTextLayout ? "items-end" : undefined}>
            {accountActions}
          </View>
        ) : null}
      </View>
    </View>
  )
}

/** "Have a business on ẸwáTrade? Open it" under the chats list. */
export function CustomerBusinessLink() {
  const router = useRouter()
  const { accessProfile, isAuthenticated } = useAuthContext()
  if (isAuthenticated && !accessProfile?.hasBusinessAccess) return null
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-x-1 px-[18px] py-4">
      <Text className="text-sm text-muted-foreground">
        Have a business on ẸwáTrade?
      </Text>
      <Pressable
        accessibilityHint={
          isAuthenticated
            ? "Opens your Business workspace"
            : "Opens Business sign in"
        }
        accessibilityLabel="Open Business workspace"
        accessibilityRole="link"
        className="min-h-11 justify-center"
        haptic
        hitSlop={8}
        onPress={async () => {
          await setLastMobileShell("business")
          router.push(isAuthenticated ? "/dashboard" : "/login")
        }}
      >
        <Text className="text-sm font-bold text-primary">Open it</Text>
      </Pressable>
    </View>
  )
}
