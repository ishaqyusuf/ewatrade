import FontAwesome from "@expo/vector-icons/FontAwesome";
import { ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";
import "@/styles/global.css";
import { AuthProvider, useCreateAuthContext } from "@/hooks/use-auth";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ToastProviderWithViewport } from "@/components/ui/toast";
import { useColorScheme } from "@/hooks/use-color";
import { NAV_THEME } from "@/lib/theme";
import { getThemeOverride } from "@/lib/theme-preference";
import { TRPCReactProvider } from "@/trpc/client";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import FlashMessage from "react-native-flash-message";
import { KeyboardProvider } from "react-native-keyboard-controller";
import Toast from "react-native-toast-message";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  initialRouteName: "index",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}
const InitialLayout = () => {
  const { colorScheme } = useColorScheme();
  const navigationTheme =
    colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;

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
          <Stack.Screen name="dashboard" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <Toast />
      </TRPCReactProvider>
    </>
  );
};
function RootLayoutNav() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const auth = useCreateAuthContext();
  const navigationTheme =
    colorScheme === "dark" ? NAV_THEME.dark : NAV_THEME.light;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const override = await getThemeOverride();
      if (!mounted) return;
      setColorScheme(override);
    })();
    return () => {
      mounted = false;
    };
  }, [setColorScheme]);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <View className="flex-1 bg-background">
          <ThemeProvider value={navigationTheme}>
            <AuthProvider value={auth}>
              <ToastProviderWithViewport>
                <BottomSheetModalProvider>
                  <FlashMessage position="top" />
                  <InitialLayout />
                </BottomSheetModalProvider>
              </ToastProviderWithViewport>
            </AuthProvider>
          </ThemeProvider>
        </View>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
