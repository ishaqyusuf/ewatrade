import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAppLockCountdown } from "@/hooks/use-app-lock-countdown"
import { useAuthContext } from "@/hooks/use-auth"
import {
  appLockBiometricName,
  appLockLockoutMessage,
  appLockTriesLeft,
  appLockWrongPinMessage,
} from "@/lib/app-lock-messages"
import {
  APP_LOCK_CODE_LENGTH,
  APP_LOCK_MAX_FAILED_ATTEMPTS,
} from "@/lib/app-lock-store"
import { useRouter } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { AppLockSettingsPage } from "./app-lock-settings-page"
import {
  AppLockBiometricOffer,
  type PinEntryFooter,
  PinEntryScreen,
} from "./pin-entry-screen"
import { APP_LOCK_FORGOT_PIN_LABEL, useForgotPin } from "./use-forgot-pin"

type AppLockSetupMode =
  | "create"
  | "confirm"
  | "manage"
  | "verify-change"
  | "verify-disable"
  | "biometric-offer"

const MISMATCH_MESSAGE = "Those PINs didn’t match. Create it again."
const DEVICE_NOTE = "Works offline. Stored only on this phone."

function normalizeLockCode(value: string) {
  return value.replace(/\D/g, "").slice(0, APP_LOCK_CODE_LENGTH)
}

export function AppLockSettingsScreen() {
  const router = useRouter()
  const auth = useAuthContext()
  const appLock = useAppLockContext()
  const forgotPin = useForgotPin()
  const [mode, setMode] = useState<AppLockSetupMode>("manage")
  // A new PIN after "Change PIN" finishes with "PIN changed", not the offer.
  const [isChangingPin, setIsChangingPin] = useState(false)
  const [code, setCode] = useState("")
  const [draftCode, setDraftCode] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const lockoutSeconds = useAppLockCountdown(lockedUntil)
  const isVerifying = mode === "verify-change" || mode === "verify-disable"
  const biometricLabel = appLock.biometricsStatus.label
  const entryMessage = isSubmitting
    ? mode === "confirm"
      ? "Saving app lock."
      : isVerifying
        ? "Checking your PIN."
        : null
    : isVerifying && lockoutSeconds > 0
      ? appLockLockoutMessage(lockoutSeconds)
      : message

  const resetEntry = useCallback(() => {
    setCode("")
    setMessage(null)
    setIsError(false)
  }, [])

  const appendDigit = useCallback((digit: string) => {
    setCode((currentCode) => normalizeLockCode(`${currentCode}${digit}`))
    setMessage(null)
    setIsError(false)
  }, [])

  const removeLastDigit = useCallback(() => {
    setCode((currentCode) => currentCode.slice(0, -1))
    setMessage(null)
    setIsError(false)
  }, [])

  const startCreate = useCallback(() => {
    setDraftCode("")
    setIsChangingPin(false)
    setNote(null)
    setMode("create")
    resetEntry()
  }, [resetEntry])

  const startChange = useCallback(() => {
    setNote(null)
    setLockedUntil(appLock.config?.lockedUntil ?? null)
    setMode("verify-change")
    resetEntry()
  }, [appLock.config?.lockedUntil, resetEntry])

  const startDisable = useCallback(() => {
    setNote(null)
    setLockedUntil(appLock.config?.lockedUntil ?? null)
    setMode("verify-disable")
    resetEntry()
  }, [appLock.config?.lockedUntil, resetEntry])

  const backToSettings = useCallback(() => {
    setDraftCode("")
    setIsChangingPin(false)
    setMode("manage")
    resetEntry()
  }, [resetEntry])

  const backToCreate = useCallback(() => {
    setDraftCode("")
    setMode("create")
    resetEntry()
  }, [resetEntry])

  const toggleBiometrics = useCallback(
    async (enabled: boolean) => {
      if (enabled && !appLock.biometricsStatus.isAvailable) {
        setNote(null)
        setMessage(
          appLock.biometricsStatus.reason ??
            "Biometric unlock is not available on this device.",
        )
        return
      }

      await appLock.setBiometricsEnabled(enabled)
      const name = appLockBiometricName(appLock.biometricsStatus.label)
      setNote(
        enabled ? `Unlock with ${name} is on` : `Unlock with ${name} is off`,
      )
    },
    [appLock],
  )

  const finishBiometricOffer = useCallback(
    async (enabled: boolean) => {
      setIsSubmitting(true)
      try {
        if (enabled) await appLock.setBiometricsEnabled(true)
      } finally {
        setIsSubmitting(false)
      }
      setNote(null)
      setMode("manage")
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
      setIsError(false)
      setIsSubmitting(false)
      return
    }

    if (mode === "confirm") {
      if (code !== draftCode) {
        setCode("")
        setDraftCode("")
        setMode("create")
        setMessage(MISMATCH_MESSAGE)
        setIsError(true)
        setIsSubmitting(false)
        return
      }

      await appLock.setCode(code)
      setCode("")
      setDraftCode("")
      setIsSubmitting(false)
      if (isChangingPin) {
        setIsChangingPin(false)
        setMode("manage")
        setNote("PIN changed")
        setMessage(null)
        return
      }
      // The offer needs a PIN first, and only appears when the phone has
      // biometrics set up; Settings keeps the switch for later.
      if (appLock.biometricsStatus.isAvailable) {
        setMode("biometric-offer")
        return
      }
      setMode("manage")
      setNote(null)
      setMessage(null)
      return
    }

    if (isVerifying) {
      const result = await appLock.unlockWithCode(code)
      if (!result.ok) {
        setCode("")
        setIsError(true)
        if (result.reason === "locked") {
          setLockedUntil(result.lockedUntil ?? null)
          setMessage(null)
        } else {
          setMessage(
            appLockWrongPinMessage(
              appLockTriesLeft(
                result.config?.failedAttemptCount,
                APP_LOCK_MAX_FAILED_ATTEMPTS,
              ),
            ),
          )
        }
        setIsSubmitting(false)
        return
      }

      setLockedUntil(null)
      if (mode === "verify-disable") {
        await appLock.clearLock()
        setCode("")
        setMode("manage")
        setNote(null)
        setMessage(null)
        setIsError(false)
        setIsSubmitting(false)
        return
      }

      setDraftCode("")
      setCode("")
      setIsChangingPin(true)
      setMode("create")
      setMessage(null)
      setIsError(false)
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(false)
  }, [appLock, code, draftCode, isChangingPin, isSubmitting, isVerifying, mode])

  useEffect(() => {
    if (code.length === APP_LOCK_CODE_LENGTH) {
      void submitCode()
    }
  }, [code.length, submitCode])

  const close = useCallback(() => {
    router.back()
  }, [router])

  if (mode === "manage") {
    return (
      <AppLockSettingsPage
        biometricLabel={biometricLabel}
        biometricReason={
          appLock.biometricsStatus.hasHardware
            ? "Set it up in your phone’s settings first"
            : "Not available on this phone"
        }
        biometricsAvailable={appLock.biometricsStatus.isAvailable}
        biometricsEnabled={!!appLock.config?.biometricsEnabled}
        businessName={auth.profile?.businessName}
        hasLock={appLock.isConfigured}
        note={note ?? message}
        onChangePin={startChange}
        onClose={close}
        onCreatePin={startCreate}
        onDisable={startDisable}
        onToggleBiometrics={(enabled) => void toggleBiometrics(enabled)}
      />
    )
  }

  if (mode === "biometric-offer") {
    return (
      <AppLockBiometricOffer
        biometricName={appLockBiometricName(biometricLabel)}
        businessName={auth.profile?.businessName}
        busy={isSubmitting}
        onAccept={() => void finishBiometricOffer(true)}
        onDecline={() => void finishBiometricOffer(false)}
      />
    )
  }

  const businessName = auth.profile?.businessName?.trim() || "your business"
  const entry: {
    glyph: "Lock" | "SecurityPassword"
    subtitle: string
    title: string
  } =
    mode === "verify-disable"
      ? {
          glyph: "Lock",
          subtitle: "Enter your PIN to confirm",
          title: "Turn off app lock",
        }
      : mode === "verify-change"
        ? {
            glyph: "Lock",
            subtitle: "Then you can choose a new one",
            title: "Enter your current PIN",
          }
        : mode === "confirm"
          ? {
              glyph: "SecurityPassword",
              subtitle: "Type the same 6 digits.",
              title: "Enter it again",
            }
          : {
              glyph: "SecurityPassword",
              subtitle: `Choose 6 digits to open ${businessName} on this phone.`,
              title: isChangingPin ? "Create a new PIN" : "Create your PIN",
            }
  const footer: PinEntryFooter = isVerifying
    ? { kind: "action", label: APP_LOCK_FORGOT_PIN_LABEL, onPress: forgotPin }
    : { kind: "note", text: DEVICE_NOTE }

  return (
    <PinEntryScreen
      disabled={isSubmitting || (isVerifying && lockoutSeconds > 0)}
      error={isError && !!entryMessage}
      footer={footer}
      glyph={entry.glyph}
      leading={
        mode === "confirm"
          ? { kind: "back", label: "Back to create PIN", onPress: backToCreate }
          : { kind: "close", label: "Close", onPress: backToSettings }
      }
      message={entryMessage}
      onDeletePress={removeLastDigit}
      onDigitPress={appendDigit}
      subtitle={entry.subtitle}
      testID={`app-lock-pin-${mode}`}
      title={entry.title}
      value={code}
    />
  )
}
