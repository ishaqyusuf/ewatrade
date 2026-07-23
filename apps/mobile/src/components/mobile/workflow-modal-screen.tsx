import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { isInvitedStaffProfile, isSalesRepRole } from "@/lib/mobile-roles"
import { Redirect, useRouter } from "expo-router"
import { StatusBar } from "expo-status-bar"
import type { ReactNode } from "react"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { MobileScreen } from "./screen"

type WorkflowModalScreenProps = {
  allowSalesRep?: boolean
  children: ReactNode
  closeHref?: "/admin-home" | "/dashboard" | "/sales-rep-home"
  closeLabel: string
  keyboardBottomOffset?: number
  title: string
}

export function WorkflowModalScreen({
  allowSalesRep = false,
  children,
  closeHref = "/dashboard",
  closeLabel,
  keyboardBottomOffset = 140,
  title,
}: WorkflowModalScreenProps) {
  const router = useRouter()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const insets = useSafeAreaInsets()
  const { isAuthenticated, profile } = useAuthContext()
  const isSalesRep = isSalesRepRole(profile?.role)

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  if (isInvitedStaffProfile(profile) || (!allowSalesRep && isSalesRep)) {
    return <Redirect href="/dashboard" />
  }

  return (
    <View
      style={{
        backgroundColor: colors.background,
        flex: 1,
      }}
    >
      <StatusBar
        animated
        backgroundColor={colors.background}
        style={colorScheme === "dark" ? "light" : "dark"}
      />
      <View
        pointerEvents="none"
        style={{
          backgroundColor: colors.background,
          height: insets.top,
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
          zIndex: 100,
        }}
      />
      <MobileScreen
        contentClassName="px-0 pt-6 pb-0"
        contentContainerStyle={{ paddingBottom: 0 }}
        keyboardBottomOffset={keyboardBottomOffset}
        scroll={false}
      >
        <View className="mb-4 flex-row items-center justify-between gap-3 px-4">
          <View className="min-w-0 flex-1">
            <Text className="text-2xl font-extrabold text-foreground">
              {title}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={closeLabel}
            className="h-11 w-11 items-center justify-center rounded-full bg-muted active:bg-accent"
            haptic
            onPress={() => router.replace(closeHref)}
            transition
          >
            <Icon className="size-sm text-foreground" name="X" />
          </Pressable>
        </View>
        <View className="min-h-0 flex-1">{children}</View>
      </MobileScreen>
    </View>
  )
}
