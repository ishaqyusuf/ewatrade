import { QaAccountChooser } from "@/components/mobile/qa-account-chooser"
import { useAppLockContext } from "@/hooks/use-app-lock"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import { isCustomerShellPath } from "@/lib/app-lock-route"
import { usePathname, useSegments } from "expo-router"
import { useEffect, useState } from "react"
import { Keyboard, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const DOCK_PATHS = new Set([
  "/admin-home",
  "/catalog",
  "/dashboard",
  "/more",
  "/orders",
  "/sales-rep-home",
])
const ACTION_PATHS = new Set(["/catalog", "/orders"])

export function FloatingQaButton() {
  const qa = useQaAccelerator()
  const { isLocked } = useAppLockContext()
  const pathname = usePathname()
  const segments = useSegments()
  const insets = useSafeAreaInsets()
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible())

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    )
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    )
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  if (
    !qa.clientEnabled ||
    isLocked ||
    keyboardVisible ||
    isCustomerShellPath(segments) ||
    pathname === "/" ||
    pathname === "/onboarding" ||
    pathname === "/verify-email" ||
    pathname.endsWith("-modal") ||
    pathname.startsWith("/order/") ||
    pathname.startsWith("/updates")
  ) {
    return null
  }

  const clearance = DOCK_PATHS.has(pathname)
    ? ACTION_PATHS.has(pathname)
      ? 184
      : 104
    : 16

  return (
    <View
      pointerEvents="box-none"
      style={{
        bottom: Math.max(insets.bottom, 12) + clearance,
        position: "absolute",
        right: Math.max(insets.right, 16),
        zIndex: 50,
      }}
      testID="floating-qa-button"
    >
      <QaAccountChooser />
    </View>
  )
}
