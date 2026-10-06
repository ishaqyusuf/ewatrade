import { ClassicAutoUpdateScreen } from "@/components/mobile/appearances/classic/auto-update-screen"
import { MarketDayAutoUpdateScreen } from "@/components/mobile/appearances/market-day/auto-update-screen"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import {
  APP_UPDATE_RESUME_KEY,
  cancelBuildDownload,
  dismissNativeBuild,
  downloadAndInstallBuild,
  resolveInstalledBuild,
  useAppUpdate,
} from "@/lib/app-update-client"
import { getAppUpdateResume } from "@/lib/app-update-restoration"
import { getSession } from "@/lib/session-store"
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Linking from "expo-linking"
import { type Href, usePathname, useRouter } from "expo-router"
import { useEffect } from "react"
import { Modal } from "react-native"

export function AppBuildUpdate({
  restoreRoute = true,
}: { restoreRoute?: boolean } = {}) {
  const state = useAppUpdate()
  const pathname = usePathname()
  const router = useRouter()
  const market = useMobileDesign("updates") === "market-day"
  const Presentation = market
    ? MarketDayAutoUpdateScreen
    : ClassicAutoUpdateScreen
  useEffect(() => {
    if (!restoreRoute) return
    const session = getSession()
    if (!session || pathname === "/login" || pathname === "/") return
    let alive = true
    void (async () => {
      const current = await resolveInstalledBuild()
      if (!current || !alive) return
      const raw = await AsyncStorage.getItem(APP_UPDATE_RESUME_KEY)
      if (!raw) return
      const snapshot = JSON.parse(raw)
      // The old binary may return from a cancelled installer; preserve its snapshot until expiry.
      if (
        snapshot.targetBuild > current.buildNumber &&
        Date.now() - snapshot.savedAt < 86400000
      )
        return
      const route = getAppUpdateResume(snapshot, {
        ...current,
        userId: session.profile.id,
        businessId: session.profile.businessId ?? null,
        storeId: session.profile.storeId ?? null,
        now: Date.now(),
      })
      const initialUrl = await Linking.getInitialURL()
      if (!alive) return
      await AsyncStorage.removeItem(APP_UPDATE_RESUME_KEY)
      if (alive && route && !initialUrl) router.replace(route as Href)
    })().catch(() => undefined)
    return () => {
      alive = false
    }
  }, [pathname, router, restoreRoute])
  const phase = state.phase
  const busy = phase === "downloading" || phase === "verifying"
  const titles = {
    idle: "App updates",
    available: "New preview build",
    downloading: "Downloading app",
    verifying: "Checking download",
    permission: "Allow installation",
    installing: "Finish installation",
    failed: "Update paused",
  }
  const message =
    state.error ??
    (phase === "permission"
      ? "Allow EwaTrade to install apps, then return here and try again."
      : phase === "installing"
        ? "Complete the Android installation, then reopen EwaTrade. If you cancelled, you can try again."
        : phase === "verifying"
          ? "Checking the app identity and download before installation."
          : `${state.build?.appVersion ?? ""} · ${Math.ceil((state.build?.sizeBytes ?? 0) / 1048576)} MB${state.build?.notes ? `\n${state.build.notes}` : ""}`)
  return (
    <Modal
      visible={state.visible}
      presentationStyle="fullScreen"
      animationType="fade"
      onRequestClose={() => {
        if (!state.busy) void dismissNativeBuild()
      }}
    >
      <Presentation
        title={titles[phase]}
        message={message}
        failed={false}
        downloading={phase === "downloading"}
        progress={
          state.progress === undefined ? null : Math.round(state.progress * 100)
        }
        steps={[]}
        onContinue={() => void dismissNativeBuild()}
        primaryLabel={
          busy
            ? undefined
            : phase === "available"
              ? "Download & install"
              : "Try again"
        }
        primaryDisabled={state.busy}
        onPrimary={() => void downloadAndInstallBuild(pathname)}
        secondaryLabel={
          phase === "downloading"
            ? "Cancel download"
            : busy
              ? undefined
              : "Later"
        }
        onSecondary={() =>
          void (phase === "downloading"
            ? cancelBuildDownload()
            : dismissNativeBuild())
        }
      />
    </Modal>
  )
}
