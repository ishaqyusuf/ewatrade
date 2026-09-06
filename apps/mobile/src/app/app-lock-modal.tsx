import { AppLockPinPad } from "@/components/mobile/app-lock-pin-pad"
import {
  AppLockQuietSealDeviceNote,
  AppLockQuietSealLengthChoice,
  AppLockQuietSealScreen,
} from "@/components/mobile/app-lock-quiet-seal"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAuthContext } from "@/hooks/use-auth"
import { resolveAppLockQuietSealPresentation } from "@/lib/app-lock-quiet-seal-presentation"
import { APP_LOCK_CODE_LENGTH } from "@/lib/app-lock-store"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { useRouter } from "expo-router"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { StyleSheet, View } from "react-native"

type AppLockSetupMode =
  | "create"
  | "confirm"
  | "manage"
  | "verify-change"
  | "verify-disable"

function normalizeLockCode(value: string) {
  return value.replace(/\D/g, "").slice(0, APP_LOCK_CODE_LENGTH)
}

export default function AppLockModalRoute() {
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
    <AppLockQuietSealScreen
      contentStyle={isManageMode ? styles.manageScreen : styles.entryScreen}
      eyebrow={presentation.eyebrow}
      onClose={close}
      subtitle={presentation.subtitle}
      testID="app-lock-quiet-seal-settings"
      title={presentation.title}
    >
      {isManageMode ? (
        <AppLockManagePanel
          appLock={appLock}
          message={message}
          onChangePin={startChange}
          onCreatePin={startCreate}
          onDisable={startDisable}
          onToggleBiometrics={toggleBiometrics}
        />
      ) : (
        <>
          <View style={styles.entryFlow}>
            <AppLockQuietSealLengthChoice />
            <AppLockPinPad
              codeLength={APP_LOCK_CODE_LENGTH}
              disabled={isSubmitting}
              onDeletePress={removeLastDigit}
              onDigitPress={appendDigit}
              value={code}
              variant="quiet-seal"
            />

            <EntryMessage message={entryMessage} />
          </View>

          <AppLockQuietSealDeviceNote />
        </>
      )}
    </AppLockQuietSealScreen>
  )
}

function AppLockManagePanel({
  appLock,
  message,
  onChangePin,
  onCreatePin,
  onDisable,
  onToggleBiometrics,
}: {
  appLock: ReturnType<typeof useAppLockContext>
  message: string | null
  onChangePin: () => void
  onCreatePin: () => void
  onDisable: () => void
  onToggleBiometrics: (enabled: boolean) => void
}) {
  const marketDay = useMarketDayPalette()
  const hasLock = appLock.isConfigured
  const biometricsEnabled = !!appLock.config?.biometricsEnabled
  const biometricDetail = appLock.biometricsStatus.isAvailable
    ? `Use ${appLock.biometricsStatus.label.toLowerCase()} from the PIN keypad.`
    : (appLock.biometricsStatus.reason ??
      "Fingerprint unlock is not available on this device.")

  return (
    <View style={styles.managePanel}>
      <View style={[styles.manageRows, { borderTopColor: marketDay.line }]}>
        <ManageRow
          detail={
            hasLock
              ? "Change the 6 digit PIN used to unlock this app."
              : "Create a 6 digit PIN before turning on fingerprint unlock."
          }
          icon="SecurityPassword"
          onPress={hasLock ? onChangePin : onCreatePin}
          title={hasLock ? "Change PIN code" : "Create PIN code"}
        />
        <ManageRow
          detail={biometricDetail}
          disabled={!hasLock || !appLock.biometricsStatus.isAvailable}
          icon="FingerPrintScan"
          title="Fingerprint unlock"
          trailing={
            <Switch
              checked={hasLock && biometricsEnabled}
              disabled={!hasLock || !appLock.biometricsStatus.isAvailable}
              onCheckedChange={(checked) => onToggleBiometrics(checked)}
            />
          }
        />
        {hasLock ? (
          <ManageRow
            detail="Turn off PIN and fingerprint unlock on this phone."
            icon="XCircle"
            onPress={onDisable}
            title="Turn off app lock"
            tone="danger"
          />
        ) : null}
      </View>

      {message ? (
        <Text style={[styles.manageMessage, { color: marketDay.mutedInk }]}>
          {message}
        </Text>
      ) : null}

      <AppLockQuietSealDeviceNote>
        PIN and fingerprint settings stay on this phone
      </AppLockQuietSealDeviceNote>
    </View>
  )
}

function ManageRow({
  detail,
  disabled = false,
  icon,
  onPress,
  title,
  tone = "default",
  trailing,
}: {
  detail: string
  disabled?: boolean
  icon: "FingerPrintScan" | "SecurityPassword" | "XCircle"
  onPress?: () => void
  title: string
  tone?: "danger" | "default"
  trailing?: ReactNode
}) {
  const marketDay = useMarketDayPalette()
  const actionColor = tone === "danger" ? marketDay.paprika : marketDay.ink
  const content = (
    <>
      <View
        style={[styles.manageIcon, { backgroundColor: marketDay.softBand }]}
      >
        <Icon color={actionColor} name={icon} size={21} />
      </View>
      <View style={styles.manageCopy}>
        <Text style={[styles.manageTitle, { color: actionColor }]}>
          {title}
        </Text>
        <Text style={[styles.manageDetail, { color: marketDay.mutedInk }]}>
          {detail}
        </Text>
      </View>
      {trailing ??
        (onPress ? (
          <Icon color={marketDay.mutedInk} name="ChevronRight" size={17} />
        ) : null)}
    </>
  )

  if (!onPress) {
    return (
      <View
        style={[
          styles.manageRow,
          {
            borderBottomColor: marketDay.line,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {content}
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic
      onPress={onPress}
      style={({ pressed }) => [
        styles.manageRow,
        {
          backgroundColor: pressed ? marketDay.softBand : marketDay.canvas,
          borderBottomColor: marketDay.line,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      transition
    >
      {content}
    </Pressable>
  )
}

function EntryMessage({ message }: { message: string | null }) {
  const marketDay = useMarketDayPalette()

  return (
    <Text
      style={[
        styles.entryMessage,
        { color: message ? marketDay.paprika : marketDay.mutedInk },
      ]}
    >
      {message ?? " "}
    </Text>
  )
}

const styles = StyleSheet.create({
  entryFlow: {
    alignItems: "center",
    gap: 22,
    width: "100%",
  },
  entryMessage: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    minHeight: 20,
    textAlign: "center",
  },
  entryScreen: {
    justifyContent: "space-between",
  },
  manageCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  manageDetail: {
    fontSize: 12,
    lineHeight: 17,
  },
  manageIcon: {
    alignItems: "center",
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  manageMessage: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    textAlign: "center",
  },
  managePanel: {
    flexGrow: 1,
    gap: 24,
    justifyContent: "space-between",
  },
  manageRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  manageRows: {
    borderTopWidth: 1,
  },
  manageScreen: {
    gap: 26,
  },
  manageTitle: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
})
