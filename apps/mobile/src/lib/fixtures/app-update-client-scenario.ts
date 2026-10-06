import { mock } from "bun:test"
import assert from "node:assert/strict"
import { APP_UPDATE_SCOPE } from "@ewatrade/utils/app-update"

const scenario = process.argv[2] ?? ""
const legacy = scenario.startsWith("legacy-")
const calls = {
  identity: 0,
  requests: 0,
  downloads: 0,
  verifies: 0,
  installs: 0,
  browser: 0,
  settings: 0,
  cancelled: 0,
}
const stored = new Map<string, string>()
const deleted: string[] = []
const build = {
  ...APP_UPDATE_SCOPE,
  schemaVersion: 1,
  buildNumber: 12,
  appVersion: "1.2.0",
  artifactUrl: "https://expo.dev/artifacts/eas/example.apk",
  sha256: "a".repeat(64),
  sizeBytes: 100,
  notes: "",
  revision: 1,
  active: true,
  publishedAt: "2026-10-03T00:00:00Z",
}
let offer: unknown = build
let status = 200
let offline = false
let allowed = scenario !== "native-permission-retry"
let cancelFirstDownload = scenario === "native-cancel-retry"
let rejectDownload: ((error: Error) => void) | undefined
let downloadStarted: () => void = () => {}
const started = new Promise<void>((resolve) => {
  downloadStarted = resolve
})
const session = {
  profile: { id: "qa-user", businessId: "qa-business", storeId: "qa-store" },
}

mock.module("expo", () => ({
  requireOptionalNativeModule: () =>
    legacy
      ? null
      : {
          identity: () => ({
            applicationId: APP_UPDATE_SCOPE.applicationId,
            buildNumber: "9",
          }),
          canInstall: () => allowed,
          openInstallSettings: async () => {
            calls.settings++
          },
          verifyApk: async (
            _uri: string,
            sha: string,
            size: number,
            number: number,
          ) => {
            calls.verifies++
            assert.equal(sha, build.sha256)
            assert.equal(size, build.sizeBytes)
            assert.equal(number, build.buildNumber)
            if (scenario === "native-verification-failure")
              throw new Error("Checksum mismatch")
            return true
          },
          installApk: async () => {
            calls.installs++
          },
        },
}))
mock.module("react-native", () => ({
  Platform: { OS: "android" },
  TurboModuleRegistry: {
    get: (name: string) => {
      assert.equal(name, "RNSentry")
      if (scenario === "legacy-missing-reader") return null
      return {
        fetchNativeRelease: async () => {
          calls.identity++
          if (scenario === "legacy-reader-retry" && calls.identity === 1)
            throw new Error("Native temporarily unavailable")
          return {
            id:
              scenario === "legacy-wrong-app"
                ? "com.ewatrade.app"
                : APP_UPDATE_SCOPE.applicationId,
            build: "9",
          }
        },
      }
    },
  },
}))
mock.module("expo-updates", () => ({
  channel: scenario === "production" ? "production" : "preview",
}))
mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => stored.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      stored.set(key, value)
    },
  },
}))
mock.module("expo-linking", () => ({
  openURL: async (url: string) => {
    assert.equal(url, build.artifactUrl)
    calls.browser++
  },
}))
mock.module("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  getFreeDiskStorageAsync: async () => 10000,
  deleteAsync: async (uri: string) => {
    deleted.push(uri)
  },
  makeDirectoryAsync: async () => {},
  createDownloadResumable: () => ({
    downloadAsync: async () => {
      calls.downloads++
      downloadStarted()
      if (cancelFirstDownload)
        return new Promise((_resolve, reject) => {
          rejectDownload = reject
        })
      return { status: 200 }
    },
    cancelAsync: async () => {
      calls.cancelled++
      cancelFirstDownload = false
      rejectDownload?.(new Error("Download cancelled"))
    },
  }),
}))
mock.module(new URL("../base-url.ts", import.meta.url).pathname, () => ({
  getBaseUrl: () => "https://preview-api.example.test",
}))
mock.module(new URL("../session-store.ts", import.meta.url).pathname, () => ({
  getSession: () => session,
}))
Object.assign(globalThis, { __DEV__: false })
globalThis.fetch = (async (input: string | URL | Request) => {
  calls.requests++
  const url = new URL(String(input))
  assert.equal(url.pathname, "/api/mobile/builds/check")
  assert.equal(
    url.searchParams.get("applicationId"),
    APP_UPDATE_SCOPE.applicationId,
  )
  assert.equal(url.searchParams.get("buildNumber"), "9")
  if (offline) throw new Error("Offline")
  return Response.json({ build: offer }, { status })
}) as typeof fetch

const client = await import("../app-update-client")
const state = client.useAppUpdate.getState
if (
  ["legacy-wrong-app", "legacy-missing-reader", "production"].includes(scenario)
) {
  assert.equal(await client.checkNativeBuild(true), false)
  assert.equal(calls.requests, 0)
  assert.equal(calls.browser, 0)
} else if (scenario === "operation-lock") {
  let release: () => void = () => {}
  const pending = client.withAppUpdateLock(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  assert.equal(state().busy, true)
  let secondRan = false
  await client.withAppUpdateLock(async () => {
    secondRan = true
  })
  assert.equal(secondRan, false)
  release()
  await pending
  assert.equal(state().busy, false)
  await assert.rejects(
    client.withAppUpdateLock(async () => {
      throw new Error("failure")
    }),
  )
  assert.equal(state().busy, false)
} else {
  if (scenario === "legacy-reader-retry") {
    assert.equal(await client.checkNativeBuild(true), false)
    assert.equal(calls.requests, 0)
  }
  assert.equal(await client.checkNativeBuild(true), true)
  assert.equal(client.installedBuild()?.buildNumber, 9)
  assert.equal(state().visible, true)
  if (scenario === "snooze") {
    await client.dismissNativeBuild()
    assert.equal(state().visible, false)
    assert.equal(await client.checkNativeBuild(), false)
    assert.equal(await client.checkNativeBuild(true), true)
  } else if (scenario === "stale-offer-404") {
    status = 404
    assert.equal(await client.checkNativeBuild(true), false)
    assert.equal(state().build, null)
    assert.equal(state().visible, false)
  } else if (scenario === "form-refusal") {
    await client.downloadAndInstallBuild("/orders/new")
    assert.equal(state().phase, "failed")
    assert.equal(calls.downloads, 0)
    assert.equal(calls.installs, 0)
  } else {
    if (scenario.endsWith("withdrawn")) offer = null
    if (scenario === "legacy-replaced")
      offer = { ...build, revision: 2, buildNumber: 13 }
    if (scenario === "legacy-offline") offline = true
    if (scenario === "native-permission-retry") {
      await client.downloadAndInstallBuild("/updates")
      assert.equal(state().phase, "permission")
      assert.equal(calls.settings, 1)
      assert.equal(calls.downloads, 0)
      allowed = true
    }
    if (scenario === "native-cancel-retry") {
      const downloading = client.downloadAndInstallBuild("/updates")
      await started
      await client.cancelBuildDownload()
      await downloading
      assert.equal(state().phase, "failed")
      assert.equal(calls.installs, 0)
      assert.equal(calls.cancelled, 1)
      assert(deleted.includes("file:///cache/app-updates/12-1.apk"))
    }
    await client.downloadAndInstallBuild("/updates")
    const refused = [
      "legacy-withdrawn",
      "legacy-replaced",
      "legacy-offline",
      "native-withdrawn",
      "native-verification-failure",
    ].includes(scenario)
    assert.equal(state().phase, refused ? "failed" : "installing")
    assert.equal(calls.browser, !refused && legacy ? 1 : 0)
    assert.equal(calls.installs, !refused && !legacy ? 1 : 0)
    if (!refused) {
      const resume = JSON.parse(
        stored.get(client.APP_UPDATE_RESUME_KEY) ?? "null",
      )
      assert.equal(resume.targetBuild, 12)
      assert.equal(resume.route, "/updates")
      assert.equal(resume.userId, session.profile.id)
    } else {
      assert.equal(stored.has(client.APP_UPDATE_RESUME_KEY), false)
    }
    assert.equal(state().busy, false)
  }
}
console.log(`${scenario}: passed`)
