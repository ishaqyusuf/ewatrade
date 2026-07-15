import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SCRIPT_PATH = new URL(
  "./print-mvp-live-env-checklist.mjs",
  import.meta.url,
).pathname
const SECRET_MARKERS = [
  "1234567890-android.apps.googleusercontent.com",
  "google-id-token-secret",
  "owner@qa-mail.test",
  "QA Google Owner",
  "QA Google Store",
  "/tmp/google-live-evidence.json",
  "owner-live-token-1234567890",
  "customer-password",
  "browser-buyer@example.test",
  "Browser Buyer",
  "browser-password",
  "+2348012345678",
  "Shared Link Buyer",
  "/tmp/shared-link-live-evidence.json",
  "Browser checkout fixture note",
  "/tmp/browser-checkout.png",
  "/tmp/share-preview-evidence.json",
  "https://api.ewatrade.test",
  "https://shop.ewatrade.test",
  "https://retail.example.test/p/store/main/rice?share=secret-token",
]
const REPORT_SECRET_MARKERS = SECRET_MARKERS.filter(
  (secret) =>
    !["https://api.ewatrade.test", "https://shop.ewatrade.test"].includes(
      secret,
    ),
)
const ENV_CONTENT = [
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=1234567890-android.apps.googleusercontent.com",
  "GOOGLE_ANDROID_CLIENT_ID=1234567890-android.apps.googleusercontent.com",
  "GOOGLE_LIVE_CONFIRM_AUTH=1",
  "GOOGLE_LIVE_ID_TOKEN=google-id-token-secret",
  "GOOGLE_LIVE_MODE=sign_up",
  "GOOGLE_LIVE_EXPECTED_EMAIL=owner@qa-mail.test",
  "GOOGLE_LIVE_EVIDENCE_PATH=/tmp/google-live-evidence.json",
  "GOOGLE_LIVE_NAME=QA Google Owner",
  "GOOGLE_LIVE_BUSINESS_NAME=QA Google Store",
  "GOOGLE_LIVE_ALLOW_LOCALHOST=1",
  "API_URL=https://api.ewatrade.test",
  "EXPO_PUBLIC_API_URL=https://api.ewatrade.test",
  "EXPO_PUBLIC_BASE_URL=https://shop.ewatrade.test",
  "EXPO_PUBLIC_WEB_URL=https://shop.ewatrade.test",
  "STOREFRONT_URL=https://shop.ewatrade.test",
  "SHARED_LINK_LIVE_OWNER_BEARER_TOKEN=owner-live-token-1234567890",
  "SHARED_LINK_LIVE_CUSTOMER_NAME=Shared Link Buyer",
  "SHARED_LINK_LIVE_QUANTITY=3",
  "SHARED_LINK_LIVE_EVIDENCE_PATH=/tmp/shared-link-live-evidence.json",
  "SHARED_LINK_LIVE_ALLOW_LOCALHOST=1",
  "SHARED_LINK_LIVE_CUSTOMER_PASSWORD=customer-password",
  "SHARED_LINK_PREVIEW_URL=https://retail.example.test/p/store/main/rice?share=secret-token",
  "SHARED_LINK_PREVIEW_EVIDENCE_PATH=/tmp/share-preview-evidence.json",
  "SHARED_LINK_PREVIEW_ALLOW_LOCALHOST=1",
  "SHARED_LINK_BROWSER_CONFIRM_ORDER=1",
  "SHARED_LINK_BROWSER_CUSTOMER_EMAIL=browser-buyer@example.test",
  "SHARED_LINK_BROWSER_CUSTOMER_NAME=Browser Buyer",
  "SHARED_LINK_BROWSER_CUSTOMER_PASSWORD=browser-password",
  "SHARED_LINK_BROWSER_AUTH_MODE=register",
  "SHARED_LINK_BROWSER_QUANTITY=2",
  "SHARED_LINK_BROWSER_CUSTOMER_PHONE=+2348012345678",
  "SHARED_LINK_BROWSER_NOTES=Browser checkout fixture note",
  "SHARED_LINK_BROWSER_SCREENSHOT_PATH=/tmp/browser-checkout.png",
  "SHARED_LINK_BROWSER_HEADFUL=1",
  "SHARED_LINK_BROWSER_ALLOW_LOCALHOST=1",
].join("\n")

const fixtureDir = mkdtempSync(join(tmpdir(), "ewatrade-live-env-checklist-"))
const envFile = join(fixtureDir, ".env")
const productionEnvFile = join(fixtureDir, ".env.production")

try {
  writeFileSync(envFile, `${ENV_CONTENT}\n`)
  writeFileSync(productionEnvFile, `${ENV_CONTENT}\n`)

  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: "utf8",
    env: {
      ...process.env,
      MVP_LIVE_ENV_CHECKLIST_ENV_FILE: envFile,
    },
  })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`

  if (result.status !== 0) {
    fail(`Expected status 0, received ${result.status}.`, output)
  }

  for (const required of [
    "Mobile Retail Ops MVP live environment checklist",
    "== Google OAuth ==",
    "== Google OAuth Live API QA ==",
    "== Shared-Link Live Write And Email QA ==",
    "== Shared-Link Public Preview ==",
    "== Shared-Link Browser Checkout ==",
    "Google Cloud credentials: https://console.cloud.google.com/auth/clients?project=ewatrade-mobile-retail-ops",
    "then run qa:google-oauth-ready.",
    "then run qa:google-oauth-live-run.",
    "then run qa:shared-link-live-run.",
    "then run qa:shared-link-preview.",
    "then run qa:shared-link-browser-checkout.",
    "- [configured] Android mobile client ID",
    "- [configured] Google ID token",
    "- [configured] Google live evidence path",
    "- [configured] Google sign-up owner name",
    "- [configured] Google sign-up business name",
    "- [configured] Google live localhost allowance",
    "- [missing] iOS mobile client ID",
    "- [configured] Live API URL",
    "- [configured] Expo public base URL",
    "- [configured] Expo public web URL",
    "- [configured] Owner bearer token",
    "- [configured] Shared-link live evidence path",
    "- [configured] Shared-link live quantity",
    "- [configured] Shared-link live localhost allowance",
    "- [configured] Customer password",
    "- [configured] Deployed share URL",
    "- [configured] Public preview evidence path",
    "- [configured] Preview localhost allowance",
    "- [configured] Browser customer email",
    "- [configured] Browser quantity",
    "- [configured] Browser screenshot path",
    "- [configured] Browser localhost allowance",
    "Required missing values:",
    "- Google OAuth: iOS mobile client ID (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)",
    "- Google OAuth: API iOS audience (GOOGLE_IOS_CLIENT_ID)",
    "- Google OAuth: Expo web/generic client ID (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID or EXPO_PUBLIC_GOOGLE_CLIENT_ID)",
    "- Google OAuth: API web/generic audience (GOOGLE_WEB_CLIENT_ID or GOOGLE_CLIENT_ID)",
    "- Shared-Link Live Write And Email QA: Write confirmation (SHARED_LINK_LIVE_CONFIRM_WRITES)",
    "qa:mvp-live-env-checklist:prod",
    "qa:mvp-live-readiness:prod",
    "qa:mvp-readiness:prod",
    "qa:google-oauth-live-run:prod",
    "qa:shared-link-live-run:prod",
    "qa:shared-link-preview:prod",
    "qa:shared-link-browser-checkout:prod",
    "No secret values were printed.",
  ]) {
    if (!output.includes(required)) {
      fail(`Expected output to include: ${required}`, output)
    }
  }

  for (const secret of SECRET_MARKERS) {
    if (output.includes(secret)) {
      fail(`Checklist output leaked configured value: ${secret}`, output)
    }
  }

  const optionalUnsetEnvFile = join(
    fixtureDir,
    ".env.production.optional-unset",
  )
  writeFileSync(
    optionalUnsetEnvFile,
    `${ENV_CONTENT.replace(/^GOOGLE_LIVE_NAME=.*\n?/m, "")
      .replace(/^GOOGLE_LIVE_BUSINESS_NAME=.*\n?/m, "")
      .replace(/^GOOGLE_LIVE_ALLOW_LOCALHOST=.*\n?/m, "")
      .replace(/^SHARED_LINK_LIVE_QUANTITY=.*\n?/m, "")
      .replace(/^SHARED_LINK_LIVE_ALLOW_LOCALHOST=.*\n?/m, "")
      .replace(/^SHARED_LINK_PREVIEW_ALLOW_LOCALHOST=.*\n?/m, "")
      .replace(/^SHARED_LINK_BROWSER_QUANTITY=.*\n?/m, "")
      .replace(/^SHARED_LINK_BROWSER_CUSTOMER_PHONE=.*\n?/m, "")
      .replace(/^SHARED_LINK_BROWSER_NOTES=.*\n?/m, "")
      .replace(/^SHARED_LINK_BROWSER_HEADFUL=.*\n?/m, "")
      .replace(/^SHARED_LINK_BROWSER_ALLOW_LOCALHOST=.*\n?/m, "")}\n`,
  )
  const optionalUnsetResult = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: "utf8",
    env: {
      ...process.env,
      MVP_LIVE_ENV_CHECKLIST_ENV_FILE: optionalUnsetEnvFile,
    },
  })
  const optionalUnsetOutput = `${optionalUnsetResult.stdout ?? ""}${
    optionalUnsetResult.stderr ?? ""
  }`

  if (optionalUnsetResult.status !== 0) {
    fail(
      `Expected optional-unset status 0, received ${optionalUnsetResult.status}.`,
      optionalUnsetOutput,
    )
  }

  for (const required of [
    "- [optional unset] Google sign-up owner name",
    "- [optional unset] Google sign-up business name",
    "- [optional unset] Google live localhost allowance",
    "- [optional unset] Shared-link live quantity",
    "- [optional unset] Shared-link live localhost allowance",
    "- [optional unset] Preview localhost allowance",
    "- [optional unset] Browser quantity",
    "- [optional unset] Browser customer phone",
    "- [optional unset] Browser checkout notes",
    "- [optional unset] Browser headful mode",
    "- [optional unset] Browser localhost allowance",
    "Required missing values:",
    "- Google OAuth: iOS mobile client ID (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)",
  ]) {
    if (!optionalUnsetOutput.includes(required)) {
      fail(
        `Expected optional-unset output to include: ${required}`,
        optionalUnsetOutput,
      )
    }
  }

  for (const unexpected of [
    "- [missing] Google sign-up owner name",
    "- [missing] Google sign-up business name",
    "- [missing] Google live localhost allowance",
    "- [missing] Shared-link live quantity",
    "- [missing] Shared-link live localhost allowance",
    "- [missing] Preview localhost allowance",
    "- [missing] Browser quantity",
    "- [missing] Browser customer phone",
    "- [missing] Browser checkout notes",
    "- [missing] Browser headful mode",
    "- [missing] Browser localhost allowance",
    "- Google OAuth Live API QA: Google sign-up owner name",
    "- Google OAuth Live API QA: Google sign-up business name",
    "- Shared-Link Live Write And Email QA: Shared-link live quantity",
    "- Shared-Link Browser Checkout: Browser quantity",
    "- Shared-Link Browser Checkout: Browser checkout notes",
  ]) {
    if (optionalUnsetOutput.includes(unexpected)) {
      fail(
        `Optional-unset output should not mark optional key as missing: ${unexpected}`,
        optionalUnsetOutput,
      )
    }
  }

  for (const secret of SECRET_MARKERS) {
    if (optionalUnsetOutput.includes(secret)) {
      fail(
        `Optional-unset checklist output leaked configured value: ${secret}`,
        optionalUnsetOutput,
      )
    }
  }

  const productionResult = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: "utf8",
    env: {
      ...process.env,
      MVP_LIVE_ENV_CHECKLIST_ENV_FILE: productionEnvFile,
    },
  })
  const productionOutput = `${productionResult.stdout ?? ""}${
    productionResult.stderr ?? ""
  }`

  if (productionResult.status !== 0) {
    fail(
      `Expected production status 0, received ${productionResult.status}.`,
      productionOutput,
    )
  }

  for (const required of [
    "then run qa:google-oauth-ready:prod.",
    "then run qa:google-oauth-live-run:prod.",
    "then run qa:shared-link-live-run:prod.",
    "then run qa:shared-link-preview:prod.",
    "then run qa:shared-link-browser-checkout:prod.",
  ]) {
    if (!productionOutput.includes(required)) {
      fail(
        `Expected production output to include: ${required}`,
        productionOutput,
      )
    }
  }

  for (const secret of SECRET_MARKERS) {
    if (productionOutput.includes(secret)) {
      fail(
        `Production checklist output leaked configured value: ${secret}`,
        productionOutput,
      )
    }
  }

  const reportPath = join(fixtureDir, "live-env-checklist-report.json")
  const reportResult = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: "utf8",
    env: {
      ...process.env,
      MVP_LIVE_ENV_CHECKLIST_ENV_FILE: envFile,
      MVP_LIVE_ENV_CHECKLIST_REPORT_PATH: reportPath,
    },
  })
  const reportOutput = `${reportResult.stdout ?? ""}${
    reportResult.stderr ?? ""
  }`

  if (reportResult.status !== 0) {
    fail(
      `Expected report status 0, received ${reportResult.status}.`,
      reportOutput,
    )
  }

  if (!reportOutput.includes(`Live checklist report written: ${reportPath}`)) {
    fail("Expected checklist output to confirm report path.", reportOutput)
  }

  if (!existsSync(reportPath)) {
    fail("Expected checklist report JSON to be written.", reportOutput)
  }

  const reportContent = readFileSync(reportPath, "utf8")
  const report = JSON.parse(reportContent)

  if (report.reportType !== "mobile-retail-ops-live-env-checklist") {
    fail("Checklist report type was not preserved.", reportContent)
  }

  if (
    typeof report.generatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(report.generatedAt)
  ) {
    fail("Checklist report did not include generatedAt.", reportContent)
  }

  if (!Array.isArray(report.sections) || report.sections.length === 0) {
    fail("Checklist report did not include section status rows.", reportContent)
  }

  if (report.missingRequiredCount !== report.missingRequired?.length) {
    fail(
      "Checklist report missingRequiredCount did not match missingRequired rows.",
      reportContent,
    )
  }

  if (
    !report.missingRequired?.some(
      (item) =>
        item.section === "Google OAuth" &&
        item.label === "iOS mobile client ID" &&
        item.keys?.includes("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"),
    )
  ) {
    fail(
      "Checklist report did not include expected missing key metadata.",
      reportContent,
    )
  }

  if (
    !report.verificationCommands?.includes(
      "bun run --cwd apps/mobile qa:mvp-readiness:prod",
    )
  ) {
    fail(
      "Checklist report did not include production readiness command.",
      reportContent,
    )
  }

  if (
    report.publicConfiguredValues?.API_URL !== "https://api.ewatrade.test" ||
    report.publicConfiguredValues?.EXPO_PUBLIC_API_URL !==
      "https://api.ewatrade.test" ||
    report.publicConfiguredValues?.EXPO_PUBLIC_BASE_URL !==
      "https://shop.ewatrade.test" ||
    report.publicConfiguredValues?.EXPO_PUBLIC_WEB_URL !==
      "https://shop.ewatrade.test" ||
    report.publicConfiguredValues?.STOREFRONT_URL !==
      "https://shop.ewatrade.test"
  ) {
    fail(
      "Checklist report did not include expected public configured URL values.",
      reportContent,
    )
  }

  for (const secret of REPORT_SECRET_MARKERS) {
    if (reportContent.includes(secret)) {
      fail(`Checklist report leaked configured value: ${secret}`, reportContent)
    }
  }

  const invalidReportResult = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: "utf8",
    env: {
      ...process.env,
      MVP_LIVE_ENV_CHECKLIST_ENV_FILE: envFile,
      MVP_LIVE_ENV_CHECKLIST_REPORT_PATH: "relative-report.json",
    },
  })
  const invalidReportOutput = `${invalidReportResult.stdout ?? ""}${
    invalidReportResult.stderr ?? ""
  }`

  if (invalidReportResult.status === 0) {
    fail(
      "Expected relative checklist report path to fail.",
      invalidReportOutput,
    )
  }

  if (
    !invalidReportOutput.includes(
      "MVP_LIVE_ENV_CHECKLIST_REPORT_PATH must be an absolute .json path.",
    )
  ) {
    fail("Expected invalid report path failure message.", invalidReportOutput)
  }
} finally {
  rmSync(fixtureDir, { force: true, recursive: true })
}

console.log("MVP live environment checklist fixture checks passed.")

function fail(message, output) {
  console.error("MVP live environment checklist fixture failed.")
  console.error(message)
  console.error(output)
  process.exit(1)
}
