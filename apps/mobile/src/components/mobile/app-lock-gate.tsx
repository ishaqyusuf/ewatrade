import { AppLockPinPad } from "@/components/mobile/app-lock-pin-pad"
import { SafeArea } from "@/components/safe-area"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { APP_LOCK_CODE_LENGTH } from "@/lib/app-lock-store"
import { StatusBar } from "expo-status-bar"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Modal, View } from "react-native"

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
  const shouldBlock = auth.isAuthenticated && (!appLock.isHydrated || appLock.isLocked)

  if (!shouldBlock) return null

  return (
    <Modal animationType="fade" presentationStyle="fullScreen" visible>
      <AppLockUnlockScreen isLoading={!appLock.isHydrated} />
    </Modal>
  )
}

function AppLockUnlockScreen({ isLoading }: { isLoading: boolean }) {
  const auth = useAuthContext()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
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
  const hasBiometricsEnabled = !!config?.biometricsEnabled
  const canUseBiometrics =
    hasBiometricsEnabled && biometricsStatus.isAvailable && !isLoading
  const isTemporarilyLocked =
    lockedUntil !== null && new Date(lockedUntil).getTime() > Date.now()
  const helperMessage = useMemo(() => {
    if (isLoading) return "Checking your app lock."
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
    await resetAfterSignOut()
    auth.signOutLocal()
  }, [auth, resetAfterSignOut])

  return (
    <SafeArea style={{ backgroundColor: colors.background }}>
      <StatusBar
        backgroundColor={colors.background}
        style={colorScheme === "dark" ? "light" : "dark"}
      />

      <View className="flex-1 justify-between bg-background px-8 pb-5 pt-8">
        <View className="items-center gap-3">
          <Text className="text-center text-[18px] font-semibold leading-6 text-foreground">
            Enter your PIN code
          </Text>
          <Text className="max-w-[240px] text-center text-[12px] leading-4 text-muted-foreground">
            To continue into {auth.profile?.businessName ?? "the app"}
          </Text>
        </View>

        <View className="items-center gap-6">
          <AppLockPinPad
            codeLength={APP_LOCK_CODE_LENGTH}
            disabled={isLoading || isSubmittingCode || isTemporarilyLocked}
            onBiometricPress={runBiometricUnlock}
            onDeletePress={removeLastDigit}
            onDigitPress={appendDigit}
            showBiometric={canUseBiometrics}
            value={code}
          />

          <Text
            className={
              message || isTemporarilyLocked
                ? "min-h-5 text-center text-[12px] font-medium leading-5 text-destructive"
                : "min-h-5 text-center text-[12px] leading-5 text-muted-foreground"
            }
          >
            {helperMessage}
          </Text>

          <Pressable
            className="min-h-10 items-center justify-center px-4"
            haptic
            onPress={handleForgotCode}
            transition
          >
            <Text className="text-center text-xs font-semibold text-muted-foreground">
              Forgot code? Sign out and reset app lock
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeArea>
  )
}
