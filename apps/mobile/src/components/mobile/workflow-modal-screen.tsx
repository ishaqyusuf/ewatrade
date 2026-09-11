import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { isInvitedStaffProfile, isSalesRepRole } from "@/lib/mobile-roles"
import { Redirect, useRouter } from "expo-router"
import { StatusBar } from "expo-status-bar"
import type { ComponentType, ReactNode } from "react"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { MobileScreen } from "./screen"

export type WorkflowModalChromeProps = {
  children: ReactNode
  closeLabel: string
  hideHeader: boolean
  keyboardBottomOffset: number
  title: string
  onClose: () => void
}

type WorkflowModalScreenProps = {
  chrome?: ComponentType<WorkflowModalChromeProps>
  allowSalesRep?: boolean
  children: ReactNode
  closeHref?:
    | "/admin-home"
    | "/business-switch-modal"
    | "/dashboard"
    | "/sales-rep-home"
  closeLabel: string
  hideHeader?: boolean
  keyboardBottomOffset?: number
  title: string
}

export function WorkflowModalScreen({
  allowSalesRep = false,
  chrome: Chrome = DefaultWorkflowModalChrome,
  children,
  closeHref = "/dashboard",
  closeLabel,
  hideHeader = false,
  keyboardBottomOffset = 140,
  title,
}: WorkflowModalScreenProps) {
  const router = useRouter()
  const { isAuthenticated, profile } = useAuthContext()
  const isSalesRep = isSalesRepRole(profile?.role)

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  if (isInvitedStaffProfile(profile) || (!allowSalesRep && isSalesRep)) {
    return <Redirect href="/dashboard" />
  }

  return (
    <Chrome
      closeLabel={closeLabel}
      hideHeader={hideHeader}
      keyboardBottomOffset={keyboardBottomOffset}
      title={title}
      onClose={() => router.replace(closeHref)}
    >
      {children}
    </Chrome>
  )
}

function DefaultWorkflowModalChrome({
  children,
  closeLabel,
  hideHeader,
  keyboardBottomOffset,
  title,
  onClose,
}: WorkflowModalChromeProps) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const insets = useSafeAreaInsets()
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
        {hideHeader ? null : (
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
              onPress={onClose}
              transition
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>
        )}
        <View className="min-h-0 flex-1">{children}</View>
      </MobileScreen>
    </View>
  )
}
