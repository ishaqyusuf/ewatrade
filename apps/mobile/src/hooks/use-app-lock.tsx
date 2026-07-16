import { useAuthContext } from "@/hooks/use-auth"
import {
  type AppLockConfig,
  type AppLockVerificationResult,
  clearAppLock,
  getAppLockConfig,
  recordAppLockUnlock,
  setAppLockBiometrics,
  setAppLockCode,
  verifyAppLockCode,
} from "@/lib/app-lock-store"
import * as LocalAuthentication from "expo-local-authentication"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { AppState, type AppStateStatus } from "react-native"

type AppLockBiometricsStatus = {
  hasHardware: boolean
  isAvailable: boolean
  isEnrolled: boolean
  label: string
  reason: string | null
  supportedTypes: LocalAuthentication.AuthenticationType[]
}

type AppLockContextValue = {
  biometricsStatus: AppLockBiometricsStatus
  clearLock: () => Promise<void>
  config: AppLockConfig | null
  isConfigured: boolean
  isHydrated: boolean
  isLocked: boolean
  lockNow: () => void
  refreshConfig: (options?: { lockIfEnabled?: boolean }) => Promise<void>
  resetAfterSignOut: () => Promise<void>
  setBiometricsEnabled: (enabled: boolean) => Promise<AppLockConfig | null>
  setCode: (code: string) => Promise<AppLockConfig | null>
  unlockWithBiometrics: () => Promise<{ error?: string; ok: boolean }>
  unlockWithCode: (code: string) => Promise<AppLockVerificationResult>
}

const DEFAULT_BIOMETRICS_STATUS: AppLockBiometricsStatus = {
  hasHardware: false,
  isAvailable: false,
  isEnrolled: false,
  label: "Biometrics",
  reason: "Biometric unlock is not available on this device.",
  supportedTypes: [],
}

const AppLockContext = createContext<AppLockContextValue | undefined>(undefined)

function getBiometricLabel(
  supportedTypes: LocalAuthentication.AuthenticationType[],
) {
  if (
    supportedTypes.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    )
  ) {
    return "Face ID"
  }

  if (
    supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
  ) {
    return "Fingerprint"
  }

  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return "Iris unlock"
  }

  return "Biometrics"
}

async function readBiometricsStatus(): Promise<AppLockBiometricsStatus> {
  try {
    const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ])
    const label = getBiometricLabel(supportedTypes)

    return {
      hasHardware,
      isAvailable: hasHardware && isEnrolled,
      isEnrolled,
      label,
      reason: !hasHardware
        ? "This device does not have biometric hardware."
        : !isEnrolled
          ? `Set up ${label.toLowerCase()} in your phone settings to use it here.`
          : null,
      supportedTypes,
    }
  } catch {
    return DEFAULT_BIOMETRICS_STATUS
  }
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const auth = useAuthContext()
  const userId = auth.profile?.id ?? null
  const [biometricsStatus, setBiometricsStatus] =
    useState<AppLockBiometricsStatus>(DEFAULT_BIOMETRICS_STATUS)
  const [config, setConfig] = useState<AppLockConfig | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isLocked, setIsLocked] = useState(false)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  const refreshBiometricsStatus = useCallback(async () => {
    const nextStatus = await readBiometricsStatus()
    setBiometricsStatus(nextStatus)
    return nextStatus
  }, [])

  const refreshConfig = useCallback(
    async (options: { lockIfEnabled?: boolean } = {}) => {
      if (!auth.isAuthenticated || !userId) {
        setConfig(null)
        setIsLocked(false)
        setIsHydrated(true)
        return
      }

      const nextConfig = await getAppLockConfig(userId)
      setConfig(nextConfig)
      setIsHydrated(true)

      if (options.lockIfEnabled) {
        setIsLocked(!!nextConfig?.enabled)
      } else if (!nextConfig?.enabled) {
        setIsLocked(false)
      }
    },
    [auth.isAuthenticated, userId],
  )

  useEffect(() => {
    setIsHydrated(false)
    void refreshConfig({ lockIfEnabled: true })
    void refreshBiometricsStatus()
  }, [refreshBiometricsStatus, refreshConfig])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current
      appStateRef.current = nextState

      const wasBackgrounded =
        previousState === "background" || previousState === "inactive"

      if (!wasBackgrounded || nextState !== "active") return

      void refreshBiometricsStatus()
      void refreshConfig({ lockIfEnabled: true })
    })

    return () => {
      subscription.remove()
    }
  }, [refreshBiometricsStatus, refreshConfig])

  const lockNow = useCallback(() => {
    if (config?.enabled) setIsLocked(true)
  }, [config?.enabled])

  const setCode = useCallback(
    async (code: string) => {
      if (!userId) return null

      const nextConfig = await setAppLockCode(userId, code)
      setConfig(nextConfig)
      setIsLocked(false)
      return nextConfig
    },
    [userId],
  )

  const setBiometricsEnabled = useCallback(
    async (enabled: boolean) => {
      if (!userId) return null

      const nextConfig = await setAppLockBiometrics(userId, enabled)
      setConfig(nextConfig)
      return nextConfig
    },
    [userId],
  )

  const unlockWithCode = useCallback(
    async (code: string) => {
      if (!userId) {
        return {
          config: null,
          ok: false,
          reason: "missing",
        } satisfies AppLockVerificationResult
      }

      const result = await verifyAppLockCode(userId, code)
      setConfig(result.config)
      if (result.ok || result.reason === "missing") {
        setIsLocked(false)
      }
      return result
    },
    [userId],
  )

  const unlockWithBiometrics = useCallback(async () => {
    if (!userId || !config?.enabled || !config.biometricsEnabled) {
      return { ok: false }
    }

    const status = await refreshBiometricsStatus()
    if (!status.isAvailable) {
      return {
        error: status.reason ?? "Biometric unlock is not available.",
        ok: false,
      }
    }

    const result = await LocalAuthentication.authenticateAsync({
      biometricsSecurityLevel: "weak",
      cancelLabel: "Use code",
      disableDeviceFallback: true,
      fallbackLabel: "Use lock code",
      promptDescription: "Confirm it is you to open your business workspace.",
      promptMessage: "Unlock EwaTrade",
      promptSubtitle: "App lock",
      requireConfirmation: false,
    })

    if (!result.success) {
      if (result.error === "user_cancel" || result.error === "system_cancel") {
        return { ok: false }
      }

      return {
        error:
          result.warning ??
          "Biometric unlock failed. Enter your lock code to continue.",
        ok: false,
      }
    }

    const nextConfig = await recordAppLockUnlock(userId)
    setConfig(nextConfig)
    setIsLocked(false)
    return { ok: true }
  }, [config?.biometricsEnabled, config?.enabled, refreshBiometricsStatus, userId])

  const clearLock = useCallback(async () => {
    if (!userId) return
    await clearAppLock(userId)
    setConfig(null)
    setIsLocked(false)
  }, [userId])

  const resetAfterSignOut = useCallback(async () => {
    await clearLock()
  }, [clearLock])

  const value = useMemo<AppLockContextValue>(
    () => ({
      biometricsStatus,
      clearLock,
      config,
      isConfigured: !!config?.enabled,
      isHydrated,
      isLocked,
      lockNow,
      refreshConfig,
      resetAfterSignOut,
      setBiometricsEnabled,
      setCode,
      unlockWithBiometrics,
      unlockWithCode,
    }),
    [
      biometricsStatus,
      clearLock,
      config,
      isHydrated,
      isLocked,
      lockNow,
      refreshConfig,
      resetAfterSignOut,
      setBiometricsEnabled,
      setCode,
      unlockWithBiometrics,
      unlockWithCode,
    ],
  )

  return (
    <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
  )
}

export function useAppLockContext() {
  const context = useContext(AppLockContext)
  if (context === undefined) {
    throw new Error("useAppLockContext must be used within an AppLockProvider")
  }

  return context
}
