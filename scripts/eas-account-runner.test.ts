import { afterEach, expect, test } from "bun:test"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { validatePreviewMobileTarget } from "./eas-preview-mobile-target"

const runDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    runDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

const exactBuildId = "00000000-0000-4000-8000-000000000001"
const reviewedCommit = "c".repeat(40)

for (const [expectedExitCode, platform, operation, mismatch] of [
  [0, "android", "build"],
  [23, "android", "build"],
  [0, "android", "build", "dev"],
  [1, "android", "build", "missing_expected_commit"],
  [1, "android", "build", "short_expected_commit"],
  [1, "android", "build", "duplicate_expected_commit"],
  [1, "android", "build", "profile_override"],
  [1, "android", "build", "local_override"],
  [1, "android", "build", "auto_submit"],
  [1, "android", "build", "native_policy"],
  [1, "android", "build", "native_policy_second"],
  [1, "android", "build", "native_decision"],
  [1, "android", "build", "revision"],
  [1, "android", "build", "dirty"],
  [1, "android", "build", "dirty_after_login"],
  [1, "ios", "build", "native_policy"],
  [1, "android", "build", "attachment"],
  [0, "android", "build", "preview"],
  [1, "android", "build", "preview_attachment"],
  [1, "android", "update", "attachment"],
  [1, "android", "update", "teen"],
  [0, "ios", "build"],
  [1, "ios", "build", "ios_identity"],
  [0, "android", "submit"],
  [1, "android", "submit", "attachment"],
  [1, "android", "submit", "version"],
  [1, "android", "submit", "commit"],
  [1, "android", "submit", "missing_commit"],
  [0, "ios", "submit"],
  [1, "ios", "submit"],
  [0, "android", "view"],
  [0, "android", "env-sync"],
  [0, "android", "env-legal-sync"],
  [0, "android", "env-analytics-sync"],
  [0, "android", "env-check"],
  [1, "android", "env-check", "attachment"],
  [0, "android", "update", "preview_quick"],
  [0, "ios", "update", "preview_quick"],
  [0, "all", "update", "preview_quick"],
  [1, "android", "update", "preview_quick_attachment"],
  [1, "android", "update", "preview_release_missing"],
  [0, "android", "update", "preview_reviewed"],
  [1, "android", "update", "preview_quick_override"],
  [0, "android", "update"],
  [0, "ios", "update"],
  [0, "all", "update"],
  [1, "android", "update", "compatibility"],
  [1, "android", "update", "revision"],
  [1, "android", "update", "dirty"],
  [1, "android", "update", "missing_expected_commit"],
  [1, "android", "update", "dirty_after_login"],
  [1, "android", "update", "compatibility_second"],
] as const) {
  test(`handles ${platform} ${operation} with expected exit ${expectedExitCode}${mismatch ? ` (${mismatch})` : ""} and isolates EAS authentication`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ewatrade-eas-test-"))
    runDirs.push(root)
    const cli = path.join(root, "node_modules", "eas-cli")
    const fakeBin = path.join(root, "bin")
    const sharedHome = path.join(root, "shared-home")
    const capturePath = path.join(root, "capture.json")
    const preflightCapturePath = path.join(root, "preflight.txt")
    const authCapturePath = path.join(root, "auth.txt")
    const development = mismatch === "dev"
    const preview = mismatch?.startsWith("preview") ?? false
    const quickPreview = mismatch?.startsWith("preview_quick") ?? false
    await mkdir(path.join(root, "scripts"), { recursive: true })
    await mkdir(path.join(root, "apps", "mobile", "scripts"), {
      recursive: true,
    })
    await writeFile(
      path.join(root, "apps", "mobile", "app.config.ts"),
      'export const UPDATE_VERSION = "2026.09.22"\n',
    )
    await mkdir(path.join(cli, "bin"), { recursive: true })
    await mkdir(path.join(cli, "build", "user"), { recursive: true })
    await mkdir(fakeBin, { recursive: true })
    await mkdir(path.join(sharedHome, ".expo"), { recursive: true })
    await writeFile(
      path.join(root, ".env"),
      "EAS_EMAIL=test@example.test\nEAS_PASSWORD=fixture-password\n",
    )
    await writeFile(
      path.join(root, ".env.dev"),
      "EXPO_PUBLIC_API_URL=https://api-dev.example.test\n",
    )
    await writeFile(
      path.join(root, ".env.local"),
      "EXPO_PUBLIC_API_URL=https://wrong.local.test\nEXPO_PUBLIC_LOCAL_ONLY=must-not-leak\n",
    )
    await writeFile(
      path.join(root, ".env.preview"),
      "API_URL=https://api-preview.example.test\n",
    )
    await writeFile(
      path.join(root, ".env.production"),
      "API_URL=https://api.example.test\nEXPO_PUBLIC_API_URL=https://api.example.test\nEXPO_PUBLIC_LOGLY_ENABLED=false\nNEXT_PUBLIC_MARKETING_URL=https://ewatrade.com\n",
    )
    await writeFile(
      path.join(root, "apps", "mobile", ".env.preview"),
      "EXPO_PUBLIC_API_URL=https://api-preview.example.test\nEXPO_PUBLIC_LEGAL_ORIGIN=https://legal-preview.example.test\nEXPO_PUBLIC_BASE_URL=https://mobile-preview.example.test\nEXPO_PUBLIC_WEB_URL=https://web-preview.example.test\nEXPO_PUBLIC_CHAT_URL=https://chat-preview.example.test\n",
    )
    await writeFile(
      path.join(root, "apps", "mobile", ".env.production"),
      "EXPO_PUBLIC_LEGAL_ORIGIN=https://ewatrade.com\nEXPO_PUBLIC_API_URL=https://api.example.test\nEXPO_PUBLIC_BASE_URL=https://mobile.example.test\nEXPO_PUBLIC_WEB_URL=https://web.example.test\nEXPO_PUBLIC_CHAT_URL=https://chat.example.test\n",
    )
    await writeFile(
      path.join(sharedHome, ".expo", "state.json"),
      '{"auth":{"username":"other-app"}}\n',
    )
    await writeFile(
      path.join(root, "scripts", "eas-account-runner.ts"),
      await readFile(path.join(import.meta.dir, "eas-account-runner.ts")),
    )
    await writeFile(
      path.join(root, "scripts", "eas-preview-mobile-target.ts"),
      await readFile(
        path.join(import.meta.dir, "eas-preview-mobile-target.ts"),
      ),
    )
    await writeFile(
      path.join(root, "scripts", "release-app-update.ts"),
      `import { writeFileSync } from "node:fs"; export async function assertPreviewPublisherReady() {} export async function runPreviewBuildAndPublish(input) { const result = await input.runJson(input.command); if (result.code === 0) writeFileSync(${JSON.stringify(path.join(root, "preview-publication.txt"))}, input.expectedCommit); return result.code; }\n`,
    )
    await writeFile(
      path.join(root, "scripts", "release-mobile-preflight.ts"),
      `import { appendFileSync } from "node:fs"; let calls = 0; export async function assertMobilePublishReady(input) { calls += 1; appendFileSync(process.env.EAS_TEST_PREFLIGHT_CAPTURE, "compatibility\\n"); if (process.env.EAS_TEST_COMPAT_FAIL === "1" || (process.env.EAS_TEST_COMPAT_FAIL_SECOND === "1" && calls === 2)) throw new Error("signed compatibility bundle unavailable"); return { revision: process.env.EAS_TEST_GIT_REVISION_MISMATCH === "1" ? "${"c".repeat(40)}" : input.revision, environment: input.environment, platforms: input.platforms }; }\n`,
    )
    await writeFile(
      path.join(root, "scripts", "release-mobile-build-preflight.ts"),
      `import { appendFileSync } from "node:fs"; let calls = 0; export async function assertMobileBuildReady(input) { calls += 1; appendFileSync(process.env.EAS_TEST_PREFLIGHT_CAPTURE, "native-build\\n"); if (process.env.EAS_TEST_NATIVE_FAIL === "1" || (process.env.EAS_TEST_NATIVE_FAIL_SECOND === "1" && calls === 2)) throw new Error("native version proof refused"); return { revision: input.revision, environment: input.environment, platforms: process.env.EAS_TEST_NATIVE_DECISION_MISMATCH === "1" ? ["all"] : input.platforms }; }\n`,
    )
    for (const [label, relativePath] of [
      ["teen", "scripts/check-teen-release-readiness.mjs"],
      ["api", "apps/mobile/scripts/check-production-api-live.mjs"],
      ["legal", "scripts/check-production-legal-live.mjs"],
      ["billing", "scripts/check-store-billing-readiness.mjs"],
      ["ios-login", "scripts/check-ios-login-readiness.mjs"],
      ["ios-identity", "scripts/check-production-ios-identity.mjs"],
      ["attachment", "apps/mobile/scripts/check-expo-env-attachment.mjs"],
    ]) {
      await writeFile(
        path.join(root, relativePath),
        `import { appendFileSync, writeFileSync } from "node:fs"; appendFileSync(process.env.EAS_TEST_PREFLIGHT_CAPTURE, "${label}\\n"); if ("${label}" === "attachment" && process.env.EAS_TEST_DIRTY_AFTER_ATTACHMENT === "1") writeFileSync("${path.join(root, "apps", "mobile", "app.config.ts")}", "changed after initial preflight\\n"); if (process.env.EAS_TEST_PREFLIGHT_FAIL === "${label}") process.exit(7);\n`,
      )
    }
    await writeFile(
      path.join(cli, "package.json"),
      '{"name":"eas-cli","type":"commonjs"}\n',
    )
    await writeFile(
      path.join(cli, "build", "user", "fetchSessionSecretAndUser.js"),
      'exports.fetchSessionSecretAndUserAsync = async () => { require("node:fs").writeFileSync(process.env.EAS_TEST_AUTH_CAPTURE, "login\\n"); return { sessionSecret: "fixture-secret", id: "fixture-id", username: "fixture-user" }; };\n',
    )
    const easBin = path.join(cli, "bin", "run")
    await writeFile(
      easBin,
      `#!/usr/bin/env bun\nconst fs = require("node:fs"); const path = require("node:path"); const state = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".expo", "state.json"), "utf8")); fs.writeFileSync(process.env.EAS_TEST_CAPTURE, JSON.stringify({ home: process.env.HOME, username: state.auth.username, args: process.argv.slice(2), apiUrl: process.env.EXPO_PUBLIC_API_URL, localOnly: process.env.EXPO_PUBLIC_LOCAL_ONLY, profile: process.env.APP_ENV })); if (process.argv.includes("build:view")) console.log(JSON.stringify({ id: process.argv.find((arg) => /^[0-9a-f]{8}-/.test(arg)), status: "FINISHED", platform: process.env.EAS_TEST_BUILD_PLATFORM, buildProfile: "production", distribution: "STORE", channel: "production", appBuildVersion: process.env.EAS_TEST_BUILD_VERSION, gitCommitHash: process.env.EAS_TEST_BUILD_COMMIT === "missing" ? undefined : process.env.EAS_TEST_BUILD_COMMIT, isForIosSimulator: false, project: { id: "532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b", ownerAccount: { name: "cipron-startups" } }, artifacts: { buildUrl: "https://secret.example.test/artifact" } })); if (process.argv.includes("env:list")) console.log("EXPO_PUBLIC_API_URL=https://api.example.test\\nEXPO_PUBLIC_LEGAL_ORIGIN=https://ewatrade.com\\nEXPO_PUBLIC_LOGLY_ENABLED=false"); process.exitCode = Number(process.env.EAS_TEST_EXIT_CODE);\n`,
    )
    await chmod(easBin, 0o755)
    await symlink(easBin, path.join(fakeBin, "eas"))
    const gitBin = path.join(fakeBin, "git")
    await writeFile(
      gitBin,
      `#!/usr/bin/env bun\nconst fs = require("node:fs"); const args = process.argv.slice(2); if (args[0] === "rev-parse") process.stdout.write(process.env.EAS_TEST_GIT_REVISION_MISMATCH === "1" ? "${"d".repeat(40)}\\n" : "${"c".repeat(40)}\\n"); else if (args[0] === "status" && (process.env.EAS_TEST_GIT_DIRTY === "1" || fs.readFileSync("${path.join(root, "apps", "mobile", "app.config.ts")}", "utf8").includes("changed after initial preflight"))) process.stdout.write(" M apps/mobile/app.config.ts\\n");\n`,
    )
    await chmod(gitBin, 0o755)

    const proc = Bun.spawn({
      cmd: [
        "bun",
        "--env-file=/dev/null",
        path.join(root, "scripts", "eas-account-runner.ts"),
        operation,
        development ? "--dev" : preview ? "--preview" : "--prod",
        ...(platform !== "android" ? [`--platform=${platform}`] : []),
        ...((operation === "update" ||
          (operation === "build" && !development)) &&
        mismatch !== "missing_expected_commit" &&
        !quickPreview &&
        mismatch !== "preview_release_missing"
          ? [
              "--expected-commit",
              mismatch === "short_expected_commit"
                ? reviewedCommit.slice(0, 12)
                : reviewedCommit,
            ]
          : []),
        ...(mismatch === "preview_release_missing" ||
        mismatch === "preview_reviewed"
          ? ["--release-checks"]
          : []),
        ...(mismatch === "preview_quick_override"
          ? ["--channel=production"]
          : []),
        ...(mismatch === "duplicate_expected_commit"
          ? ["--expected-commit", reviewedCommit]
          : []),
        ...(mismatch === "profile_override"
          ? ["--profile", "development"]
          : []),
        ...(mismatch === "local_override" ? ["--local"] : []),
        ...(mismatch === "auto_submit" ? ["--auto-submit"] : []),
        ...(operation === "submit" || operation === "view"
          ? ["--id", exactBuildId]
          : []),
        ...(operation === "submit"
          ? ["--expected-version", "21", "--expected-commit", reviewedCommit]
          : []),
        "--non-interactive",
      ],
      cwd: root,
      env: {
        ...process.env,
        HOME: sharedHome,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
        EAS_TEST_CAPTURE: capturePath,
        EAS_TEST_AUTH_CAPTURE: authCapturePath,
        EAS_TEST_NATIVE_FAIL: mismatch === "native_policy" ? "1" : undefined,
        EAS_TEST_NATIVE_FAIL_SECOND:
          mismatch === "native_policy_second" ? "1" : undefined,
        EAS_TEST_NATIVE_DECISION_MISMATCH:
          mismatch === "native_decision" ? "1" : undefined,
        EAS_TEST_PREFLIGHT_CAPTURE: preflightCapturePath,
        EAS_TEST_PREFLIGHT_FAIL:
          mismatch === "attachment" ||
          mismatch === "preview_attachment" ||
          mismatch === "preview_quick_attachment"
            ? "attachment"
            : mismatch === "teen"
              ? "teen"
              : mismatch === "ios_identity"
                ? "ios-identity"
                : expectedExitCode === 1 &&
                    platform === "ios" &&
                    mismatch === undefined
                  ? "legal"
                  : undefined,
        EAS_TEST_COMPAT_FAIL:
          mismatch === "compatibility" || quickPreview ? "1" : undefined,
        EAS_TEST_COMPAT_FAIL_SECOND:
          mismatch === "compatibility_second" ? "1" : undefined,
        EAS_TEST_DIRTY_AFTER_ATTACHMENT:
          mismatch === "dirty_after_login" ? "1" : undefined,
        EAS_TEST_GIT_REVISION_MISMATCH:
          mismatch === "revision" ? "1" : undefined,
        EAS_TEST_GIT_DIRTY:
          mismatch === "dirty" || quickPreview ? "1" : undefined,
        EAS_TEST_GIT_REVISION: reviewedCommit,
        EAS_TEST_BUILD_PLATFORM: platform.toUpperCase(),
        EAS_TEST_BUILD_VERSION: mismatch === "version" ? "20" : "21",
        EAS_TEST_BUILD_COMMIT:
          mismatch === "commit"
            ? "d".repeat(40)
            : mismatch === "missing_commit"
              ? "missing"
              : reviewedCommit,
        EAS_TEST_EXIT_CODE: String(
          expectedExitCode === 1 ? 0 : expectedExitCode,
        ),
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    const stderrPromise = new Response(proc.stderr).text()
    const exitCode = await proc.exited
    const stderr = await stderrPromise
    expect(exitCode, stderr).toBe(expectedExitCode)
    if (operation === "build" && mismatch === "preview") {
      expect(
        await readFile(path.join(root, "preview-publication.txt"), "utf8"),
      ).toBe(reviewedCommit)
    }

    if (expectedExitCode === 1 && operation === "build") {
      const noPreflight = [
        "missing_expected_commit",
        "short_expected_commit",
        "duplicate_expected_commit",
        "profile_override",
        "local_override",
        "auto_submit",
      ].includes(mismatch ?? "")
      if (noPreflight) {
        await expect(readFile(preflightCapturePath)).rejects.toMatchObject({
          code: "ENOENT",
        })
      } else {
        const ordinary = preview
          ? ""
          : platform === "ios"
            ? "teen\napi\nlegal\nios-login\nios-identity\n"
            : "teen\napi\nlegal\n"
        const events =
          mismatch === "ios_identity"
            ? ordinary
            : mismatch === "revision" || mismatch === "dirty"
              ? ordinary
              : mismatch === "native_policy" || mismatch === "native_decision"
                ? `${ordinary}native-build\n`
                : mismatch === "native_policy_second"
                  ? `${ordinary}native-build\nattachment\nnative-build\n`
                  : `${ordinary}native-build\nattachment\n`
        expect(await readFile(preflightCapturePath, "utf8")).toBe(events)
      }
      await expect(readFile(capturePath)).rejects.toMatchObject({
        code: "ENOENT",
      })
      if (
        [
          "attachment",
          "preview_attachment",
          "dirty_after_login",
          "native_policy_second",
        ].includes(mismatch ?? "")
      )
        expect(await readFile(authCapturePath, "utf8")).toBe("login\n")
      else
        await expect(readFile(authCapturePath)).rejects.toMatchObject({
          code: "ENOENT",
        })
      return
    }

    if (expectedExitCode === 1) {
      if (
        operation === "update" &&
        [
          "missing_expected_commit",
          "preview_release_missing",
          "preview_quick_override",
        ].includes(mismatch ?? "")
      ) {
        await expect(readFile(preflightCapturePath)).rejects.toMatchObject({
          code: "ENOENT",
        })
        await expect(readFile(capturePath)).rejects.toMatchObject({
          code: "ENOENT",
        })
        return
      }
      expect(await readFile(preflightCapturePath, "utf8")).toBe(
        operation === "env-check"
          ? "attachment\n"
          : preview
            ? "attachment\n"
            : operation === "update"
              ? mismatch === "dirty_after_login"
                ? "teen\napi\nlegal\ncompatibility\nattachment\n"
                : mismatch === "compatibility_second"
                  ? "teen\napi\nlegal\ncompatibility\nattachment\ncompatibility\n"
                  : mismatch === "teen"
                    ? "teen\n"
                    : mismatch === "attachment"
                      ? "teen\napi\nlegal\ncompatibility\nattachment\n"
                      : mismatch === "compatibility"
                        ? "teen\napi\nlegal\ncompatibility\n"
                        : "teen\napi\nlegal\n"
              : mismatch === "attachment"
                ? "teen\napi\nlegal\nbilling\nattachment\n"
                : platform === "ios"
                  ? "teen\napi\nlegal\n"
                  : "teen\napi\nlegal\nbilling\nattachment\n",
      )
      if (operation === "update") {
        await expect(readFile(capturePath)).rejects.toMatchObject({
          code: "ENOENT",
        })
      } else if (platform === "ios" || mismatch === "attachment") {
        await expect(readFile(capturePath)).rejects.toMatchObject({
          code: "ENOENT",
        })
      } else {
        const inspected = JSON.parse(await readFile(capturePath, "utf8"))
        expect(inspected.args).toEqual(["build:view", exactBuildId, "--json"])
      }
      return
    }

    if (operation === "env-check") {
      expect(await readFile(preflightCapturePath, "utf8")).toBe("attachment\n")
      await expect(readFile(capturePath)).rejects.toMatchObject({
        code: "ENOENT",
      })
      expect(
        await readFile(path.join(sharedHome, ".expo", "state.json"), "utf8"),
      ).toBe('{"auth":{"username":"other-app"}}\n')
      return
    }

    const capture = JSON.parse(await readFile(capturePath, "utf8")) as {
      home: string
      username: string
      args: string[]
      apiUrl: string
      localOnly?: string
      profile: string
    }
    expect(capture.home).not.toBe(sharedHome)
    expect(capture.username).toBe("fixture-user")
    expect(capture.apiUrl).toBe(
      development
        ? "https://api-dev.example.test"
        : preview
          ? "https://api-preview.example.test"
          : "https://api.example.test",
    )
    expect(capture.localOnly).toBeUndefined()
    expect(capture.profile).toBe(
      development ? "dev" : preview ? "preview" : "production",
    )
    expect(capture.args).toEqual(
      operation === "view"
        ? ["build:view", exactBuildId, "--json"]
        : operation === "env-sync" ||
            operation === "env-legal-sync" ||
            operation === "env-analytics-sync"
          ? [
              "env:list",
              "production",
              "--format",
              "short",
              "--scope",
              "project",
            ]
          : operation === "update"
            ? [
                "update",
                "--platform",
                platform,
                "--channel",
                preview ? "preview" : "production",
                "--environment",
                preview ? "preview" : "production",
                "--message",
                quickPreview
                  ? "Preview OTA update"
                  : `OTA update ${reviewedCommit.slice(0, 12)}`,
                "--non-interactive",
              ]
            : [
                operation,
                "--platform",
                platform,
                "--profile",
                development
                  ? "development"
                  : preview
                    ? "preview"
                    : "production",
                ...(operation === "submit" ? ["--id", exactBuildId] : []),
                "--non-interactive",
              ],
    )
    if (operation === "submit") {
      expect(await readFile(preflightCapturePath, "utf8")).toBe(
        platform === "ios"
          ? "teen\napi\nlegal\nbilling\nios-login\nios-identity\nattachment\n"
          : "teen\napi\nlegal\nbilling\nattachment\n",
      )
    }
    if (operation === "build") {
      if (development)
        await expect(readFile(preflightCapturePath)).rejects.toMatchObject({
          code: "ENOENT",
        })
      else
        expect(await readFile(preflightCapturePath, "utf8")).toBe(
          `${preview ? "" : platform === "ios" ? "teen\napi\nlegal\nios-login\nios-identity\n" : "teen\napi\nlegal\n"}native-build\nattachment\nnative-build\n`,
        )
    }
    if (operation === "update") {
      expect(await readFile(preflightCapturePath, "utf8")).toBe(
        quickPreview
          ? "attachment\n"
          : `${preview ? "" : platform === "ios" || platform === "all" ? "teen\napi\nlegal\nios-login\nios-identity\n" : "teen\napi\nlegal\n"}compatibility\nattachment\ncompatibility\n`,
      )
      expect(
        await readFile(
          path.join(root, "apps", "mobile", "app.config.ts"),
          "utf8",
        ),
      ).toBe(`export const UPDATE_VERSION = "2026.09.22"\n`)
    }
    if (operation === "env-sync") {
      expect(await readFile(preflightCapturePath, "utf8")).toBe("api\n")
    }
    expect(
      await readFile(path.join(sharedHome, ".expo", "state.json"), "utf8"),
    ).toBe('{"auth":{"username":"other-app"}}\n')
    await expect(readFile(capture.home)).rejects.toMatchObject({
      code: "ENOENT",
    })
  })
}

test("preview mobile target rejects absent, production and malformed endpoints", () => {
  const good = {
    apiUrl: "https://api-preview.example.test",
    expectedApiUrl: "https://api-preview.example.test",
    legalOrigin: "https://legal-preview.example.test",
    productionApiUrl: "https://api.example.test",
    baseUrl: "https://web-preview.example.test",
    webUrl: "https://web-preview.example.test",
    chatUrl: "https://chat-preview.example.test",
    productionBaseUrl: "https://web.example.test",
    productionWebUrl: "https://web.example.test",
    productionChatUrl: "https://chat.example.test",
  }
  expect(() => validatePreviewMobileTarget(good)).not.toThrow()
  expect(() =>
    validatePreviewMobileTarget({ ...good, apiUrl: undefined }),
  ).toThrow("Preview mobile API must explicitly match")
  expect(() =>
    validatePreviewMobileTarget({ ...good, apiUrl: good.productionApiUrl }),
  ).toThrow("Preview mobile API must explicitly match")
  expect(() =>
    validatePreviewMobileTarget({ ...good, apiUrl: "http://localhost:3095" }),
  ).toThrow("Preview mobile API must explicitly match")
  expect(() =>
    validatePreviewMobileTarget({ ...good, productionApiUrl: undefined }),
  ).toThrow("Preview mobile API must explicitly match")
  expect(() =>
    validatePreviewMobileTarget({ ...good, legalOrigin: undefined }),
  ).toThrow("Preview mobile legal origin must be an explicit HTTPS origin")
  expect(() =>
    validatePreviewMobileTarget({ ...good, chatUrl: good.productionChatUrl }),
  ).toThrow("Preview mobile chat origin must be explicit HTTPS")
  expect(() =>
    validatePreviewMobileTarget({ ...good, webUrl: undefined }),
  ).toThrow("Preview mobile web origin must be explicit HTTPS")
})
