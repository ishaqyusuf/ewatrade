import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAuthContext } from "@/hooks/use-auth"
import { useCallback } from "react"
import { Alert } from "react-native"

export const APP_LOCK_FORGOT_PIN_LABEL = "Forgot PIN? Sign out and reset"

/** Confirms, then signs out locally and clears this phone's App lock. */
export function useForgotPin() {
  const auth = useAuthContext()
  const { resetAfterSignOut } = useAppLockContext()

  const signOutAndReset = useCallback(async () => {
    auth.signOutLocal()
    try {
      await resetAfterSignOut()
    } catch {
      // Local sign-out must remain available when secure storage is unavailable.
    }
  }, [auth, resetAfterSignOut])

  return useCallback(() => {
    Alert.alert(
      "Sign out and reset app lock?",
      "You will need to sign in again. Pending work remains on this device; keep this installation until it is synced.",
      [
        { text: "Keep app locked", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => void signOutAndReset(),
        },
      ],
    )
  }, [signOutAndReset])
}
