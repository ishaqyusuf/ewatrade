import { AppLockPinPad } from "@/components/mobile/app-lock-pin-pad"
import {
  AppLockQuietSealDeviceNote,
  AppLockQuietSealScreen,
} from "@/components/mobile/app-lock-quiet-seal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAuthContext } from "@/hooks/use-auth"
import { resolveAppLockQuietSealPresentation } from "@/lib/app-lock-quiet-seal-presentation"
import { isCustomerShellPath } from "@/lib/app-lock-route"
import { APP_LOCK_CODE_LENGTH } from "@/lib/app-lock-store"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { useSegments } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Modal, StyleSheet, View } from "react-native"

function normalizeLockCode(value: string) {
  return value.replace(/\D/g, "").slice(0, APP_LOCK_CODE_LENGTH)
}

function formatLockedUntil(value?: string | null) {
  if (!value) return "Try again in a few seconds."

  const remainingMs = new Date(value).getTime() - Date.now()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return "Try again now."
  }

  const seconds = Math.max(1, Math.ceil(remainingMs / 1000))
  return `Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`
}

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

function AppLockUnlockScreen({
  hasHydrationError,
  isLoading,
}: {
  hasHydrationError: boolean
  isLoading: boolean
}) {
  const auth = useAuthContext()
  const marketDay = useMarketDayPalette()
  const {
    biometricsStatus,
    config,
    resetAfterSignOut,
    unlockWithBiometrics,
    unlockWithCode,
  } = useAppLockContext()
  const [biometricPromptAttempted, setBiometricPromptAttempted] =
    useState(false)
  const [code, setCode] = useState("")
  const [isSubmittingCode, setIsSubmittingCode] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState<string | null>(null)
  const presentation = useMemo(
    () =>
      resolveAppLockQuietSealPresentation("unlock", auth.profile?.businessName),
    [auth.profile?.businessName],
  )
  const hasBiometricsEnabled = !!config?.biometricsEnabled
  const canUseBiometrics =
    hasBiometricsEnabled && biometricsStatus.isAvailable && !isLoading
  const isTemporarilyLocked =
    lockedUntil !== null && new Date(lockedUntil).getTime() > Date.now()
  const helperMessage = useMemo(() => {
    if (isLoading) return "Checking your app lock."
    if (hasHydrationError) {
      return "App lock storage is unavailable. Sign out and reset app lock to continue."
    }
    if (message) return message
    if (isTemporarilyLocked) return formatLockedUntil(lockedUntil)
    if (hasBiometricsEnabled && !biometricsStatus.isAvailable) {
      return biometricsStatus.reason ?? "Use your lock code to continue."
    }
    return "Enter your lock code to continue."
  }, [
    biometricsStatus.isAvailable,
    biometricsStatus.reason,
    hasBiometricsEnabled,
    hasHydrationError,
    isLoading,
    isTemporarilyLocked,
    lockedUntil,
    message,
  ])

  const clearEntryFeedback = useCallback(() => {
    setMessage(null)
    if (!isTemporarilyLocked) setLockedUntil(null)
  }, [isTemporarilyLocked])

  const appendDigit = useCallback(
    (digit: string) => {
      setCode((currentCode) => normalizeLockCode(`${currentCode}${digit}`))
      clearEntryFeedback()
    },
    [clearEntryFeedback],
  )

  const removeLastDigit = useCallback(() => {
    setCode((currentCode) => currentCode.slice(0, -1))
    clearEntryFeedback()
  }, [clearEntryFeedback])

  const submitCode = useCallback(async () => {
    if (
      code.length !== APP_LOCK_CODE_LENGTH ||
      isSubmittingCode ||
      isTemporarilyLocked
    ) {
      return
    }

    setIsSubmittingCode(true)
    const result = await unlockWithCode(code)
    setIsSubmittingCode(false)

    if (result.ok) {
      setCode("")
      setMessage(null)
      setLockedUntil(null)
      return
    }

    if (result.reason === "locked") {
      setCode("")
      setLockedUntil(result.lockedUntil ?? null)
      setMessage(formatLockedUntil(result.lockedUntil))
      return
    }

    setCode("")
    setMessage("That lock code did not match.")
  }, [code, isSubmittingCode, isTemporarilyLocked, unlockWithCode])

  const runBiometricUnlock = useCallback(async () => {
    if (!canUseBiometrics) return

    const result = await unlockWithBiometrics()
    if (!result.ok && result.error) {
      setMessage(result.error)
    }
  }, [canUseBiometrics, unlockWithBiometrics])

  useEffect(() => {
    if (code.length === APP_LOCK_CODE_LENGTH) {
      void submitCode()
    }
  }, [code.length, submitCode])

  useEffect(() => {
    if (!canUseBiometrics || biometricPromptAttempted) return

    setBiometricPromptAttempted(true)
    void runBiometricUnlock()
  }, [biometricPromptAttempted, canUseBiometrics, runBiometricUnlock])

  useEffect(() => {
    if (config?.biometricsEnabled) return
    setBiometricPromptAttempted(false)
  }, [config?.biometricsEnabled])

  useEffect(() => {
    if (!lockedUntil) return

    const remainingMs = new Date(lockedUntil).getTime() - Date.now()
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      setLockedUntil(null)
      setMessage(null)
      return
    }

    const timeout = setTimeout(() => {
      setLockedUntil(null)
      setMessage(null)
    }, remainingMs)

    return () => {
      clearTimeout(timeout)
    }
  }, [lockedUntil])

  const handleForgotCode = useCallback(async () => {
    auth.signOutLocal()
    try {
      await resetAfterSignOut()
    } catch {
      // Local sign-out must remain available when secure storage is unavailable.
    }
  }, [auth, resetAfterSignOut])

  return (
    <AppLockQuietSealScreen
      contentStyle={styles.unlockScreen}
      eyebrow={presentation.eyebrow}
      subtitle={presentation.subtitle}
      testID="app-lock-quiet-seal-unlock"
      title={presentation.title}
    >
      <View style={styles.unlockFlow}>
        <AppLockPinPad
          codeLength={APP_LOCK_CODE_LENGTH}
          disabled={
            isLoading ||
            hasHydrationError ||
            isSubmittingCode ||
            isTemporarilyLocked
          }
          onBiometricPress={runBiometricUnlock}
          onDeletePress={removeLastDigit}
          onDigitPress={appendDigit}
          showBiometric={canUseBiometrics}
          value={code}
          variant="quiet-seal"
        />

        <Text
          style={[
            styles.helperMessage,
            {
              color:
                message || isTemporarilyLocked
                  ? marketDay.paprika
                  : marketDay.mutedInk,
            },
          ]}
        >
          {helperMessage}
        </Text>

        <Pressable
          accessibilityRole="button"
          haptic
          onPress={handleForgotCode}
          style={({ pressed }) => [
            styles.forgotButton,
            {
              backgroundColor: pressed ? marketDay.softBand : marketDay.canvas,
              borderBottomColor: marketDay.line,
            },
          ]}
          transition
        >
          <Text
            style={[styles.forgotButtonText, { color: marketDay.mutedInk }]}
          >
            Forgot code? Sign out and reset app lock
          </Text>
        </Pressable>
      </View>

      <AppLockQuietSealDeviceNote>
        Your PIN never leaves this phone
      </AppLockQuietSealDeviceNote>
    </AppLockQuietSealScreen>
  )
}

const styles = StyleSheet.create({
  forgotButton: {
    alignItems: "center",
    borderBottomWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  forgotButtonText: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
  },
  helperMessage: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    minHeight: 36,
    textAlign: "center",
  },
  unlockFlow: {
    alignItems: "center",
    gap: 20,
    width: "100%",
  },
  unlockScreen: {
    justifyContent: "space-between",
  },
})
