import { Platform } from "react-native"

/**
 * Native-stack `statusBarStyle` for a given platform: Android only. On iOS
 * the app keeps UIViewControllerBasedStatusBarAppearance = NO so
 * expo-status-bar's <StatusBar> (used across the app) can set the style;
 * with that key NO, react-native-screens asserts on any screen
 * `statusBarStyle` (a red box on every push). Every caller also renders
 * <StatusBar style={…} />, which is what iOS uses.
 */
export function statusBarStyleOptionFor(
  style: "light" | "dark",
  os: typeof Platform.OS,
): { statusBarStyle?: "light" | "dark" } {
  return os === "android" ? { statusBarStyle: style } : {}
}

export function nativeStackStatusBarStyle(style: "light" | "dark") {
  return statusBarStyleOptionFor(style, Platform.OS)
}
