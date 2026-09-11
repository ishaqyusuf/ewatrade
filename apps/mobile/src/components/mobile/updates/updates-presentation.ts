export type UpdateStep = { label: string; active: boolean; done: boolean }
export type UpdateInfo = { label: string; value: string }

export type AutoUpdatePresentationProps = {
  title: string
  message: string
  failed: boolean
  downloading: boolean
  progress: number | null
  steps: UpdateStep[]
  onContinue: () => void
}

export type UpdatesPresentationProps = {
  status: string
  message: string
  errorMessage: string | null
  latestError: string | null
  enabled: boolean
  pending: boolean
  checking: boolean
  downloading: boolean
  restarting: boolean
  progress: number | null
  canCheck: boolean
  canDownload: boolean
  canRestart: boolean
  steps: UpdateStep[]
  info: UpdateInfo[]
  onBack: () => void
  onCheck: () => void
  onDownload: () => void
  onRestart: () => void
}

export const UPDATE_HELP =
  "Installed builds use the app’s launch hook to check for matching updates. Foreground checks depend on this build’s configuration and cooldown. An update must match the build’s channel and runtime. Native or runtime changes require a new build."

export function normalizeDownloadProgress(
  value: number | undefined,
): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(Math.min(1, Math.max(0, value)) * 100)
    : null
}
