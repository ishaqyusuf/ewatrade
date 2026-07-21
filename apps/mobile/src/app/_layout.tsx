import FontAwesome from "@expo/vector-icons/FontAwesome"
import { ThemeProvider } from "@react-navigation/native"
import { useFonts } from "expo-font"
import { Stack } from "expo-router"
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
import { shouldShowFloatingThemeToggle } from "@/lib/app-variant"
import { canAccessAdminTabs } from "@/lib/admin-navigation"
import { isInvitedStaffProfile, isSalesRepRole } from "@/lib/mobile-roles"
import { nativewindThemeVars } from "@/lib/nativewind-theme-vars"
import { NAV_THEME } from "@/lib/theme"
import { getThemeOverride } from "@/lib/theme-preference"
import { TRPCReactProvider } from "@/trpc/client"
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { View } from "react-native"
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

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
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
          <Stack.Protected guard={isAuthenticated && !isInvitedStaff && canAccessAdmin}>
            <Stack.Screen name="(admin-tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="business-switch-modal"
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
              name="service-jobs-modal"
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen
              name="customer-book-modal"
              options={{ headerShown: false, presentation: "modal" }}
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
