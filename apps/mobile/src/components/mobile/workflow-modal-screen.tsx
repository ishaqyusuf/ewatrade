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
  /** Shows a back arrow that returns to the previous screen. */
  back?: boolean
  children: ReactNode
  closeLabel: string
  hideHeader: boolean
  keyboardBottomOffset: number
  /** A short line under the centred title, e.g. "NGN account". */
  subtitle?: string
  title: string
  onClose: () => void
}

type WorkflowModalScreenProps = {
  back?: boolean
  chrome?: ComponentType<WorkflowModalChromeProps>
  allowSalesRep?: boolean
  children: ReactNode
  closeHref?:
    | "/admin-home"
    | "/business-switch-modal"
    | "/dashboard"
    | "/finance-modal"
    | "/finance-accounts-modal"
    | "/finance-bank-modal"
    | "/finance-reports-modal"
    | "/finance-counts-modal"
    | "/sales-rep-home"
  closeLabel: string
  hideHeader?: boolean
  keyboardBottomOffset?: number
  subtitle?: string
  title: string
}

export function WorkflowModalScreen({
  allowSalesRep = false,
  back = false,
  chrome: Chrome = DefaultWorkflowModalChrome,
  children,
  closeHref = "/dashboard",
  closeLabel,
  hideHeader = false,
  keyboardBottomOffset = 140,
  subtitle,
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
      back={back}
      closeLabel={closeLabel}
      hideHeader={hideHeader}
      keyboardBottomOffset={keyboardBottomOffset}
      subtitle={subtitle}
      title={title}
      onClose={() =>
        back && router.canGoBack() ? router.back() : router.replace(closeHref)
      }
    >
      {children}
    </Chrome>
  )
}

function DefaultWorkflowModalChrome({
  back,
  children,
  closeLabel,
  hideHeader,
  keyboardBottomOffset,
  subtitle,
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
        contentClassName="px-0 pt-2 pb-0"
        contentContainerStyle={{ paddingBottom: 0 }}
        keyboardBottomOffset={keyboardBottomOffset}
        scroll={false}
      >
        {hideHeader ? null : (
          // Green Till: X on the left, centred title, balancing spacer.
          <View className="mb-3.5 flex-row items-center gap-2.5 px-4">
            <Pressable
              accessibilityLabel={closeLabel}
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
              haptic
              onPress={onClose}
              transition
            >
              <Icon
                className={
                  back
                    ? "size-[20px] text-foreground"
                    : "size-[18px] text-foreground"
                }
                name={back ? "ArrowLeft" : "X"}
              />
            </Pressable>
            <View className="min-w-0 flex-1 items-center">
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                className="text-center text-base font-extrabold tracking-tight text-foreground"
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  numberOfLines={1}
                  className="text-center text-xs text-muted-foreground"
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <View className="size-11" />
          </View>
        )}
        <View className="min-h-0 flex-1">{children}</View>
      </MobileScreen>
    </View>
  )
}
