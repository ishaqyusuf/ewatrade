import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT_PATH = new URL("./check-google-oauth-ready.mjs", import.meta.url)
  .pathname
const EXAMPLE_ENV = [
  "GOOGLE_CLIENT_ID=",
  "GOOGLE_WEB_CLIENT_ID=",
  "GOOGLE_ANDROID_CLIENT_ID=",
  "GOOGLE_IOS_CLIENT_ID=",
  "EXPO_PUBLIC_GOOGLE_CLIENT_ID=",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=",
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=",
].join("\n")
const VALID_ENV = [
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=1234567890-androiddev.apps.googleusercontent.com",
  "GOOGLE_ANDROID_CLIENT_ID=1234567890-androiddev.apps.googleusercontent.com",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=2234567890-iosdev.apps.googleusercontent.com",
  "GOOGLE_IOS_CLIENT_ID=2234567890-iosdev.apps.googleusercontent.com",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=3234567890-web.apps.googleusercontent.com",
  "GOOGLE_WEB_CLIENT_ID=3234567890-web.apps.googleusercontent.com",
].join("\n")

const CASES = [
  {
    env: VALID_ENV,
    expectedStatus: 0,
    label: "valid matching client IDs",
    requiredOutput: "Google OAuth readiness check passed.",
    requiredOutputs: [
      "Google OAuth readiness check passed.",
      "https://console.cloud.google.com/auth/clients?project=ewatrade-mobile-retail-ops",
    ],
  },
  {
    env: VALID_ENV.replace(
      "3234567890-web.apps.googleusercontent.com",
      "not-a-google-client-id",
    ),
    expectedStatus: 1,
    label: "invalid client ID shape",
    requiredOutput:
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must contain Google OAuth client IDs",
  },
  {
    env: VALID_ENV.replace(
      "GOOGLE_ANDROID_CLIENT_ID=1234567890-androiddev.apps.googleusercontent.com",
      "GOOGLE_ANDROID_CLIENT_ID=9994567890-otherandroid.apps.googleusercontent.com",
    ),
    expectedStatus: 1,
    label: "mobile/API Android audience mismatch",
    requiredOutput:
      "API Android allowed audience must include the same client ID used by EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID.",
  },
]

for (const testCase of CASES) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-google-oauth-"))
  const envFile = join(fixtureDir, ".env")
  const exampleEnvFile = join(fixtureDir, ".env.example")
  const debugKeystore = join(fixtureDir, "debug.keystore")

  try {
    writeFileSync(envFile, `${testCase.env}\n`)
    writeFileSync(exampleEnvFile, `${EXAMPLE_ENV}\n`)
    writeFileSync(debugKeystore, "")

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      env: {
        ...process.env,
        GOOGLE_OAUTH_READY_DEBUG_KEYSTORE: debugKeystore,
        GOOGLE_OAUTH_READY_ENV_FILE: envFile,
        GOOGLE_OAUTH_READY_EXAMPLE_ENV_FILE: exampleEnvFile,
      },
      encoding: "utf8",
    })
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

    if (result.status !== testCase.expectedStatus) {
      fail(
        testCase.label,
        `Expected status ${testCase.expectedStatus}, received ${result.status}.`,
        output,
      )
    }

    const requiredOutputs = testCase.requiredOutputs ?? [
      testCase.requiredOutput,
    ]
    for (const requiredOutput of requiredOutputs) {
      if (!output.includes(requiredOutput)) {
        fail(
          testCase.label,
          `Expected output to include: ${requiredOutput}`,
          output,
        )
      }
    }
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true })
  }
}

console.log("Google OAuth readiness fixture checks passed.")

function fail(label, message, output) {
  console.error(`Google OAuth readiness fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}
