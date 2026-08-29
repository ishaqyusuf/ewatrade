import FontAwesome from "@expo/vector-icons/FontAwesome"
import { ThemeProvider } from "@react-navigation/native"
import * as Sentry from "@sentry/react-native"
import { useFonts } from "expo-font"
import { Stack, useSegments } from "expo-router"
import * as SplashScreen from "expo-splash-screen"
import { useEffect, useMemo, useState } from "react"
import "react-native-reanimated"
import "@/styles/global.css"
import { AppLockProvider } from "@/hooks/use-app-lock"
import {
  AuthProvider,
  useAuthContext,
  useCreateAuthContext,
} from "@/hooks/use-auth"
import { GestureHandlerRootView } from "react-native-gesture-handler"

import { AppAutoUpdateModal } from "@/components/app-auto-update-modal"
import { FloatingThemeToggle } from "@/components/mobile"
import { AppLockGate } from "@/components/mobile/app-lock-gate"
import { ToastProviderWithViewport } from "@/components/ui/toast"
import { applyThemeOverride, useColorScheme } from "@/hooks/use-color"
import { canAccessAdminTabs } from "@/lib/admin-navigation"
import { isCustomerShellPath } from "@/lib/app-lock-route"
import { shouldShowFloatingThemeToggle } from "@/lib/app-variant"
import { isInvitedStaffProfile, isSalesRepRole } from "@/lib/mobile-roles"
import { nativewindThemeVars } from "@/lib/nativewind-theme-vars"
import { NAV_THEME } from "@/lib/theme"
import { getThemeOverride } from "@/lib/theme-preference"
import { initMobileObservability } from "@/observability/sentry"
import {
  pendingOfflineCommands,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { TRPCReactProvider, useTRPC } from "@/trpc/client"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Constants from "expo-constants"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { useRef } from "react"
import { Platform, View } from "react-native"
import FlashMessage from "react-native-flash-message"
import { KeyboardProvider } from "react-native-keyboard-controller"
import Toast from "react-native-toast-message"

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router"

export const unstable_settings = {
  initialRouteName: "index",
}

initMobileObservability()

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

function RootLayout() {
  const [themeReady, setThemeReady] = useState(false)
  const [loaded, error] = useFonts({
    SpaceMono: require("../../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  })

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error
  }, [error])

  useEffect(() => {
    let mounted = true
    void getThemeOverride()
      .then(applyThemeOverride)
      .catch(() => applyThemeOverride("system"))
      .finally(() => {
        if (mounted) setThemeReady(true)
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (loaded && themeReady) {
      SplashScreen.hideAsync()
    }
  }, [loaded, themeReady])

  if (!loaded || !themeReady) {
    return null
  }

  return <RootLayoutNav />
}
const InitialLayout = () => {
  const { colorScheme } = useColorScheme()
  const { isAuthenticated, profile } = useAuthContext()
  const navigationTheme =
    colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light
  const isInvitedStaff = isInvitedStaffProfile(profile)
  const isSalesRep = isSalesRepRole(profile?.role)
  const canAccessAdmin = canAccessAdminTabs(profile?.role)
  const canManageTenant =
    profile?.role?.trim().toUpperCase() === "OWNER" ||
    profile?.role?.trim().toUpperCase() === "ADMIN"

  return (
    <>
      <TRPCReactProvider>
        <OfflinePolicyReconciler />
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: {
              backgroundColor: navigationTheme.colors.background,
            },
            headerTintColor: navigationTheme.colors.text,
            headerTitleStyle: {
              color: navigationTheme.colors.text,
            },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(customer)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="sign-up" options={{ headerShown: false }} />
          <Stack.Screen name="verify-email" options={{ headerShown: false }} />
          <Stack.Screen
            name="qa-session/[payload]"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="design-system" options={{ headerShown: false }} />
          <Stack.Screen
            name="design-system-pattern"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="staff-onboarding"
            options={{ headerShown: false }}
          />
          <Stack.Protected
            guard={isAuthenticated && !isInvitedStaff && canAccessAdmin}
          >
            <Stack.Screen
              name="(admin-tabs)"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="catalog-item/[catalogItemId]"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="business-switch-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="new-business-onboarding-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="catalog-items-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="first-product-setup-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="reports-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="payments-received-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="stock-intake-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="staff-invite-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="unit-conversion-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
          </Stack.Protected>
          <Stack.Protected
            guard={isAuthenticated && !isInvitedStaff && canManageTenant}
          >
            <Stack.Screen
              name="subscription-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="domain-management-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="order-reminder-settings-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
          </Stack.Protected>
          <Stack.Protected
            guard={isAuthenticated && !isInvitedStaff && isSalesRep}
          >
            <Stack.Screen
              name="sales-rep-home"
              options={{ headerShown: false }}
            />
          </Stack.Protected>
          <Stack.Protected guard={isAuthenticated && !isInvitedStaff}>
            <Stack.Screen
              name="app-lock-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen name="updates" options={{ headerShown: false }} />
            <Stack.Screen
              name="create-sale-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="global-search"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="operation-success"
              options={{
                fullScreenGestureEnabled: true,
                gestureEnabled: true,
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="service-jobs-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="customer-book-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="order/[orderId]"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="closeout-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="sync-status-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen name="dashboard" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Screen name="+not-found" />
        </Stack>
        <Toast />
      </TRPCReactProvider>
    </>
  )
}

function OfflinePolicyReconciler() {
  const customerShell = isCustomerShellPath(useSegments())
  const { isAuthenticated, profile } = useAuthContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const commandState = useOfflineCommandStore()
  const isOfflineMode = useOperationalModeStore((state) => state.isOfflineMode)
  const setActiveBusiness = useOperationalModeStore(
    (state) => state.setActiveBusiness,
  )
  const setOfflineAccess = useOperationalModeStore(
    (state) => state.setOfflineAccess,
  )
  const settings = useQuery(
    trpc.offline.settings.queryOptions(undefined, {
      enabled:
        !customerShell && isAuthenticated && Boolean(profile?.businessId),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      retry: false,
    }),
  )
  const replay = useMutation(
    trpc.offline.replay.mutationOptions({
      onSuccess: async (results) => {
        commandState.applyReplayResults(results)
        await Promise.all([
          queryClient.invalidateQueries(trpc.offline.conflicts.queryFilter()),
          queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
          queryClient.invalidateQueries(
            trpc.catalog.listItemsPage.queryFilter(),
          ),
          queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
          queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
          ),
        ])
      },
    }),
  )
  const register = useMutation(
    trpc.offline.registerDevice.mutationOptions({
      onSuccess: () => {
        const commands = pendingOfflineCommands(
          commandState,
          profile?.businessId,
        )
        if (commands.length === 0) return
        replay.mutate({
          commands,
          deviceId: commandState.deviceId,
        })
      },
    }),
  )
  const pending = pendingOfflineCommands(commandState, profile?.businessId)
  const commandsToSync = pending.filter((command) => {
    if (settings.data?.enabled) return true
    const localCommand = commandState.commands.find(
      (candidate) => candidate.clientCommandId === command.clientCommandId,
    )
    return (
      localCommand?.localStatus === "approval" ||
      localCommand?.localStatus === "review"
    )
  })
  const hasRemoteReview = commandsToSync.some((command) =>
    commandState.commands.some(
      (candidate) =>
        candidate.clientCommandId === command.clientCommandId &&
        (candidate.localStatus === "approval" ||
          candidate.localStatus === "review"),
    ),
  )
  const pendingSignature = commandsToSync
    .map((command) => {
      const localCommand = commandState.commands.find(
        (candidate) => candidate.clientCommandId === command.clientCommandId,
      )
      return `${command.clientCommandId}:${localCommand?.localStatus ?? "pending"}`
    })
    .join("|")
  const reconciliationSignature = hasRemoteReview
    ? `${pendingSignature}:${settings.dataUpdatedAt}`
    : pendingSignature
  const lastAttemptSignature = useRef("")

  useEffect(() => {
    if (customerShell) return
    setActiveBusiness(profile?.businessId ?? null)
  }, [customerShell, profile?.businessId, setActiveBusiness])

  useEffect(() => {
    if (customerShell) return
    if (!profile?.businessId || !settings.data) return
    setOfflineAccess(profile.businessId, settings.data.enabled)
  }, [customerShell, profile?.businessId, setOfflineAccess, settings.data])

  useEffect(() => {
    if (customerShell || isOfflineMode || !reconciliationSignature) {
      lastAttemptSignature.current = ""
      return
    }
    if (lastAttemptSignature.current === reconciliationSignature) return
    lastAttemptSignature.current = reconciliationSignature
    if (!settings.data?.enabled) {
      replay.mutate({
        commands: commandsToSync,
        deviceId: commandState.deviceId,
      })
      return
    }
    register.mutate({
      appVersion: Constants.expoConfig?.version,
      deviceId: commandState.deviceId,
      deviceName: `${Platform.OS} device`,
      platform:
        Platform.OS === "ios" ||
        Platform.OS === "android" ||
        Platform.OS === "web"
          ? Platform.OS
          : "unknown",
    })
  }, [
    commandState.deviceId,
    commandsToSync,
    customerShell,
    isOfflineMode,
    reconciliationSignature,
    register.mutate,
    replay.mutate,
    settings.data?.enabled,
  ])

  return null
}
function RootLayoutNav() {
  const { colorScheme } = useColorScheme()
  const auth = useCreateAuthContext()
  const navigationTheme =
    colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light
  const themeVariables = useMemo(
    () => nativewindThemeVars(colorScheme),
    [colorScheme],
  )

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <VariableContextProvider value={themeVariables}>
          <View className="flex-1 bg-background">
            <ThemeProvider value={navigationTheme}>
              <AuthProvider value={auth}>
                <AppLockProvider>
                  <ToastProviderWithViewport>
                    <BottomSheetModalProvider>
                      <FlashMessage position="top" />
                      <InitialLayout />
                      <AppLockGate />
                      <AppAutoUpdateModal />
                      {shouldShowFloatingThemeToggle() ? (
                        <FloatingThemeToggle />
                      ) : null}
                    </BottomSheetModalProvider>
                  </ToastProviderWithViewport>
                </AppLockProvider>
              </AuthProvider>
            </ThemeProvider>
          </View>
        </VariableContextProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}

export default Sentry.wrap(RootLayout)
