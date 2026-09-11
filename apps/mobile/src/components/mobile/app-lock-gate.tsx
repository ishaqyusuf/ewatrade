import { AppLockUnlockScreen } from "@/components/mobile/app-lock/app-lock-unlock-screen"
import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAuthContext } from "@/hooks/use-auth"
import { isCustomerShellPath } from "@/lib/app-lock-route"
import { useSegments } from "expo-router"
import { Modal } from "react-native"

export function AppLockGate() {
  const auth = useAuthContext()
  const appLock = useAppLockContext()
  const segments = useSegments()
  const shouldBlock =
    auth.isAuthenticated &&
    !isCustomerShellPath(segments) &&
    (!appLock.isHydrated || appLock.isLocked)

  if (!shouldBlock) return null

  return (
    <Modal animationType="fade" presentationStyle="fullScreen" visible>
      <AppLockUnlockScreen
        hasHydrationError={appLock.hydrationError}
        isLoading={!appLock.isHydrated}
      />
    </Modal>
  )
}
