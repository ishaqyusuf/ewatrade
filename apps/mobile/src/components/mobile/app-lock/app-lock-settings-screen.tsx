import { AppLockPinPad } from "@/components/mobile/app-lock-pin-pad"
import { ClassicAppLockScreen } from "@/components/mobile/appearances/classic/app-lock-screen"
import { MarketDayAppLockScreen } from "@/components/mobile/appearances/market-day/app-lock-screen"
import { AppLockManagement } from "./app-lock-management"
import { Text } from "@/components/ui/text"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAuthContext } from "@/hooks/use-auth"
import { resolveAppLockQuietSealPresentation } from "@/lib/app-lock-quiet-seal-presentation"
import { APP_LOCK_CODE_LENGTH } from "@/lib/app-lock-store"
import { useRouter } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"

type AppLockSetupMode =
  | "create"
  | "confirm"
  | "manage"
  | "verify-change"
  | "verify-disable"

function normalizeLockCode(value: string) {
  return value.replace(/\D/g, "").slice(0, APP_LOCK_CODE_LENGTH)
}

export function AppLockSettingsScreen() {
  const design = useMobileDesign("app-lock")
  const Presentation =
    design === "market-day" ? MarketDayAppLockScreen : ClassicAppLockScreen
  const router = useRouter()
  const auth = useAuthContext()
  const appLock = useAppLockContext()
  const [mode, setMode] = useState<AppLockSetupMode>(
    appLock.isConfigured ? "manage" : "create",
  )
  const [code, setCode] = useState("")
  const [draftCode, setDraftCode] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isManageMode = mode === "manage"
  const presentation = useMemo(
    () => resolveAppLockQuietSealPresentation(mode, auth.profile?.businessName),
    [auth.profile?.businessName, mode],
  )
  const entryMessage = isSubmitting
    ? mode === "confirm"
      ? "Saving app lock."
      : mode === "verify-change" || mode === "verify-disable"
        ? "Checking your current PIN."
        : "Preparing confirmation."
    : message

  useEffect(() => {
    if (!appLock.isHydrated) return
    setMode(appLock.isConfigured ? "manage" : "create")
  }, [appLock.isConfigured, appLock.isHydrated])

  const resetEntry = useCallback(() => {
    setCode("")
    setMessage(null)
  }, [])

  const appendDigit = useCallback((digit: string) => {
    setCode((currentCode) => normalizeLockCode(`${currentCode}${digit}`))
    setMessage(null)
  }, [])

  const removeLastDigit = useCallback(() => {
    setCode((currentCode) => currentCode.slice(0, -1))
    setMessage(null)
  }, [])

  const startCreate = useCallback(() => {
    setDraftCode("")
    setMode("create")
    resetEntry()
  }, [resetEntry])

  const startChange = useCallback(() => {
    setMode("verify-change")
    resetEntry()
  }, [resetEntry])

  const startDisable = useCallback(() => {
    setMode("verify-disable")
    resetEntry()
  }, [resetEntry])

  const toggleBiometrics = useCallback(
    async (enabled: boolean) => {
      if (enabled && !appLock.biometricsStatus.isAvailable) {
        setMessage(
          appLock.biometricsStatus.reason ??
            "Fingerprint unlock is not available on this device.",
        )
        return
      }

      await appLock.setBiometricsEnabled(enabled)
      setMessage(
        enabled ? "Fingerprint unlock enabled." : "Fingerprint unlock off.",
      )
    },
    [appLock],
  )

  const submitCode = useCallback(async () => {
    if (code.length !== APP_LOCK_CODE_LENGTH || isSubmitting) return

    setIsSubmitting(true)

    if (mode === "create") {
      setDraftCode(code)
      setCode("")
      setMode("confirm")
      setMessage(null)
      setIsSubmitting(false)
      return
    }

    if (mode === "confirm") {
      if (code !== draftCode) {
        setCode("")
        setMode("create")
        setMessage("PIN codes did not match. Create it again.")
        setIsSubmitting(false)
        return
      }

      await appLock.setCode(code)
      setCode("")
      setDraftCode("")
      setMode("manage")
      setMessage("App lock is on.")
      setIsSubmitting(false)
      return
    }

    if (mode === "verify-change" || mode === "verify-disable") {
      const result = await appLock.unlockWithCode(code)
      if (!result.ok) {
        setCode("")
        setMessage(
          result.reason === "locked"
            ? "Too many wrong attempts. Try again shortly."
            : "That PIN code did not match.",
        )
        setIsSubmitting(false)
        return
      }

      if (mode === "verify-disable") {
        await appLock.clearLock()
        setCode("")
        setMode("create")
        setMessage("App lock is off.")
        setIsSubmitting(false)
        return
      }

      setDraftCode("")
      setCode("")
      setMode("create")
      setMessage("Create your new PIN code.")
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
  }, [appLock, code, draftCode, isSubmitting, mode])

  useEffect(() => {
    if (code.length === APP_LOCK_CODE_LENGTH) {
      void submitCode()
    }
  }, [code.length, submitCode])

  const close = useCallback(() => {
    router.back()
  }, [router])

  return (
    <Presentation
      mode={isManageMode ? "manage" : "entry"}
      eyebrow={presentation.eyebrow}
      onClose={close}
      subtitle={presentation.subtitle}
      title={presentation.title}
      management={
        <AppLockManagement
          hasLock={appLock.isConfigured}
          biometricsEnabled={!!appLock.config?.biometricsEnabled}
          biometricsAvailable={appLock.biometricsStatus.isAvailable}
          biometricDetail={
            appLock.biometricsStatus.isAvailable
              ? `Use ${appLock.biometricsStatus.label.toLowerCase()} from the PIN keypad.`
              : (appLock.biometricsStatus.reason ??
                "Fingerprint unlock is not available on this device.")
          }
          message={message}
          onChangePin={startChange}
          onCreatePin={startCreate}
          onDisable={startDisable}
          onToggleBiometrics={toggleBiometrics}
        />
      }
      pinpad={
        <AppLockPinPad
          codeLength={APP_LOCK_CODE_LENGTH}
          disabled={isSubmitting}
          onDeletePress={removeLastDigit}
          onDigitPress={appendDigit}
          value={code}
          variant={design === "market-day" ? "quiet-seal" : "default"}
        />
      }
      feedback={
        <Text
          accessibilityLiveRegion="polite"
          className={
            design === "market-day"
              ? entryMessage
                ? "min-h-5 text-center text-xs font-semibold leading-[18px] text-market-paprika"
                : "min-h-5 text-center text-xs leading-[18px] text-market-muted-ink"
              : entryMessage
                ? "min-h-5 text-center text-xs font-medium leading-5 text-destructive"
                : "min-h-5 text-center text-xs leading-5 text-muted-foreground"
          }
        >
          {entryMessage ?? " "}
        </Text>
      }
    />
  )
}
