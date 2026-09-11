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
  soundEnabled = false,
  storeName,
  storeStatus,
}: {
  accountControl?: ReactNode
  backToList?: boolean
  onBack?: () => void
  onToggleSound?: () => void
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
            <Icon className="size-base text-foreground" name="ArrowLeft" />
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
                    ? "size-sm text-primary"
                    : "size-sm text-muted-foreground"
                }
                name="Bell"
              />
            </Pressable>
          ) : null}
        </View>
      </View>
    )
  }

  const businessButton =
    !isAuthenticated || accessProfile?.hasBusinessAccess ? (
      <Pressable
        accessibilityLabel="Open Business workspace"
        accessibilityHint={
          isAuthenticated
            ? "Opens your Business workspace"
            : "Opens Business sign in"
        }
        accessibilityRole="button"
        className="min-h-11 min-w-28 flex-row items-center justify-center gap-2 rounded-full bg-muted px-5 active:bg-accent"
        haptic
        onPress={async () => {
          await setLastMobileShell("business")
          router.push(isAuthenticated ? "/dashboard" : "/login")
        }}
        transition
      >
        <Icon className="size-sm text-foreground" name="Building2" />
        <Text className="text-sm font-bold text-foreground">Business</Text>
      </Pressable>
    ) : null

  if (largeTextLayout) {
    return (
      <View style={{ paddingTop: insets.top + 6 }}>
        <View className="gap-2 bg-background px-5 pb-4">
          <View className="flex-row items-start justify-between gap-3">
            <Text
              accessibilityRole="header"
              className="shrink-0 text-2xl font-extrabold tracking-tight text-foreground"
            >
              Chats
            </Text>
            <View className="min-w-0 flex-1 flex-row flex-wrap items-center justify-end gap-2">
              {accountControl}
              {businessButton}
            </View>
          </View>
          <Text className="text-sm font-medium text-muted-foreground">
            Your conversations with stores
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={{ paddingTop: insets.top + 6 }}>
      <View className="min-h-20 flex-row items-center gap-4 bg-background px-5 pb-4">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            accessibilityRole="header"
            className="text-2xl font-extrabold tracking-tight text-foreground"
            numberOfLines={1}
          >
            Chats
          </Text>
          <Text
            className="text-sm font-medium text-muted-foreground"
            numberOfLines={1}
          >
            Your conversations with stores
          </Text>
        </View>
        {accountControl}
        {businessButton}
      </View>
    </View>
  )
}
