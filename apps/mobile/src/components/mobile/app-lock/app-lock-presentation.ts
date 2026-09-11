import type { ReactNode } from "react"

export type AppLockPresentationProps = {
  mode: "entry" | "manage" | "unlock"
  eyebrow: string
  title: string
  subtitle: string
  onClose?: () => void
  pinpad?: ReactNode
  feedback?: ReactNode
  recovery?: ReactNode
  management?: ReactNode
}

export type AppLockManagementProps = {
  hasLock: boolean
  biometricsEnabled: boolean
  biometricsAvailable: boolean
  biometricDetail: string
  message: string | null
  onChangePin: () => void
  onCreatePin: () => void
  onDisable: () => void
  onToggleBiometrics: (enabled: boolean) => void
}
