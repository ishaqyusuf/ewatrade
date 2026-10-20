import { readFileSync } from "node:fs"
import path from "node:path"
import { testFlightPreviewFailures } from "./check-testflight-preview.mjs"

// Build 1.0.0 (6), inspected from its signed IPA. New native builds must get
// their own verified compatibility target before this route is changed.
export const TESTFLIGHT_RUNTIME = "b3ad3f3baf65b159779712694db8d35cd9445149"

export function assertTestFlightRuntime(runtime: string) {
  if (runtime !== TESTFLIGHT_RUNTIME) {
    throw new Error(
      `TestFlight OTA stopped: native runtime ${runtime} does not match build 6 (${TESTFLIGHT_RUNTIME}). A new native build is required.`,
    )
  }
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dir, "..")
  const appDir = path.join(root, "apps/mobile")
  const eas = JSON.parse(readFileSync(path.join(appDir, "eas.json"), "utf8"))
  // Parent runner uses eas env:exec preview to load the hosted environment.
  // Reapply exactly the build-profile overrides after those hosted values.
  Object.assign(
    process.env,
    eas.build.preview.env,
    eas.build["testflight-preview"].env,
    {
      APP_ENV: "preview",
      DEV_PROFILE: "preview",
      EAS_BUILD_PROFILE: "testflight-preview",
      EXPO_NO_DOTENV: "1",
      SENTRY_DISABLE_AUTO_UPLOAD: "true",
    },
  )
  const { default: app } = await import("../apps/mobile/app.config")
  const failures = testFlightPreviewFailures({ env: process.env, app, eas })
  if (failures.length) throw new Error(failures.join("\n"))
  const expo = JSON.parse(
    readFileSync(
      require.resolve("expo/package.json", { paths: [appDir] }),
      "utf8",
    ),
  )
  if (Number(expo.version.split(".")[0]) >= 55) {
    throw new Error(
      "Revalidate TestFlight profile override precedence for Expo SDK 55 before publishing.",
    )
  }
  const proc = Bun.spawn(
    [
      "node",
      require.resolve("expo-updates/bin/cli.js", { paths: [appDir] }),
      "runtimeversion:resolve",
      "--platform",
      "ios",
      "--workflow",
      "managed",
    ],
    { cwd: appDir, env: process.env, stdout: "pipe", stderr: "inherit" },
  )
  const output = await new Response(proc.stdout).text()
  if ((await proc.exited) !== 0)
    throw new Error("Native runtime calculation failed")
  assertTestFlightRuntime(JSON.parse(output).runtimeVersion)
  console.log(`Verified TestFlight build 6 runtime: ${TESTFLIGHT_RUNTIME}`)
  const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root })
    .stdout.toString()
    .trim()
  // SDK 54 permits inherited env. Avoid --environment here: it would reapply
  // hosted URLs over the store build's reviewed profile overrides.
  const publish = Bun.spawn(
    [
      "eas",
      "update",
      "--platform",
      "ios",
      "--channel",
      "testflight-preview",
      "--message",
      `TestFlight Preview OTA ${head.slice(0, 12)}`,
      "--non-interactive",
      "--emit-metadata",
    ],
    {
      cwd: appDir,
      env: process.env,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    },
  )
  process.exitCode = await publish.exited
}
