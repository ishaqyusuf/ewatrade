import { ClassicUpdatesScreen } from "@/components/mobile/appearances/classic/updates-screen"
import { MarketDayUpdatesScreen } from "@/components/mobile/appearances/market-day/updates-screen"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import * as Sentry from "@sentry/react-native"
import Constants from "expo-constants"
import { useRouter } from "expo-router"
import * as Updates from "expo-updates"
import { useCallback, useMemo, useRef, useState } from "react"
import { normalizeDownloadProgress } from "./updates-presentation"

type UpdateAction = "checking" | "downloading" | "restarting" | null

function formatDate(value?: Date | null) {
  return value ? value.toLocaleString() : "Not checked"
}
function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Something went wrong while talking to the update server."
}
export default function UpdatesScreen() {
  const router = useRouter()
  const Presentation =
    useMobileDesign("updates") === "market-day"
      ? MarketDayUpdatesScreen
      : ClassicUpdatesScreen
  const {
    currentlyRunning,
    availableUpdate,
    downloadedUpdate,
    isChecking,
    isDownloading,
    isRestarting,
    isUpdateAvailable,
    isUpdatePending,
    lastCheckForUpdateTimeSinceRestart,
    downloadProgress,
    checkError,
    downloadError,
  } = Updates.useUpdates()
  const busyRef = useRef(false)
  const [action, setAction] = useState<UpdateAction>(null)
  const [message, setMessage] = useState(
    "Ready to check for a published update.",
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const status = useMemo(() => {
    if (!Updates.isEnabled) return "Updates disabled"
    if (isRestarting || action === "restarting") return "Restarting"
    if (isDownloading || action === "downloading") return "Downloading"
    if (isChecking || action === "checking") return "Checking"
    if (errorMessage || checkError || downloadError) return "Update paused"
    if (isUpdatePending)
      return downloadedUpdate?.type === "rollback"
        ? "Rollback ready"
        : "Update ready"
    if (isUpdateAvailable)
      return availableUpdate?.type === "rollback"
        ? "Rollback available"
        : "Update found"
    return lastCheckForUpdateTimeSinceRestart
      ? "No update pending"
      : "Ready to check"
  }, [
    action,
    errorMessage,
    checkError,
    downloadError,
    lastCheckForUpdateTimeSinceRestart,
    availableUpdate,
    downloadedUpdate,
    isChecking,
    isDownloading,
    isRestarting,
    isUpdateAvailable,
    isUpdatePending,
  ])

  const canCheck =
    Updates.isEnabled &&
    action === null &&
    !isChecking &&
    !isDownloading &&
    !isRestarting
  const canDownload = canCheck && isUpdateAvailable && !isUpdatePending
  const canRestart = canCheck && isUpdatePending

  const checkForUpdate = useCallback(async () => {
    if (!canCheck || busyRef.current) return
    busyRef.current = true
    setAction("checking")
    setErrorMessage(null)
    setMessage("Checking the EAS Update channel for this build.")

    try {
      const result = await Updates.checkForUpdateAsync()
      if (result.isAvailable) {
        setMessage("A new update is available. Download it when you are ready.")
      } else if (result.isRollBackToEmbedded) {
        setMessage("A rollback to the embedded build is available.")
      } else {
        setMessage(
          `No update is available for this runtime. Reason: ${result.reason}.`,
        )
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      setMessage(
        "The update check could not be completed. Reconnect and try again.",
      )
    } finally {
      busyRef.current = false
      setAction(null)
    }
  }, [canCheck])
  const downloadUpdate = useCallback(async () => {
    if (!canDownload || busyRef.current) return
    busyRef.current = true
    setAction("downloading")
    setErrorMessage(null)
    setMessage("Downloading the available update.")

    try {
      const result = await Updates.fetchUpdateAsync()
      if (result.isNew || result.isRollBackToEmbedded) {
        setMessage("Update downloaded. Restart the app to apply it.")
      } else {
        setMessage("There was no newer update to download.")
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      setMessage("The update could not be downloaded.")
    } finally {
      busyRef.current = false
      setAction(null)
    }
  }, [canDownload])
  const restartIntoUpdate = useCallback(async () => {
    if (!canRestart || busyRef.current) return
    busyRef.current = true
    setAction("restarting")
    setErrorMessage(null)
    setMessage("Restarting into the downloaded update.")

    try {
      await Sentry.flush()
      await Updates.reloadAsync()
    } catch (error) {
      busyRef.current = false
      setAction(null)
      setErrorMessage(getErrorMessage(error))
      setMessage("The app could not restart into the update.")
    }
  }, [canRestart])
  const checking = isChecking || action === "checking"
  const downloading = isDownloading || action === "downloading"
  const restarting = isRestarting || action === "restarting"
  return (
    <Presentation
      status={status}
      message={
        Updates.isEnabled
          ? message
          : "Updates are unavailable in this build. Use an installed preview or release build."
      }
      errorMessage={errorMessage}
      latestError={(checkError ?? downloadError)?.message ?? null}
      enabled={Updates.isEnabled}
      pending={isUpdatePending}
      checking={checking}
      downloading={downloading}
      restarting={restarting}
      progress={normalizeDownloadProgress(downloadProgress)}
      canCheck={canCheck}
      canDownload={canDownload}
      canRestart={canRestart}
      onBack={() =>
        router.canGoBack() ? router.back() : router.replace("/dashboard")
      }
      onCheck={() => void checkForUpdate()}
      onDownload={() => void downloadUpdate()}
      onRestart={() => void restartIntoUpdate()}
      steps={[
        {
          label: "Check the matching EAS Update channel",
          active: checking,
          done: isUpdateAvailable || isUpdatePending,
        },
        {
          label: "Download the update to this device",
          active: downloading,
          done: isUpdatePending,
        },
        {
          label: "Restart into the downloaded update",
          active: restarting,
          done: false,
        },
      ]}
      info={[
        {
          label: "App version",
          value: Constants.expoConfig?.version ?? "Not set",
        },
        {
          label: "Update version",
          value: String(
            Constants.expoConfig?.extra?.updateVersion ?? "Not set",
          ),
        },
        { label: "Enabled", value: Updates.isEnabled ? "Yes" : "No" },
        { label: "Channel", value: Updates.channel ?? "Not set" },
        { label: "Runtime", value: Updates.runtimeVersion ?? "Not set" },
        {
          label: "Running",
          value: currentlyRunning.isEmbeddedLaunch
            ? "Embedded build"
            : "Downloaded update",
        },
        {
          label: "Update ID",
          value: Updates.updateId?.slice(0, 8) ?? "Embedded build",
        },
        {
          label: "Created",
          value: currentlyRunning.createdAt
            ? formatDate(currentlyRunning.createdAt)
            : "Unknown",
        },
        {
          label: "Last check",
          value: formatDate(lastCheckForUpdateTimeSinceRestart),
        },
      ]}
    />
  )
}
