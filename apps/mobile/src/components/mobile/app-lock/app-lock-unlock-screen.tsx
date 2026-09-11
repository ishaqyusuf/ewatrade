import { AppLockPinPad } from "@/components/mobile/app-lock-pin-pad"
import { ClassicAppLockScreen } from "@/components/mobile/appearances/classic/app-lock-screen"
import { MarketDayAppLockScreen } from "@/components/mobile/appearances/market-day/app-lock-screen"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAuthContext } from "@/hooks/use-auth"
import { resolveAppLockQuietSealPresentation } from "@/lib/app-lock-quiet-seal-presentation"
import { APP_LOCK_CODE_LENGTH } from "@/lib/app-lock-store"
import { useCallback, useEffect, useMemo, useState } from "react"

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

export function AppLockUnlockScreen({
  hasHydrationError,
  isLoading,
}: {
  hasHydrationError: boolean
  isLoading: boolean
}) {
  const auth = useAuthContext()
  const design = useMobileDesign("app-lock")
  const Presentation =
    design === "market-day" ? MarketDayAppLockScreen : ClassicAppLockScreen
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
  const [isSubmittingBiometrics, setIsSubmittingBiometrics] = useState(false)
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
    if (isSubmittingBiometrics) return "Checking fingerprint."
    if (isSubmittingCode) return "Checking your lock code."
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
    isSubmittingBiometrics,
    isSubmittingCode,
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
    if (!canUseBiometrics || isSubmittingBiometrics) return

    setIsSubmittingBiometrics(true)
    try {
      const result = await unlockWithBiometrics()
      if (!result.ok && result.error) {
        setMessage(result.error)
      }
    } catch {
      setMessage("Fingerprint unlock could not be completed.")
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
    <Presentation
      mode="unlock"
      eyebrow={presentation.eyebrow}
      subtitle={presentation.subtitle}
      title={presentation.title}
      pinpad={
        <AppLockPinPad
          codeLength={APP_LOCK_CODE_LENGTH}
          disabled={
            isLoading ||
            hasHydrationError ||
            isSubmittingBiometrics ||
            isSubmittingCode ||
            isTemporarilyLocked
          }
          onBiometricPress={runBiometricUnlock}
          onDeletePress={removeLastDigit}
          onDigitPress={appendDigit}
          showBiometric={canUseBiometrics}
          value={code}
          variant={design === "market-day" ? "quiet-seal" : "default"}
        />
      }
      feedback={
        <Text
          accessibilityLiveRegion="polite"
          className={
            design === "market-day"
              ? message || isTemporarilyLocked
                ? "min-h-9 text-center text-xs font-semibold leading-[18px] text-market-paprika"
                : "min-h-9 text-center text-xs font-semibold leading-[18px] text-market-muted-ink"
              : message || isTemporarilyLocked
                ? "min-h-5 text-center text-xs font-medium leading-5 text-destructive"
                : "min-h-5 text-center text-xs leading-5 text-muted-foreground"
          }
        >
          {helperMessage}
        </Text>
      }
      recovery={
        <Pressable
          accessibilityRole="button"
          haptic
          onPress={handleForgotCode}
          transition
          className={
            design === "market-day"
              ? "min-h-12 items-center justify-center border-b border-market-line bg-market-canvas px-3 py-2.5 active:bg-market-soft-band"
              : "min-h-11 items-center justify-center px-4"
          }
        >
          <Text
            className={
              design === "market-day"
                ? "text-center text-xs font-bold leading-[18px] text-market-muted-ink"
                : "text-center text-xs font-semibold text-muted-foreground"
            }
          >
            Forgot code? Sign out and reset app lock
          </Text>
        </Pressable>
      }
    />
  )
}
