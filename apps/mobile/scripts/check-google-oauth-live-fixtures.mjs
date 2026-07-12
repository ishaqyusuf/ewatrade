import { spawn, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

const READY_SCRIPT_PATH = new URL(
  "./check-google-oauth-live-ready.mjs",
  import.meta.url,
).pathname
const LIVE_SCRIPT_PATH = new URL(
  "./run-google-oauth-live-qa.mjs",
  import.meta.url,
).pathname
const ID_TOKEN = `header.${"x".repeat(120)}.signature`
const ANDROID_CLIENT_ID = "1234567890-androiddev.apps.googleusercontent.com"
const IOS_CLIENT_ID = "1234567890-iosdev.apps.googleusercontent.com"
const WEB_CLIENT_ID = "1234567890-webdev.apps.googleusercontent.com"
const EXAMPLE_ENV_CONTENT = [
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=",
  "GOOGLE_ANDROID_CLIENT_ID=",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=",
  "GOOGLE_IOS_CLIENT_ID=",
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=",
  "EXPO_PUBLIC_GOOGLE_CLIENT_ID=",
  "GOOGLE_WEB_CLIENT_ID=",
  "GOOGLE_CLIENT_ID=",
  "EWATRADE_GOOGLE_LIVE_CONFIRM_AUTH=",
  "EWATRADE_GOOGLE_LIVE_ID_TOKEN=",
  "EWATRADE_GOOGLE_LIVE_MODE=",
  "EWATRADE_GOOGLE_LIVE_EXPECTED_EMAIL=",
  "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH=",
  "EWATRADE_GOOGLE_LIVE_NAME=",
  "EWATRADE_GOOGLE_LIVE_BUSINESS_NAME=",
  "EWATRADE_GOOGLE_LIVE_ALLOW_LOCALHOST=",
].join("\n")
const VALID_ENV_CONTENT = [
  "EWATRADE_API_URL=http://127.0.0.1:4010",
  `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=${ANDROID_CLIENT_ID}`,
  `GOOGLE_ANDROID_CLIENT_ID=${ANDROID_CLIENT_ID}`,
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=${IOS_CLIENT_ID}`,
  `GOOGLE_IOS_CLIENT_ID=${IOS_CLIENT_ID}`,
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${WEB_CLIENT_ID}`,
  "EXPO_PUBLIC_GOOGLE_CLIENT_ID=",
  `GOOGLE_WEB_CLIENT_ID=${WEB_CLIENT_ID}`,
  "GOOGLE_CLIENT_ID=",
  "EWATRADE_GOOGLE_LIVE_CONFIRM_AUTH=1",
  `EWATRADE_GOOGLE_LIVE_ID_TOKEN=${ID_TOKEN}`,
  "EWATRADE_GOOGLE_LIVE_MODE=sign_up",
  "EWATRADE_GOOGLE_LIVE_EXPECTED_EMAIL=owner@qa-mail.test",
  "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH=/tmp/ewatrade-google-live-evidence.json",
  "EWATRADE_GOOGLE_LIVE_NAME=QA Owner",
  "EWATRADE_GOOGLE_LIVE_BUSINESS_NAME=QA Store",
  "EWATRADE_GOOGLE_LIVE_ALLOW_LOCALHOST=1",
].join("\n")

runReadinessScenario({
  envContent: VALID_ENV_CONTENT,
  expectedStatus: 0,
  label: "valid live Google OAuth setup",
  requiredOutput: "Google OAuth live QA readiness check passed.",
})

runReadinessScenario({
  envContent: VALID_ENV_CONTENT.replace(
    "EWATRADE_GOOGLE_LIVE_CONFIRM_AUTH=1",
    "EWATRADE_GOOGLE_LIVE_CONFIRM_AUTH=",
  ),
  expectedStatus: 1,
  label: "missing explicit auth confirmation",
  requiredOutput: "EWATRADE_GOOGLE_LIVE_CONFIRM_AUTH must be set to 1",
})

runReadinessScenario({
  envContent: VALID_ENV_CONTENT.replace(
    "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH=/tmp/ewatrade-google-live-evidence.json",
    "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH=",
  ),
  expectedStatus: 1,
  label: "missing evidence path",
  requiredOutput: "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH is required",
})

runReadinessScenario({
  envContent: VALID_ENV_CONTENT.replace(
    "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH=/tmp/ewatrade-google-live-evidence.json",
    "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH=relative/google-evidence.txt",
  ),
  expectedStatus: 1,
  label: "invalid evidence path",
  requiredOutput: "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH must be an absolute path",
})

runReadinessScenario({
  envContent: VALID_ENV_CONTENT.replace(
    "EWATRADE_GOOGLE_LIVE_ALLOW_LOCALHOST=1",
    "EWATRADE_GOOGLE_LIVE_ALLOW_LOCALHOST=",
  ),
  expectedStatus: 1,
  label: "localhost without explicit allowance",
  requiredOutput: "points to localhost",
})

runReadinessScenario({
  envContent: VALID_ENV_CONTENT.replace(
    `GOOGLE_ANDROID_CLIENT_ID=${ANDROID_CLIENT_ID}`,
    "GOOGLE_ANDROID_CLIENT_ID=9876543210-otherandroid.apps.googleusercontent.com",
  ),
  expectedStatus: 1,
  label: "base OAuth audience mismatch",
  requiredOutput: "Base Google OAuth readiness failed",
})

await runLiveGoogleOAuthScenario()

console.log("Google OAuth live QA fixture checks passed.")

function runReadinessScenario(input) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-google-live-ready-"))
  const envFile = join(fixtureDir, ".env")
  const exampleEnvFile = join(fixtureDir, ".env.example")
  const debugKeystoreFile = join(fixtureDir, "debug.keystore")

  try {
    writeFileSync(envFile, `${input.envContent}\n`)
    writeFileSync(exampleEnvFile, `${EXAMPLE_ENV_CONTENT}\n`)
    writeFileSync(debugKeystoreFile, "fixture-debug-keystore")

    const result = spawnSyncCompat(process.execPath, [READY_SCRIPT_PATH], {
      env: {
        ...process.env,
        GOOGLE_OAUTH_LIVE_READY_ENV_FILE: envFile,
        GOOGLE_OAUTH_LIVE_READY_EXAMPLE_ENV_FILE: exampleEnvFile,
        GOOGLE_OAUTH_READY_DEBUG_KEYSTORE: debugKeystoreFile,
      },
    })
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

    if (result.status !== input.expectedStatus) {
      fail(
        input.label,
        `Expected status ${input.expectedStatus}, received ${result.status}.`,
        output,
      )
    }

    if (!output.includes(input.requiredOutput)) {
      fail(
        input.label,
        `Expected output to include: ${input.requiredOutput}`,
        output,
      )
    }
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true })
  }
}

async function runLiveGoogleOAuthScenario() {
  const requests = []
  const server = createServer(async (request, response) => {
    if (request.method === "POST" && request.url?.includes("/api/trpc")) {
      const body = await readBody(request)
      requests.push({
        body,
        url: request.url,
      })
      const parsedBody = JSON.parse(body)
      const input = parsedBody.json ?? parsedBody[0]?.json

      if (input.idToken !== ID_TOKEN || input.mode !== "sign_up") {
        response.writeHead(400, {
          "content-type": "application/json",
        })
        response.end(JSON.stringify({ error: { message: "Unexpected input" } }))
        return
      }

      response.writeHead(200, {
        "content-type": "application/json",
      })
      response.end(
        JSON.stringify({
          result: {
            data: {
              json: {
                expiresAt: new Date(Date.now() + 3600_000).toISOString(),
                profile: {
                  businessId: "tenant_live_fixture",
                  businessName: "QA Store",
                  email: "owner@qa-mail.test",
                  id: "user_live_fixture",
                  name: "QA Owner",
                  role: "owner",
                  status: "active",
                },
                tenant: {
                  id: "tenant_live_fixture",
                  name: "QA Store",
                  role: "owner",
                  slug: "qa-store",
                  status: "active",
                },
                token: "mobile-bearer-token-that-is-not-printed",
              },
            },
          },
        }),
      )
      return
    }

    response.writeHead(404, {
      "content-type": "text/plain",
    })
    response.end("Not found")
  })

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))

  try {
    const address = server.address()
    const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-google-live-run-"))
    const envFile = join(fixtureDir, ".env")
    const debugKeystoreFile = join(fixtureDir, "debug.keystore")
    const evidencePath = join(fixtureDir, "google-live-evidence.json")

    try {
      writeFileSync(debugKeystoreFile, "fixture-debug-keystore")
      writeFileSync(
        envFile,
        VALID_ENV_CONTENT.replace(
          "EWATRADE_API_URL=http://127.0.0.1:4010",
          `EWATRADE_API_URL=http://127.0.0.1:${address.port}`,
        ).replace(
          "EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH=/tmp/ewatrade-google-live-evidence.json",
          `EWATRADE_GOOGLE_LIVE_EVIDENCE_PATH=${evidencePath}`,
        ),
      )

      const result = await runCommand(process.execPath, [LIVE_SCRIPT_PATH], {
        env: {
          ...process.env,
          GOOGLE_OAUTH_LIVE_ENV_FILE: envFile,
          GOOGLE_OAUTH_LIVE_READY_EXAMPLE_ENV_FILE: envFile,
          GOOGLE_OAUTH_READY_DEBUG_KEYSTORE: debugKeystoreFile,
        },
      })
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

      if (result.status !== 0) {
        fail(
          "local Google OAuth live runner",
          `Expected status 0, received ${result.status}.`,
          output,
        )
      }

      if (!output.includes("Google OAuth live QA passed.")) {
        fail(
          "local Google OAuth live runner",
          "Expected live runner success output.",
          output,
        )
      }

      if (output.includes(ID_TOKEN) || output.includes("mobile-bearer-token")) {
        fail(
          "local Google OAuth live runner",
          "Live runner output leaked a Google ID token or mobile bearer token.",
          output,
        )
      }

      if (!existsSync(evidencePath) || statSync(evidencePath).size === 0) {
        fail(
          "local Google OAuth live runner",
          "Expected live runner to save a non-empty evidence file.",
          output,
        )
      }

      const evidenceContent = readFileSync(evidencePath, "utf8")
      if (
        evidenceContent.includes(ID_TOKEN) ||
        evidenceContent.includes("mobile-bearer-token") ||
        evidenceContent.includes("owner@qa-mail.test")
      ) {
        fail(
          "local Google OAuth live runner",
          "Google live evidence leaked a token, bearer value, or full email address.",
          evidenceContent,
        )
      }

      if (!evidenceContent.includes('"emailMatched": true')) {
        fail(
          "local Google OAuth live runner",
          "Google live evidence did not record the email match proof.",
          evidenceContent,
        )
      }

      if (requests.length !== 1) {
        fail(
          "local Google OAuth live runner",
          `Expected one API request, received ${requests.length}.`,
          output,
        )
      }
    } finally {
      rmSync(fixtureDir, { force: true, recursive: true })
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []

    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
  })
}

function runCommand(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdout = []
    const stderr = []

    child.stdout.on("data", (chunk) => stdout.push(chunk))
    child.stderr.on("data", (chunk) => stderr.push(chunk))
    child.on("error", (error) => {
      stderr.push(Buffer.from(error.message))
    })
    child.on("close", (status) => {
      resolve({
        status,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      })
    })
  })
}

function spawnSyncCompat(command, args, options) {
  return spawnSync(command, args, {
    encoding: "utf8",
    env: options.env,
  })
}

function fail(label, message, output) {
  console.error(`Google OAuth live QA fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}
