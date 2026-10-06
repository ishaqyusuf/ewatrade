import {
  APP_UPDATE_SCOPE,
  type PublishedMobileBuild,
  isNewerBuild,
  parseBuildNumber,
  parsePublishedBuild,
} from "@ewatrade/utils/app-update"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { requireOptionalNativeModule } from "expo"
import Constants from "expo-constants"
import * as FileSystem from "expo-file-system/legacy"
import * as Linking from "expo-linking"
import * as Updates from "expo-updates"
import { Platform } from "react-native"
import { create } from "zustand"
import {
  APP_UPDATE_RESUME_ROUTES,
  type AppUpdateResume,
  canInstallBuildFromRoute,
} from "./app-update-restoration"
import { getBaseUrl } from "./base-url"
import { getSession } from "./session-store"

type Installer = {
  identity: () => { applicationId: string; buildNumber: string }
  canInstall: () => boolean
  openInstallSettings: () => Promise<void>
  verifyApk: (
    uri: string,
    sha256: string,
    size: number,
    build: number,
  ) => Promise<boolean>
  installApk: (uri: string) => Promise<void>
}
const installer = requireOptionalNativeModule<Installer>("AppUpdate")
export const APP_UPDATE_RESUME_KEY = "app-update-resume-v1"
const DISMISS_KEY = "app-update-dismiss-v1"
export type BuildPhase =
  | "idle"
  | "available"
  | "downloading"
  | "verifying"
  | "permission"
  | "installing"
  | "failed"
type State = {
  build: PublishedMobileBuild | null
  phase: BuildPhase
  progress: number | undefined
  error: string | null
  visible: boolean
  busy: boolean
}
export const useAppUpdate = create<State>(() => ({
  build: null,
  phase: "idle",
  progress: undefined,
  error: null,
  visible: false,
  busy: false,
}))
let running = false
export async function withAppUpdateLock<T>(
  work: () => Promise<T>,
): Promise<T | undefined> {
  if (running) return
  running = true
  useAppUpdate.setState({ busy: true })
  try {
    return await work()
  } finally {
    running = false
    useAppUpdate.setState({ busy: false })
  }
}
export function installedBuild() {
  if (Platform.OS !== "android" || Updates.channel !== "preview") return null
  const native = installer?.identity()
  if (native && native.applicationId !== APP_UPDATE_SCOPE.applicationId)
    return null
  try {
    return {
      ...APP_UPDATE_SCOPE,
      buildNumber: parseBuildNumber(
        native?.buildNumber ?? Constants.nativeBuildVersion,
      ),
    }
  } catch {
    return null
  }
}
export async function checkNativeBuild(manual = false): Promise<boolean> {
  if (__DEV__) return false
  const installed = installedBuild()
  if (!installed) return false
  if (useAppUpdate.getState().visible && !manual) return true
  const url = new URL("/api/mobile/builds/check", getBaseUrl())
  for (const [key, value] of Object.entries(installed))
    url.searchParams.set(key, String(value))
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json" },
  })
  // Allow staged rollout when this API has not been deployed yet.
  if (response.status === 404) return false
  if (!response.ok)
    throw new Error("Could not check new builds. Try again when connected.")
  const result = await response.json()
  if (!result || typeof result !== "object" || !("build" in result))
    throw new Error("Invalid build response")
  if (!result.build) {
    useAppUpdate.setState({
      build: null,
      phase: "idle",
      visible: false,
      error: null,
    })
    return false
  }
  const build = parsePublishedBuild(result.build)
  if (!isNewerBuild(build, installed)) return false
  let dismissed = false
  try {
    const value = JSON.parse(
      (await AsyncStorage.getItem(DISMISS_KEY)) ?? "null",
    )
    dismissed = value?.revision === build.revision && value?.until > Date.now()
  } catch {
    /* A malformed local preference must not break updates. */
  }
  useAppUpdate.setState({
    build,
    phase: "available",
    error: null,
    visible: manual || !dismissed,
  })
  return manual || !dismissed
}
export async function dismissNativeBuild() {
  if (running) return
  const build = useAppUpdate.getState().build
  if (build)
    await AsyncStorage.setItem(
      DISMISS_KEY,
      JSON.stringify({
        revision: build.revision,
        until: Date.now() + 86400000,
      }),
    ).catch(() => undefined)
  useAppUpdate.setState({ visible: false })
}

let download: FileSystem.DownloadResumable | null = null
let cancelled = false
export async function cancelBuildDownload() {
  cancelled = true
  await download?.cancelAsync().catch(() => undefined)
}
export async function downloadAndInstallBuild(route: string) {
  const build = useAppUpdate.getState().build
  if (!build) {
    await withAppUpdateLock(async () => {
      try {
        await checkNativeBuild(true)
      } catch {
        useAppUpdate.setState({
          error: "Could not check new builds. Try again when connected.",
        })
      }
    })
    return
  }
  if (!canInstallBuildFromRoute(route)) {
    useAppUpdate.setState({
      error: "Finish your current task, then open App updates to install.",
      phase: "failed",
    })
    return
  }
  await withAppUpdateLock(async () => {
    cancelled = false
    const directory = `${FileSystem.cacheDirectory}app-updates/`
    const uri = `${directory}${build.buildNumber}-${build.revision}.apk`
    try {
      useAppUpdate.setState({ error: null })
      if (!installer) {
        await Linking.openURL(build.artifactUrl)
        useAppUpdate.setState({ phase: "installing" })
        return
      }
      if (!installer.canInstall()) {
        useAppUpdate.setState({ phase: "permission" })
        await installer.openInstallSettings()
        return
      }
      const free = await FileSystem.getFreeDiskStorageAsync()
      if (free < build.sizeBytes * 2)
        throw new Error("Free some storage, then try again.")
      // Only one installer owns this cache, under the shared update lock.
      await FileSystem.deleteAsync(directory, { idempotent: true })
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
      useAppUpdate.setState({ phase: "downloading", progress: 0 })
      download = FileSystem.createDownloadResumable(
        build.artifactUrl,
        uri,
        {},
        (event) => {
          useAppUpdate.setState({
            progress: Math.min(1, event.totalBytesWritten / build.sizeBytes),
          })
          if (event.totalBytesWritten > build.sizeBytes) {
            cancelled = true
            void download?.cancelAsync().catch(() => undefined)
          }
        },
      )
      const result = await download.downloadAsync()
      if (cancelled) throw new Error("Download cancelled. You can try again.")
      if (result?.status !== 200) throw new Error("Download failed. Try again.")
      useAppUpdate.setState({ phase: "verifying" })
      await installer.verifyApk(
        uri,
        build.sha256,
        build.sizeBytes,
        build.buildNumber,
      )
      // Re-read before handoff. A withdrawn/replaced build must not be installed.
      const stillAvailable = await checkNativeBuild(true)
      if (
        !stillAvailable ||
        useAppUpdate.getState().build?.revision !== build.revision
      )
        throw new Error("This build changed. Check for updates again.")
      const session = getSession()
      if (session && APP_UPDATE_RESUME_ROUTES.includes(route)) {
        const snapshot: AppUpdateResume = {
          schemaVersion: 1,
          route,
          targetBuild: build.buildNumber,
          userId: session.profile.id,
          businessId: session.profile.businessId ?? null,
          storeId: session.profile.storeId ?? null,
          savedAt: Date.now(),
        }
        await AsyncStorage.setItem(
          APP_UPDATE_RESUME_KEY,
          JSON.stringify(snapshot),
        )
      }
      await installer.installApk(uri)
      useAppUpdate.setState({ phase: "installing", visible: true })
    } catch (error) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
        () => undefined,
      )
      useAppUpdate.setState({
        phase: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Could not install this build.",
        visible: true,
      })
    } finally {
      download = null
    }
  })
}
