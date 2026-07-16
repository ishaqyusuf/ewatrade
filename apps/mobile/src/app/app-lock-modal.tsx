import { AppLockPinPad } from "@/components/mobile/app-lock-pin-pad"
import { SafeArea } from "@/components/safe-area"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { useAppLockContext } from "@/hooks/use-app-lock"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { APP_LOCK_CODE_LENGTH } from "@/lib/app-lock-store"
import { useRouter } from "expo-router"
import { StatusBar } from "expo-status-bar"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { View } from "react-native"

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
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const [mode, setMode] = useState<AppLockSetupMode>(
    appLock.isConfigured ? "manage" : "create",
  )
  const [code, setCode] = useState("")
  const [draftCode, setDraftCode] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isManageMode = mode === "manage"
  const title = useMemo(() => {
    if (mode === "manage") return "App lock"
    if (mode === "confirm") return "Confirm PIN code"
    if (mode === "verify-change") return "Enter current PIN"
    if (mode === "verify-disable") return "Enter current PIN"
    return "Create PIN code"
  }, [mode])
  const subtitle = useMemo(() => {
    if (mode === "manage") {
      return "Protect this device after login with a local PIN and optional fingerprint unlock."
    }
    if (mode === "confirm") return "Enter it again to finish setup."
    if (mode === "verify-change") return "Confirm the current PIN before changing it."
    if (mode === "verify-disable") return "Confirm the current PIN before turning app lock off."
    return "Create a PIN code that will be used every time you open the app."
  }, [mode])

  useEffect(() => {
    if (!appLock.isHydrated) return
    setMode(appLock.isConfigured ? "manage" : "create")
  }, [appLock.isConfigured, appLock.isHydrated])

  const resetEntry = useCallback(() => {
    setCode("")
    setMessage(null)
  }, [])

  const appendDigit = useCallback(
    (digit: string) => {
      setCode((currentCode) => normalizeLockCode(`${currentCode}${digit}`))
      setMessage(null)
    },
    [],
  )

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
      setMessage(enabled ? "Fingerprint unlock enabled." : "Fingerprint unlock off.")
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
    <SafeArea style={{ backgroundColor: colors.background }}>
      <StatusBar
        backgroundColor={colors.background}
        style={colorScheme === "dark" ? "light" : "dark"}
      />
      <View className="flex-1 bg-background px-6 pb-5 pt-4">
        <View className="flex-row items-center justify-between">
          <View className="h-10 w-10" />
          <Text className="text-center text-[13px] font-medium text-muted-foreground">
            PIN code
          </Text>
          <Pressable
            accessibilityLabel="Close app lock settings"
            className="h-10 w-10 items-center justify-center rounded-full bg-muted active:bg-accent"
            haptic
            onPress={close}
            transition
          >
            <Icon className="size-sm text-muted-foreground" name="X" />
          </Pressable>
        </View>

        {isManageMode ? (
          <AppLockManagePanel
            appLock={appLock}
            businessName={auth.profile?.businessName}
            message={message}
            onChangePin={startChange}
            onCreatePin={startCreate}
            onDisable={startDisable}
            onToggleBiometrics={toggleBiometrics}
          />
        ) : (
          <View className="flex-1 justify-between py-7">
            <View className="items-center gap-7">
              <PinLengthSegment />
              <View className="items-center gap-2">
                <Text className="text-center text-[19px] font-semibold leading-6 text-foreground">
                  {title}
                </Text>
                <Text className="max-w-[260px] text-center text-[12px] leading-4 text-muted-foreground">
                  {subtitle}
                </Text>
              </View>
            </View>

            <View className="items-center gap-5">
              <AppLockPinPad
                codeLength={APP_LOCK_CODE_LENGTH}
                disabled={isSubmitting}
                onDeletePress={removeLastDigit}
                onDigitPress={appendDigit}
                value={code}
              />

              <Text
                className={
                  message
                    ? "min-h-5 text-center text-[12px] font-medium leading-5 text-destructive"
                    : "min-h-5 text-center text-[12px] leading-5 text-muted-foreground"
                }
              >
                {message ?? " "}
              </Text>
            </View>
          </View>
        )}
      </View>
    </SafeArea>
  )
}

function PinLengthSegment() {
  return (
    <View className="w-full max-w-[250px] flex-row rounded-full bg-muted p-1">
      <View className="h-8 flex-1 items-center justify-center rounded-full opacity-50">
        <Text className="text-[12px] font-medium text-muted-foreground">
          4 digit code
        </Text>
      </View>
      <View className="h-8 flex-1 items-center justify-center rounded-full bg-card">
        <Text className="text-[12px] font-semibold text-foreground">
          6 digit code
        </Text>
      </View>
    </View>
  )
}

function AppLockManagePanel({
  appLock,
  businessName,
  message,
  onChangePin,
  onCreatePin,
  onDisable,
  onToggleBiometrics,
}: {
  appLock: ReturnType<typeof useAppLockContext>
  businessName?: string
  message: string | null
  onChangePin: () => void
  onCreatePin: () => void
  onDisable: () => void
  onToggleBiometrics: (enabled: boolean) => void
}) {
  const hasLock = appLock.isConfigured
  const biometricsEnabled = !!appLock.config?.biometricsEnabled
  const biometricDetail = appLock.biometricsStatus.isAvailable
    ? `Use ${appLock.biometricsStatus.label.toLowerCase()} from the PIN keypad.`
    : (appLock.biometricsStatus.reason ??
      "Fingerprint unlock is not available on this device.")

  return (
    <View className="flex-1 justify-between py-7">
      <View className="gap-7">
        <View className="items-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Icon className="size-xl text-foreground" name="Lock" />
          </View>
          <View className="items-center gap-2">
            <Text className="text-center text-[20px] font-semibold leading-7 text-foreground">
              Protect {businessName ?? "your business"}
            </Text>
            <Text className="max-w-[280px] text-center text-[12px] leading-5 text-muted-foreground">
              App lock is local to this phone and appears after login whenever
              you reopen EwaTrade.
            </Text>
          </View>
        </View>

        <View className="gap-3">
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
          <Text className="text-center text-[12px] font-medium leading-5 text-muted-foreground">
            {message}
          </Text>
        ) : null}
      </View>
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
  const content = (
    <>
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon
          className={
            tone === "danger"
              ? "size-base text-destructive"
              : "size-base text-muted-foreground"
          }
          name={icon}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text
          className={
            tone === "danger"
              ? "text-[14px] font-semibold text-destructive"
              : "text-[14px] font-semibold text-foreground"
          }
        >
          {title}
        </Text>
        <Text className="text-[12px] leading-4 text-muted-foreground">
          {detail}
        </Text>
      </View>
      {trailing ??
        (onPress ? (
          <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
        ) : null)}
    </>
  )

  if (!onPress) {
    return (
      <View
        className={
          disabled
            ? "min-h-[76px] flex-row items-center gap-3 rounded-2xl bg-card px-4 opacity-60"
            : "min-h-[76px] flex-row items-center gap-3 rounded-2xl bg-card px-4"
        }
      >
        {content}
      </View>
    )
  }

  return (
    <Pressable
      className={
        disabled
          ? "min-h-[76px] flex-row items-center gap-3 rounded-2xl bg-card px-4 opacity-60"
          : "min-h-[76px] flex-row items-center gap-3 rounded-2xl bg-card px-4 active:bg-accent"
      }
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      {content}
    </Pressable>
  )
}
