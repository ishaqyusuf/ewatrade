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
import { AccountAgeStartupGate } from "@/components/mobile/account-age-startup-gate"
import { AppLockGate } from "@/components/mobile/app-lock-gate"
import { FloatingQaButton } from "@/components/mobile/floating-qa-button"
import { QaAuthorizationSheet } from "@/components/mobile/qa-authorization-sheet"
import { StartupSplashGate } from "@/components/mobile/startup-splash-gate"
import { ToastProviderWithViewport } from "@/components/ui/toast"
import { applyThemeOverride, useColorScheme } from "@/hooks/use-color"
import { OrderVisibilityReconciler } from "@/hooks/use-order-visibility"
import { QaAcceleratorProvider } from "@/hooks/use-qa-accelerator"
import { canAccessAdminTabs } from "@/lib/admin-navigation"
import { isCustomerShellPath } from "@/lib/app-lock-route"
import {
  canEditMobileCatalog,
  isInvitedStaffProfile,
  isSalesRepRole,
} from "@/lib/mobile-roles"
import { nativewindThemeVars } from "@/lib/nativewind-theme-vars"
import { stackTransitions } from "@/lib/screen-transitions"
import { NAV_THEME } from "@/lib/theme"
import { getThemeOverride } from "@/lib/theme-preference"
import { initMobileObservability } from "@/observability/sentry"
import { hydrateMobileDesign } from "@/store/mobile-design-store"
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

const transitions = stackTransitions(Platform.OS)
const modalOptions = { headerShown: false, ...transitions.modal }
const gateOptions = { headerShown: false, ...transitions.gate }

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
    void Promise.all([
      getThemeOverride()
        .then(applyThemeOverride)
        .catch(() => applyThemeOverride("system")),
      hydrateMobileDesign(),
    ]).finally(() => {
      if (mounted) setThemeReady(true)
    })
    return () => {
      mounted = false
    }
  }, [])

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
  const canEditCatalog = canEditMobileCatalog(profile)
  const canManageTenant =
    profile?.role?.trim().toUpperCase() === "OWNER" ||
    profile?.role?.trim().toUpperCase() === "ADMIN"

  return (
    <>
      <OfflinePolicyReconciler />
      <OrderVisibilityReconciler />
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

      <Stack
        screenOptions={{
          ...transitions.push,
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
        <Stack.Screen name="index" options={gateOptions} />
        <Stack.Screen name="(customer)" options={gateOptions} />
        <Stack.Screen name="onboarding" options={gateOptions} />
        <Stack.Screen name="continue-onboarding" options={gateOptions} />
        <Stack.Screen name="login" options={gateOptions} />
        <Stack.Screen name="sign-up" options={gateOptions} />
        <Stack.Screen name="verify-email" options={gateOptions} />
        <Stack.Screen name="staff-onboarding" options={gateOptions} />
        <Stack.Protected
          guard={isAuthenticated && !isInvitedStaff && canAccessAdmin}
        >
          <Stack.Screen name="(admin-tabs)" options={gateOptions} />

          <Stack.Screen name="business-switch-modal" options={modalOptions} />
          <Stack.Screen
            name="new-business-onboarding-modal"
            options={modalOptions}
          />

          <Stack.Screen name="reports-modal" options={modalOptions} />
          <Stack.Screen name="payments-received-modal" options={modalOptions} />
          <Stack.Screen name="stock-intake-modal" options={modalOptions} />
          <Stack.Screen name="staff-invite-modal" options={modalOptions} />
          <Stack.Screen name="unit-conversion-modal" options={modalOptions} />
        </Stack.Protected>
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="no-access" options={gateOptions} />
          <Stack.Screen
            name="account-privacy"
            options={{ headerShown: false }}
          />
        </Stack.Protected>
        <Stack.Protected
          guard={
            isAuthenticated &&
            !isInvitedStaff &&
            (canAccessAdmin || canEditCatalog)
          }
        >
          <Stack.Screen
            name="catalog-item/[catalogItemId]"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="catalog-items-modal" options={modalOptions} />
        </Stack.Protected>
        <Stack.Protected
          guard={isAuthenticated && !isInvitedStaff && canEditCatalog}
        >
          <Stack.Screen
            name="first-product-setup-modal"
            options={modalOptions}
          />
        </Stack.Protected>
        <Stack.Protected
          guard={isAuthenticated && !isInvitedStaff && canManageTenant}
        >
          <Stack.Screen name="customer-ledger-modal" options={modalOptions} />
          <Stack.Screen
            name="customer-ledger/[customerId]"
            options={modalOptions}
          />
          <Stack.Screen
            name="customer-ledger-action/[accountId]"
            options={modalOptions}
          />
          <Stack.Screen name="finance-modal" options={modalOptions} />
          <Stack.Screen name="finance-accounts-modal" options={modalOptions} />
          <Stack.Screen name="finance-bank-modal" options={modalOptions} />
          <Stack.Screen
            name="finance-bank-import-modal"
            options={{ ...modalOptions, gestureEnabled: false }}
          />
          <Stack.Screen
            name="finance-bank/[statementId]"
            options={modalOptions}
          />
          <Stack.Screen
            name="finance-bank-source/[entryId]"
            options={modalOptions}
          />
          <Stack.Screen name="finance-reports-modal" options={modalOptions} />
          <Stack.Screen name="finance-periods-modal" options={modalOptions} />
          <Stack.Screen
            name="finance-report-account/[accountId]"
            options={modalOptions}
          />
          <Stack.Screen name="finance-counts-modal" options={modalOptions} />
          <Stack.Screen name="finance-count/[countId]" options={modalOptions} />
          <Stack.Screen
            name="finance-account/[accountId]"
            options={modalOptions}
          />
          <Stack.Screen
            name="finance-movement/[entryId]"
            options={modalOptions}
          />
          <Stack.Screen
            name="finance-expense/[billId]"
            options={modalOptions}
          />
          <Stack.Screen name="subscription-modal" options={modalOptions} />
          <Stack.Screen name="domain-management-modal" options={modalOptions} />
          <Stack.Screen
            name="order-reminder-settings-modal"
            options={modalOptions}
          />
          <Stack.Screen name="receipt-settings-modal" options={modalOptions} />
        </Stack.Protected>
        <Stack.Protected
          guard={isAuthenticated && !isInvitedStaff && isSalesRep}
        >
          <Stack.Screen name="sales-rep-home" options={gateOptions} />
          <Stack.Screen name="your-sales" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={isAuthenticated && !isInvitedStaff}>
          <Stack.Screen name="order-receipts-modal" options={modalOptions} />
          <Stack.Screen name="app-lock-modal" options={modalOptions} />
          <Stack.Screen name="updates" options={{ headerShown: false }} />
          <Stack.Screen name="create-sale-modal" options={modalOptions} />
          <Stack.Screen name="global-search" options={modalOptions} />
          <Stack.Screen
            name="operation-success"
            options={{
              fullScreenGestureEnabled: true,
              gestureEnabled: true,
              headerShown: false,
            }}
          />
          <Stack.Screen name="service-jobs-modal" options={modalOptions} />
          <Stack.Screen name="customer-book-modal" options={modalOptions} />
          <Stack.Screen
            name="order/[orderId]"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="closeout-modal" options={modalOptions} />
          <Stack.Screen name="sync-status-modal" options={modalOptions} />
          <Stack.Screen name="dashboard" options={gateOptions} />
        </Stack.Protected>
        <Stack.Screen name="+not-found" />
      </Stack>
      <QaAuthorizationSheet />
      <Toast />
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
  const scopedStaff =
    profile?.staffAccessMode === "SCOPED" &&
    !["OWNER", "ADMIN"].includes(profile?.role ?? "")
  const settings = useQuery(
    trpc.offline.settings.queryOptions(undefined, {
      enabled:
        !scopedStaff &&
        !customerShell &&
        isAuthenticated &&
        Boolean(profile?.businessId),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      retry: false,
    }),
  )
  const replay = useMutation(
    trpc.offline.replay.mutationOptions({
      onSuccess: async (results) => {
        commandState.applyReplayResults(results)
        await queryClient.invalidateQueries(
          trpc.stores.orderVisibility.queryFilter(),
        )
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
    if (!profile?.businessId) return
    if (scopedStaff) {
      setOfflineAccess(profile.businessId, false)
      return
    }
    if (!settings.data) return
    setOfflineAccess(profile.businessId, settings.data.enabled)
  }, [
    customerShell,
    profile?.businessId,
    scopedStaff,
    setOfflineAccess,
    settings.data,
  ])

  useEffect(() => {
    if (
      scopedStaff ||
      customerShell ||
      isOfflineMode ||
      !reconciliationSignature
    ) {
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
    scopedStaff,
    register.mutate,
    replay.mutate,
    settings.data?.enabled,
  ])

  return null
}
function RootLayoutNav() {
  const { colorScheme } = useColorScheme()
  const [hasPresentedStartupSplash, setHasPresentedStartupSplash] =
    useState(false)
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
          <View className="flex-1 bg-background" testID="ewatrade-react-root">
            <ThemeProvider value={navigationTheme}>
              <AuthProvider value={auth}>
                <TRPCReactProvider>
                  <AccountAgeStartupGate>
                    <QaAcceleratorProvider>
                      <AppLockProvider>
                        <ToastProviderWithViewport>
                          <BottomSheetModalProvider>
                            {hasPresentedStartupSplash ? (
                              <>
                                <FlashMessage position="top" />
                                <InitialLayout />
                                <AppLockGate />
                                <AppAutoUpdateModal />
                                <FloatingQaButton />
                              </>
                            ) : (
                              <StartupSplashGate
                                onComplete={() =>
                                  setHasPresentedStartupSplash(true)
                                }
                              />
                            )}
                          </BottomSheetModalProvider>
                        </ToastProviderWithViewport>
                      </AppLockProvider>
                    </QaAcceleratorProvider>
                  </AccountAgeStartupGate>
                </TRPCReactProvider>
              </AuthProvider>
            </ThemeProvider>
          </View>
        </VariableContextProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}

export default Sentry.wrap(RootLayout)
