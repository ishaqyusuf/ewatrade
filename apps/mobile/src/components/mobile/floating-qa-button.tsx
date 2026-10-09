import { QaAccountChooser } from "@/components/mobile/qa-account-chooser"
import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAuthContext } from "@/hooks/use-auth"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import { usePathname } from "expo-router"
import { useEffect, useState } from "react"
import { Keyboard, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function FloatingQaButton() {
  const qa = useQaAccelerator()
  const { isLocked } = useAppLockContext()
  const { isAuthenticated } = useAuthContext()
  const pathname = usePathname()
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

  // QA profiles are chosen only from the signed-out login screen. Switching to
  // another QA profile means signing out first, so the control never overlaps
  // in-app modals, docks, sync or checkout actions.
  if (
    !qa.clientEnabled ||
    isAuthenticated ||
    isLocked ||
    keyboardVisible ||
    pathname !== "/login"
  ) {
    return null
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        bottom: Math.max(insets.bottom, 12) + 16,
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
