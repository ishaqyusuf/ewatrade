import {
  AUTO_UPDATE_STEPS,
  getAutoUpdateStepState,
} from "@/components/app-auto-update-step"
import { ClassicAutoUpdateScreen } from "@/components/mobile/appearances/classic/auto-update-screen"
import { MarketDayAutoUpdateScreen } from "@/components/mobile/appearances/market-day/auto-update-screen"
import { normalizeDownloadProgress } from "@/components/mobile/updates/updates-presentation"
import { useLaunchAutoUpdate } from "@/hooks/use-launch-auto-update"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { Modal } from "react-native"

// This existing full-screen host is an app-lifecycle surface, not a compact
// confirmation sheet. Its single hook remains the owner of automatic updates.
export function AppAutoUpdateModal() {
  const { dismissFailure, downloadProgress, errorMessage, phase, visible } =
    useLaunchAutoUpdate()
  const Presentation =
    useMobileDesign("updates") === "market-day"
      ? MarketDayAutoUpdateScreen
      : ClassicAutoUpdateScreen
  const failed = phase === "failed"
  const title = failed
    ? "Update paused"
    : phase === "downloading"
      ? "Downloading update"
      : phase === "updating"
        ? "Preparing update"
        : "Restarting app"
  const message = failed
    ? (errorMessage ?? "The update could not be applied.")
    : phase === "downloading"
      ? "An update is available. Keep the app open while it downloads."
      : phase === "updating"
        ? "The update has downloaded. Preparing to restart."
        : "Restarting into the updated app."
  return (
    <Modal
      animationType="fade"
      onRequestClose={failed ? dismissFailure : () => undefined}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <Presentation
        title={title}
        message={message}
        failed={failed}
        downloading={phase === "downloading"}
        progress={normalizeDownloadProgress(downloadProgress)}
        onContinue={dismissFailure}
        steps={AUTO_UPDATE_STEPS.map((label) => ({
          label,
          ...getAutoUpdateStepState(phase, label),
        }))}
      />
    </Modal>
  )
}
