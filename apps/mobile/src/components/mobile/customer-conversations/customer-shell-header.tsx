import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { setLastMobileShell } from "@/lib/customer-shell-preference"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function CustomerShellHeader({
  backToList = false,
  storeName,
}: {
  backToList?: boolean
  storeName?: string
}) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { isAuthenticated } = useAuthContext()

  return (
    <View
      className="flex-row items-center gap-3 border-b border-border bg-background px-4 pb-3"
      style={{ paddingTop: insets.top + 8 }}
    >
      {backToList ? (
        <Pressable
          accessibilityLabel="Back to conversations"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full"
          haptic
          onPress={() => router.replace("/(customer)/conversations")}
        >
          <Icon className="size-base text-foreground" name="ArrowLeft" />
        </Pressable>
      ) : null}
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-semibold uppercase tracking-wider text-primary">
          Personal
        </Text>
        <Text className="truncate text-lg font-extrabold text-foreground">
          {storeName ?? "Conversations"}
        </Text>
      </View>
      <Pressable
        accessibilityHint={
          isAuthenticated
            ? "Opens your Business workspace"
            : "Opens Business sign in"
        }
        accessibilityRole="button"
        className="min-h-11 flex-row items-center gap-2 rounded-full border border-border px-4"
        haptic
        onPress={async () => {
          await setLastMobileShell("business")
          router.push(isAuthenticated ? "/dashboard" : "/login")
        }}
      >
        <Icon className="size-sm text-foreground" name="Building2" />
        <Text className="text-sm font-bold text-foreground">Business</Text>
      </Pressable>
    </View>
  )
}
