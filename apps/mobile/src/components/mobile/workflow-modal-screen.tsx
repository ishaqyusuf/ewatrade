import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { isInvitedStaffProfile, isSalesRepRole } from "@/lib/mobile-roles"
import { Redirect, useRouter } from "expo-router"
import type { ReactNode } from "react"
import { View } from "react-native"
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
  const { isAuthenticated, profile } = useAuthContext()
  const isSalesRep = isSalesRepRole(profile?.role)

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  if (isInvitedStaffProfile(profile) || (!allowSalesRep && isSalesRep)) {
    return <Redirect href="/dashboard" />
  }

  return (
    <MobileScreen
      contentClassName="px-0 py-6"
      keyboardBottomOffset={keyboardBottomOffset}
      scroll={false}
    >
      <View className="mb-4 flex-row items-center justify-between gap-3 px-5">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-bold uppercase text-muted-foreground">
            Full-screen workflow
          </Text>
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
  )
}
