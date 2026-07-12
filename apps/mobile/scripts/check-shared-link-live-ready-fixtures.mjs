import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT_PATH = new URL(
  "./check-shared-link-live-ready.mjs",
  import.meta.url,
).pathname
const EXAMPLE_ENV = [
  "EMAIL_FROM=",
  "EMAIL_REPLY_TO=",
  "EWATRADE_API_URL=",
  "NEXT_PUBLIC_API_URL=",
  "EXPO_PUBLIC_API_URL=",
  "EWATRADE_STOREFRONT_URL=",
  "NEXT_PUBLIC_STOREFRONT_URL=",
  "NEXT_PUBLIC_APP_URL=",
  "EWATRADE_SHARED_LINK_LIVE_CONFIRM_WRITES=",
  "EWATRADE_SHARED_LINK_LIVE_CONFIRM_EMAIL_DELIVERY=",
  "EWATRADE_SHARED_LINK_LIVE_OWNER_BEARER_TOKEN=",
  "EWATRADE_SHARED_LINK_LIVE_PRODUCT_ID=",
  "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_EMAIL=",
  "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_NAME=",
  "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_PASSWORD=",
  "EWATRADE_SHARED_LINK_LIVE_FOLLOW_UP_MODE=",
  "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH=",
  "EWATRADE_SHARED_LINK_LIVE_QUANTITY=",
  "EWATRADE_SHARED_LINK_LIVE_ALLOW_LOCALHOST=",
].join("\n")
const VALID_ENV = [
  "EMAIL_FROM=noreply@ewatrade.test",
  "EMAIL_REPLY_TO=ops@ewatrade.test",
  "EWATRADE_API_URL=https://api.ewatrade.test",
  "EWATRADE_STOREFRONT_URL=https://shop.ewatrade.test",
  "EWATRADE_SHARED_LINK_LIVE_CONFIRM_WRITES=1",
  "EWATRADE_SHARED_LINK_LIVE_CONFIRM_EMAIL_DELIVERY=1",
  "EWATRADE_SHARED_LINK_LIVE_OWNER_BEARER_TOKEN=owner-live-token-1234567890",
  "EWATRADE_SHARED_LINK_LIVE_PRODUCT_ID=prod_live_123456",
  "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_EMAIL=buyer@ewatrade.test",
  "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_NAME=Shared Link Buyer",
  "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_PASSWORD=customer-password",
  "EWATRADE_SHARED_LINK_LIVE_FOLLOW_UP_MODE=cancel",
  "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH=/tmp/ewatrade-shared-link-live-evidence.json",
  "EWATRADE_SHARED_LINK_LIVE_QUANTITY=2",
].join("\n")
const CASES = [
  {
    env: VALID_ENV,
    expectedStatus: 0,
    label: "valid shared-link live setup",
    requiredOutput: "Shared-link live readiness check passed.",
  },
  {
    env: VALID_ENV.replace(
      "EWATRADE_SHARED_LINK_LIVE_CONFIRM_WRITES=1",
      "EWATRADE_SHARED_LINK_LIVE_CONFIRM_WRITES=",
    ),
    expectedStatus: 1,
    label: "missing write confirmation",
    requiredOutput: "EWATRADE_SHARED_LINK_LIVE_CONFIRM_WRITES must be set to 1",
  },
  {
    env: VALID_ENV.replace(
      "EWATRADE_API_URL=https://api.ewatrade.test",
      "EWATRADE_API_URL=http://localhost:3000",
    ),
    expectedStatus: 1,
    label: "localhost without explicit allowance",
    requiredOutput: "EWATRADE_API_URL points to a local host",
  },
  {
    env: [
      VALID_ENV.replace(
        "EWATRADE_API_URL=https://api.ewatrade.test",
        "EWATRADE_API_URL=http://localhost:3000",
      ),
      "EWATRADE_SHARED_LINK_LIVE_ALLOW_LOCALHOST=1",
    ].join("\n"),
    expectedStatus: 0,
    label: "localhost with explicit allowance",
    requiredOutput: "Shared-link live readiness check passed.",
  },
  {
    env: VALID_ENV.replace(
      "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_EMAIL=buyer@ewatrade.test",
      "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_EMAIL=not-an-email",
    ),
    expectedStatus: 1,
    label: "invalid customer email",
    requiredOutput: "EWATRADE_SHARED_LINK_LIVE_CUSTOMER_EMAIL is malformed",
  },
  {
    env: VALID_ENV.replace(
      "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH=/tmp/ewatrade-shared-link-live-evidence.json",
      "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH=",
    ),
    expectedStatus: 1,
    label: "missing evidence path",
    requiredOutput: "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH is required",
  },
  {
    env: VALID_ENV.replace(
      "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH=/tmp/ewatrade-shared-link-live-evidence.json",
      "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH=relative/live-evidence.txt",
    ),
    expectedStatus: 1,
    label: "invalid evidence path",
    requiredOutput:
      "EWATRADE_SHARED_LINK_LIVE_EVIDENCE_PATH must be an absolute path",
  },
  {
    env: VALID_ENV.replace(
      "EWATRADE_SHARED_LINK_LIVE_QUANTITY=2",
      "EWATRADE_SHARED_LINK_LIVE_QUANTITY=0",
    ),
    expectedStatus: 1,
    label: "invalid quantity",
    requiredOutput:
      "EWATRADE_SHARED_LINK_LIVE_QUANTITY must be a positive whole number",
  },
]

for (const testCase of CASES) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-shared-link-live-"))
  const envFile = join(fixtureDir, ".env")
  const exampleEnvFile = join(fixtureDir, ".env.example")

  try {
    writeFileSync(envFile, `${testCase.env}\n`)
    writeFileSync(exampleEnvFile, `${EXAMPLE_ENV}\n`)

    const result = spawnSync(process.execPath, [SCRIPT_PATH], {
      env: {
        ...process.env,
        SHARED_LINK_LIVE_READY_ENV_FILE: envFile,
        SHARED_LINK_LIVE_READY_EXAMPLE_ENV_FILE: exampleEnvFile,
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

    if (!output.includes(testCase.requiredOutput)) {
      fail(
        testCase.label,
        `Expected output to include: ${testCase.requiredOutput}`,
        output,
      )
    }
  } finally {
    rmSync(fixtureDir, { force: true, recursive: true })
  }
}

console.log("Shared-link live readiness fixture checks passed.")

function fail(label, message, output) {
  console.error(`Shared-link live readiness fixture failed: ${label}`)
  console.error(message)
  console.error(output)
  process.exit(1)
}
