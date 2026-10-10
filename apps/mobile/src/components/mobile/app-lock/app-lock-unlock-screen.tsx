import { AppLockPinPad } from "@/components/mobile/app-lock-pin-pad"
import { MarketDayAppLockScreen } from "@/components/mobile/appearances/market-day/app-lock-screen"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAppLockCountdown } from "@/hooks/use-app-lock-countdown"
import { useAuthContext } from "@/hooks/use-auth"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import {
  appLockBiometricName,
  appLockLockoutMessage,
  appLockOpenSubtitle,
  appLockSecondsUntil,
  appLockTriesLeft,
  appLockWelcomeTitle,
  appLockWrongPinMessage,
} from "@/lib/app-lock-messages"
import { resolveAppLockQuietSealPresentation } from "@/lib/app-lock-quiet-seal-presentation"
import {
  APP_LOCK_CODE_LENGTH,
  APP_LOCK_MAX_FAILED_ATTEMPTS,
} from "@/lib/app-lock-store"
import { useCallback, useEffect, useMemo, useState } from "react"
import { PinEntryScreen } from "./pin-entry-screen"
import { APP_LOCK_FORGOT_PIN_LABEL, useForgotPin } from "./use-forgot-pin"

function normalizeLockCode(value: string) {
  return value.replace(/\D/g, "").slice(0, APP_LOCK_CODE_LENGTH)
}

export function AppLockUnlockScreen({
  hasHydrationError,
  isLoading,
}: {
  hasHydrationError: boolean
  isLoading: boolean
}) {
  const auth = useAuthContext()
  const design = useMobileDesign("app-lock")
  const forgotPin = useForgotPin()
  const { biometricsStatus, config, unlockWithBiometrics, unlockWithCode } =
    useAppLockContext()
  const [biometricPromptAttempted, setBiometricPromptAttempted] =
    useState(false)
  const [code, setCode] = useState("")
  const [isSubmittingBiometrics, setIsSubmittingBiometrics] = useState(false)
  const [isSubmittingCode, setIsSubmittingCode] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isWrongPin, setIsWrongPin] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<string | null>(null)
  const lockoutSeconds = useAppLockCountdown(lockedUntil)
  const presentation = useMemo(
    () =>
      resolveAppLockQuietSealPresentation("unlock", auth.profile?.businessName),
    [auth.profile?.businessName],
  )
  const biometricName = appLockBiometricName(biometricsStatus.label)
  const hasBiometricsEnabled = !!config?.biometricsEnabled
  const canUseBiometrics =
    hasBiometricsEnabled && biometricsStatus.isAvailable && !isLoading
  const isTemporarilyLocked = lockoutSeconds > 0
  const helperMessage = useMemo(() => {
    if (isLoading) return "Checking your app lock."
    if (isSubmittingBiometrics) return `Checking ${biometricName}.`
    if (isSubmittingCode) return "Checking your PIN."
    if (hasHydrationError) {
      return "App lock storage is unavailable. Sign out and reset app lock to continue."
    }
    if (isTemporarilyLocked) return appLockLockoutMessage(lockoutSeconds)
    if (message) return message
    if (hasBiometricsEnabled && !biometricsStatus.isAvailable) {
      return biometricsStatus.reason ?? "Use your PIN to continue."
    }
    return null
  }, [
    biometricName,
    biometricsStatus.isAvailable,
    biometricsStatus.reason,
    hasBiometricsEnabled,
    hasHydrationError,
    isLoading,
    isSubmittingBiometrics,
    isSubmittingCode,
    isTemporarilyLocked,
    lockoutSeconds,
    message,
  ])

  // A lockout survives a restart: pick up the stored deadline.
  useEffect(() => {
    if (appLockSecondsUntil(config?.lockedUntil) > 0) {
      setLockedUntil(config?.lockedUntil ?? null)
    }
  }, [config?.lockedUntil])

  const clearEntryFeedback = useCallback(() => {
    setMessage(null)
    setIsWrongPin(false)
  }, [])

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
    setCode("")

    if (result.ok) {
      setMessage(null)
      setIsWrongPin(false)
      setLockedUntil(null)
      return
    }

    setIsWrongPin(true)
    if (result.reason === "locked") {
      setLockedUntil(result.lockedUntil ?? null)
      setMessage(null)
      return
    }

    setMessage(
      appLockWrongPinMessage(
        appLockTriesLeft(
          result.config?.failedAttemptCount,
          APP_LOCK_MAX_FAILED_ATTEMPTS,
        ),
      ),
    )
  }, [code, isSubmittingCode, isTemporarilyLocked, unlockWithCode])

  const runBiometricUnlock = useCallback(async () => {
    if (!canUseBiometrics || isSubmittingBiometrics) return

    setIsSubmittingBiometrics(true)
    try {
      const result = await unlockWithBiometrics()
      if (!result.ok && result.error) {
        setMessage(result.error)
      }
    } catch {
      setMessage("Biometric unlock could not be completed.")
    } finally {
      setIsSubmittingBiometrics(false)
    }
  }, [canUseBiometrics, isSubmittingBiometrics, unlockWithBiometrics])

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

  const pinDisabled =
    isLoading ||
    hasHydrationError ||
    isSubmittingBiometrics ||
    isSubmittingCode ||
    isTemporarilyLocked

  if (design !== "market-day") {
    return (
      <PinEntryScreen
        biometricLabel={biometricsStatus.label}
        disabled={pinDisabled}
        error={(isWrongPin && !!message) || hasHydrationError}
        footer={{
          kind: "action",
          label: APP_LOCK_FORGOT_PIN_LABEL,
          onPress: forgotPin,
        }}
        glyph="brand"
        message={helperMessage}
        onBiometricPress={runBiometricUnlock}
        onDeletePress={removeLastDigit}
        onDigitPress={appendDigit}
        showBiometric={canUseBiometrics}
        subtitle={appLockOpenSubtitle(auth.profile?.businessName)}
        testID="app-lock-unlock-gate"
        title={appLockWelcomeTitle(auth.profile?.name)}
        value={code}
      />
    )
  }

  return (
    <MarketDayAppLockScreen
      mode="unlock"
      eyebrow={presentation.eyebrow}
      subtitle={presentation.subtitle}
      title={presentation.title}
      pinpad={
        <AppLockPinPad
          codeLength={APP_LOCK_CODE_LENGTH}
          disabled={pinDisabled}
          onBiometricPress={runBiometricUnlock}
          onDeletePress={removeLastDigit}
          onDigitPress={appendDigit}
          showBiometric={canUseBiometrics}
          value={code}
          variant="quiet-seal"
        />
      }
      feedback={
        <Text
          accessibilityLiveRegion="polite"
          className={
            message || isTemporarilyLocked
              ? "min-h-9 text-center text-xs font-semibold leading-[18px] text-market-paprika"
              : "min-h-9 text-center text-xs font-semibold leading-[18px] text-market-muted-ink"
          }
        >
          {helperMessage ?? "Enter your PIN to continue."}
        </Text>
      }
      recovery={
        <Pressable
          accessibilityRole="button"
          haptic
          onPress={forgotPin}
          transition
          className="min-h-12 items-center justify-center border-b border-market-line bg-market-canvas px-3 py-2.5 active:bg-market-soft-band"
        >
          <Text className="text-center text-xs font-bold leading-[18px] text-market-muted-ink">
            {APP_LOCK_FORGOT_PIN_LABEL}
          </Text>
        </Pressable>
      }
    />
  )
}
