import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const ENV_FILE =
  process.env.MVP_LIVE_ENV_CHECKLIST_ENV_FILE ?? join(REPO_ROOT, ".env")
const RESOLVED_ENV_FILE = resolve(process.cwd(), ENV_FILE)
const ROOT_LOCAL_ENV_FILE = join(REPO_ROOT, ".env")
const ROOT_PRODUCTION_ENV_FILE = join(REPO_ROOT, ".env.production")
const DEFAULT_MOBILE_ENV_FILE =
  RESOLVED_ENV_FILE === ROOT_PRODUCTION_ENV_FILE
    ? join(REPO_ROOT, "apps/mobile/.env.production")
    : RESOLVED_ENV_FILE === ROOT_LOCAL_ENV_FILE
      ? join(REPO_ROOT, "apps/mobile/.env.local")
      : ENV_FILE
const MOBILE_ENV_FILE =
  process.env.MVP_LIVE_ENV_CHECKLIST_MOBILE_ENV_FILE ?? DEFAULT_MOBILE_ENV_FILE
const REPORT_PATH = process.env.MVP_LIVE_ENV_CHECKLIST_REPORT_PATH
const IS_PRODUCTION_ENV_TARGET = ENV_FILE.includes(".env.production")
const GOOGLE_READY_COMMAND = IS_PRODUCTION_ENV_TARGET
  ? "qa:google-oauth-ready:prod"
  : "qa:google-oauth-ready"
const GOOGLE_LIVE_RUN_COMMAND = IS_PRODUCTION_ENV_TARGET
  ? "qa:google-oauth-live-run:prod"
  : "qa:google-oauth-live-run"
const SHARED_LINK_LIVE_RUN_COMMAND = IS_PRODUCTION_ENV_TARGET
  ? "qa:shared-link-live-run:prod"
  : "qa:shared-link-live-run"
const SHARED_LINK_PREVIEW_COMMAND = IS_PRODUCTION_ENV_TARGET
  ? "qa:shared-link-preview:prod"
  : "qa:shared-link-preview"
const SHARED_LINK_BROWSER_COMMAND = IS_PRODUCTION_ENV_TARGET
  ? "qa:shared-link-browser-checkout:prod"
  : "qa:shared-link-browser-checkout"
const GOOGLE_CREDENTIALS_URL =
  "https://console.cloud.google.com/auth/clients?project=ewatrade-mobile-retail-ops"
const ANDROID_DEV_PACKAGE = "com.ewatrade.dev"
const ANDROID_DEV_SHA1 =
  "A7:A1:5D:42:BD:71:31:81:D3:F0:B0:57:75:F5:3C:9C:22:A1:99:34"
const IOS_BUNDLE_IDS = ["com.ewatrade.dev", "com.ewatrade.app"]
const PUBLIC_REPORT_VALUE_KEYS = new Set([
  "API_URL",
  "NEXT_PUBLIC_API_URL",
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_BASE_URL",
  "EXPO_PUBLIC_WEB_URL",
  "STOREFRONT_URL",
  "NEXT_PUBLIC_STOREFRONT_URL",
  "NEXT_PUBLIC_APP_URL",
])
const SECTIONS = [
  {
    description: `Create/copy the platform client IDs, restart API and Metro, then run ${GOOGLE_READY_COMMAND}.`,
    items: [
      {
        hint: `Android OAuth client for package ${ANDROID_DEV_PACKAGE} and SHA-1 ${ANDROID_DEV_SHA1}.`,
        key: "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
        label: "Android mobile client ID",
      },
      {
        hint: "Same Android client ID allowed by the API verifier.",
        key: "GOOGLE_ANDROID_CLIENT_ID",
        label: "API Android audience",
      },
      {
        hint: `iOS OAuth client for bundle ${IOS_BUNDLE_IDS.join(" or ")}.`,
        key: "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
        label: "iOS mobile client ID",
      },
      {
        hint: "Same iOS client ID allowed by the API verifier.",
        key: "GOOGLE_IOS_CLIENT_ID",
        label: "API iOS audience",
      },
      {
        hint: "Expo web/generic fallback Google client ID.",
        keys: [
          "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
          "EXPO_PUBLIC_GOOGLE_CLIENT_ID",
        ],
        label: "Expo web/generic client ID",
      },
      {
        hint: "Same web/generic client ID allowed by the API verifier.",
        keys: ["GOOGLE_WEB_CLIENT_ID", "GOOGLE_CLIENT_ID"],
        label: "API web/generic audience",
      },
    ],
    title: "Google OAuth",
  },
  {
    description: `Use a fresh Google ID token against an approved API target, then run ${GOOGLE_LIVE_RUN_COMMAND}.`,
    items: [
      {
        hint: "Live API base URL for the auth.verifyMobileGoogle tRPC call.",
        keys: ["API_URL", "NEXT_PUBLIC_API_URL", "EXPO_PUBLIC_API_URL"],
        label: "Live API URL",
      },
      {
        hint: "Expo public app base URL attached to the production EAS project.",
        key: "EXPO_PUBLIC_BASE_URL",
        label: "Expo public base URL",
      },
      {
        hint: "Expo public web URL attached to the production EAS project.",
        key: "EXPO_PUBLIC_WEB_URL",
        label: "Expo public web URL",
      },
      {
        hint: "Set to 1 only for an intentional Google auth verification against the selected API/database.",
        key: "GOOGLE_LIVE_CONFIRM_AUTH",
        label: "Google auth confirmation",
      },
      {
        hint: "Fresh Google ID token from the configured mobile client.",
        key: "GOOGLE_LIVE_ID_TOKEN",
        label: "Google ID token",
      },
      {
        hint: "Use login for an existing owner or sign_up for a disposable new business.",
        key: "GOOGLE_LIVE_MODE",
        label: "Google auth mode",
      },
      {
        hint: "Email expected in the returned mobile auth profile.",
        key: "GOOGLE_LIVE_EXPECTED_EMAIL",
        label: "Expected profile email",
      },
      {
        hint: "Required absolute .json output path for value-safe Google OAuth live evidence.",
        key: "GOOGLE_LIVE_EVIDENCE_PATH",
        label: "Google live evidence path",
      },
      {
        hint: "Required only when GOOGLE_LIVE_MODE is sign_up. Use a disposable owner name.",
        key: "GOOGLE_LIVE_NAME",
        label: "Google sign-up owner name",
        optional: true,
      },
      {
        hint: "Required only when GOOGLE_LIVE_MODE is sign_up. Use a disposable business name.",
        key: "GOOGLE_LIVE_BUSINESS_NAME",
        label: "Google sign-up business name",
        optional: true,
      },
      {
        hint: "Optional. Set to 1 only for local live OAuth rehearsals, not production QA.",
        key: "GOOGLE_LIVE_ALLOW_LOCALHOST",
        label: "Google live localhost allowance",
        optional: true,
      },
    ],
    title: "Google OAuth Live API QA",
  },
  {
    description: `Use a disposable product/customer and an approved live target, then run ${SHARED_LINK_LIVE_RUN_COMMAND}.`,
    items: [
      {
        hint: "Live API base URL for protected tRPC calls.",
        keys: ["API_URL", "NEXT_PUBLIC_API_URL", "EXPO_PUBLIC_API_URL"],
        label: "Live API URL",
      },
      {
        hint: "Live storefront base URL for the public product page.",
        keys: [
          "STOREFRONT_URL",
          "NEXT_PUBLIC_STOREFRONT_URL",
          "NEXT_PUBLIC_APP_URL",
        ],
        label: "Live storefront URL",
      },
      {
        hint: "Set to 1 only for an intentional write against the selected database.",
        key: "SHARED_LINK_LIVE_CONFIRM_WRITES",
        label: "Write confirmation",
      },
      {
        hint: "Set to 1 only when email delivery is ready to verify.",
        key: "SHARED_LINK_LIVE_CONFIRM_EMAIL_DELIVERY",
        label: "Email delivery confirmation",
      },
      {
        hint: "Short-lived owner/manager bearer token.",
        key: "SHARED_LINK_LIVE_OWNER_BEARER_TOKEN",
        label: "Owner bearer token",
      },
      {
        hint: "Synced product id with sellable stock.",
        key: "SHARED_LINK_LIVE_PRODUCT_ID",
        label: "Product id",
      },
      {
        hint: "Disposable QA customer name.",
        key: "SHARED_LINK_LIVE_CUSTOMER_NAME",
        label: "Customer name",
      },
      {
        hint: "Inbox that can receive the customer confirmation.",
        key: "SHARED_LINK_LIVE_CUSTOMER_EMAIL",
        label: "Customer email",
      },
      {
        hint: "Disposable password for register/login branch.",
        key: "SHARED_LINK_LIVE_CUSTOMER_PASSWORD",
        label: "Customer password",
      },
      {
        hint: "Use complete or cancel so QA does not leave ambiguous pending orders.",
        key: "SHARED_LINK_LIVE_FOLLOW_UP_MODE",
        label: "Follow-up mode",
      },
      {
        hint: "Required absolute .json output path for value-safe shared-link live evidence.",
        key: "SHARED_LINK_LIVE_EVIDENCE_PATH",
        label: "Shared-link live evidence path",
      },
      {
        hint: "Optional whole-number quantity. Defaults to 1 when unset.",
        key: "SHARED_LINK_LIVE_QUANTITY",
        label: "Shared-link live quantity",
        optional: true,
      },
      {
        hint: "Optional. Set to 1 only for local shared-link live rehearsals, not production QA.",
        key: "SHARED_LINK_LIVE_ALLOW_LOCALHOST",
        label: "Shared-link live localhost allowance",
        optional: true,
      },
      {
        hint: "Live sender address, not a .local placeholder.",
        key: "EMAIL_FROM",
        label: "Email sender",
      },
      {
        hint: "Reply path for merchant-facing notifications.",
        key: "EMAIL_REPLY_TO",
        label: "Email reply-to",
      },
    ],
    title: "Shared-Link Live Write And Email QA",
  },
  {
    description: `Use an already generated deployed product link, then run ${SHARED_LINK_PREVIEW_COMMAND}.`,
    items: [
      {
        hint: "Full public /p/... URL including the share token.",
        key: "SHARED_LINK_PREVIEW_URL",
        label: "Deployed share URL",
      },
      {
        hint: "Expected business subdomain or verified storefront host.",
        key: "SHARED_LINK_PREVIEW_EXPECTED_HOST",
        label: "Expected host",
      },
      {
        hint: "Product name expected in preview metadata.",
        key: "SHARED_LINK_PREVIEW_EXPECTED_PRODUCT_NAME",
        label: "Expected product name",
      },
      {
        hint: "Business/store name expected in preview image metadata.",
        key: "SHARED_LINK_PREVIEW_EXPECTED_BUSINESS_NAME",
        label: "Expected business name",
      },
      {
        hint: "Required absolute .json output path for value-safe public preview evidence.",
        key: "SHARED_LINK_PREVIEW_EVIDENCE_PATH",
        label: "Public preview evidence path",
      },
      {
        hint: "Optional. Set to 1 only for local preview fixtures, not production QA.",
        key: "SHARED_LINK_PREVIEW_ALLOW_LOCALHOST",
        label: "Preview localhost allowance",
        optional: true,
      },
    ],
    title: "Shared-Link Public Preview",
  },
  {
    description: `Use the deployed product link with a disposable customer, then run ${SHARED_LINK_BROWSER_COMMAND}.`,
    items: [
      {
        hint: "Same full public /p/... URL with share token used by the preview gate.",
        key: "SHARED_LINK_PREVIEW_URL",
        label: "Deployed share URL",
      },
      {
        hint: "Set to 1 only when the public link may receive a disposable browser checkout order request.",
        key: "SHARED_LINK_BROWSER_CONFIRM_ORDER",
        label: "Browser order confirmation",
      },
      {
        hint: "Use register for a new disposable customer or login for an existing disposable customer.",
        key: "SHARED_LINK_BROWSER_AUTH_MODE",
        label: "Customer auth mode",
      },
      {
        hint: "Disposable browser-checkout customer name.",
        key: "SHARED_LINK_BROWSER_CUSTOMER_NAME",
        label: "Browser customer name",
      },
      {
        hint: "Disposable inbox for the browser checkout order request.",
        key: "SHARED_LINK_BROWSER_CUSTOMER_EMAIL",
        label: "Browser customer email",
      },
      {
        hint: "Disposable password for the register/login branch.",
        key: "SHARED_LINK_BROWSER_CUSTOMER_PASSWORD",
        label: "Browser customer password",
      },
      {
        hint: "Optional whole-number quantity. Defaults to 1 when unset.",
        key: "SHARED_LINK_BROWSER_QUANTITY",
        label: "Browser quantity",
        optional: true,
      },
      {
        hint: "Optional disposable customer phone for the public form.",
        key: "SHARED_LINK_BROWSER_CUSTOMER_PHONE",
        label: "Browser customer phone",
        optional: true,
      },
      {
        hint: "Optional checkout note. Defaults to a QA note when unset.",
        key: "SHARED_LINK_BROWSER_NOTES",
        label: "Browser checkout notes",
        optional: true,
      },
      {
        hint: "Required absolute .png output path for browser checkout release evidence.",
        key: "SHARED_LINK_BROWSER_SCREENSHOT_PATH",
        label: "Browser screenshot path",
      },
      {
        hint: "Optional. Set to 1 only when you want Playwright to run visibly.",
        key: "SHARED_LINK_BROWSER_HEADFUL",
        label: "Browser headful mode",
        optional: true,
      },
      {
        hint: "Optional. Set to 1 only for local browser fixtures, not production QA.",
        key: "SHARED_LINK_BROWSER_ALLOW_LOCALHOST",
        label: "Browser localhost allowance",
        optional: true,
      },
    ],
    title: "Shared-Link Browser Checkout",
  },
]

const env = {
  ...readEnvFile(ENV_FILE),
  ...readEnvFile(MOBILE_ENV_FILE),
}
const requiredMissingItems = []
const sectionsReport = []
const publicConfiguredValues = {}

console.log("Mobile Retail Ops MVP live environment checklist")
console.log(`Env file: ${existsSync(ENV_FILE) ? ENV_FILE : "missing .env"}`)
console.log(`Google Cloud credentials: ${GOOGLE_CREDENTIALS_URL}`)
console.log(`Android dev package: ${ANDROID_DEV_PACKAGE}`)
console.log(`Android dev SHA-1: ${ANDROID_DEV_SHA1}`)
console.log(`iOS bundle IDs: ${IOS_BUNDLE_IDS.join(", ")}`)

for (const section of SECTIONS) {
  console.log(`\n== ${section.title} ==`)
  console.log(section.description)

  const sectionItems = []

  for (const item of section.items) {
    const keys = item.keys ?? [item.key]
    const isConfigured = keys.some((key) => hasValue(env[key]))
    const status = isConfigured
      ? "configured"
      : item.optional
        ? "optional unset"
        : "missing"

    if (!isConfigured && !item.optional) {
      requiredMissingItems.push({
        keys,
        label: item.label,
        section: section.title,
      })
    }

    for (const key of keys) {
      if (PUBLIC_REPORT_VALUE_KEYS.has(key) && hasValue(env[key])) {
        publicConfiguredValues[key] = env[key].trim()
      }
    }

    sectionItems.push({
      keys,
      label: item.label,
      optional: Boolean(item.optional),
      status,
    })

    console.log(`- [${status}] ${item.label}: ${keys.join(" or ")}`)
    console.log(`  ${item.hint}`)
  }

  sectionsReport.push({
    items: sectionItems,
    title: section.title,
  })
}

console.log("\nRequired missing values:")
if (requiredMissingItems.length === 0) {
  console.log("- none")
} else {
  for (const item of requiredMissingItems) {
    console.log(`- ${item.section}: ${item.label} (${item.keys.join(" or ")})`)
  }
}

console.log("\nVerification commands:")
console.log("- bun run --cwd apps/mobile qa:google-oauth-ready")
console.log("- bun run --cwd apps/mobile qa:google-oauth-ready:prod")
console.log("- bun run --cwd apps/mobile qa:google-oauth-live-ready")
console.log("- bun run --cwd apps/mobile qa:google-oauth-live-ready:prod")
console.log("- bun run --cwd apps/mobile qa:google-oauth-live-run")
console.log("- bun run --cwd apps/mobile qa:google-oauth-live-run:prod")
console.log("- bun run --cwd apps/mobile qa:shared-link-live-ready")
console.log("- bun run --cwd apps/mobile qa:shared-link-live-ready:prod")
console.log("- bun run --cwd apps/mobile qa:shared-link-live-run")
console.log("- bun run --cwd apps/mobile qa:shared-link-live-run:prod")
console.log("- bun run --cwd apps/mobile qa:shared-link-preview")
console.log("- bun run --cwd apps/mobile qa:shared-link-preview:prod")
console.log("- bun run --cwd apps/mobile qa:shared-link-browser-ready")
console.log("- bun run --cwd apps/mobile qa:shared-link-browser-ready:prod")
console.log("- bun run --cwd apps/mobile qa:shared-link-browser-checkout")
console.log("- bun run --cwd apps/mobile qa:shared-link-browser-checkout:prod")
console.log("- bun run --cwd apps/mobile qa:mvp-readiness")
console.log("- bun run --cwd apps/mobile qa:mvp-live-env-checklist:prod")
console.log("- bun run --cwd apps/mobile qa:mvp-live-readiness:prod")
console.log("- bun run --cwd apps/mobile qa:mvp-readiness:prod")
console.log("\nNo secret values were printed.")

if (REPORT_PATH) {
  writeReport(REPORT_PATH, {
    androidDevPackage: ANDROID_DEV_PACKAGE,
    googleCredentialsUrl: GOOGLE_CREDENTIALS_URL,
    generatedAt: new Date().toISOString(),
    iosBundleIds: IOS_BUNDLE_IDS,
    isProductionEnvTarget: IS_PRODUCTION_ENV_TARGET,
    missingRequired: requiredMissingItems,
    missingRequiredCount: requiredMissingItems.length,
    publicConfiguredValues,
    reportType: "mobile-retail-ops-live-env-checklist",
    sections: sectionsReport,
    verificationCommands: [
      "bun run --cwd apps/mobile qa:google-oauth-ready",
      "bun run --cwd apps/mobile qa:google-oauth-ready:prod",
      "bun run --cwd apps/mobile qa:google-oauth-live-ready",
      "bun run --cwd apps/mobile qa:google-oauth-live-ready:prod",
      "bun run --cwd apps/mobile qa:google-oauth-live-run",
      "bun run --cwd apps/mobile qa:google-oauth-live-run:prod",
      "bun run --cwd apps/mobile qa:shared-link-live-ready",
      "bun run --cwd apps/mobile qa:shared-link-live-ready:prod",
      "bun run --cwd apps/mobile qa:shared-link-live-run",
      "bun run --cwd apps/mobile qa:shared-link-live-run:prod",
      "bun run --cwd apps/mobile qa:shared-link-preview",
      "bun run --cwd apps/mobile qa:shared-link-preview:prod",
      "bun run --cwd apps/mobile qa:shared-link-browser-ready",
      "bun run --cwd apps/mobile qa:shared-link-browser-ready:prod",
      "bun run --cwd apps/mobile qa:shared-link-browser-checkout",
      "bun run --cwd apps/mobile qa:shared-link-browser-checkout:prod",
      "bun run --cwd apps/mobile qa:mvp-readiness",
      "bun run --cwd apps/mobile qa:mvp-live-env-checklist:prod",
      "bun run --cwd apps/mobile qa:mvp-live-readiness:prod",
      "bun run --cwd apps/mobile qa:mvp-readiness:prod",
    ],
  })
  console.log(`Live checklist report written: ${REPORT_PATH}`)
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {}

  const values = {}
  const content = readFileSync(filePath, "utf8")

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const equalsIndex = line.indexOf("=")
    if (equalsIndex === -1) continue

    const key = line.slice(0, equalsIndex).trim()
    const value = stripQuotes(line.slice(equalsIndex + 1).trim())
    values[key] = value
  }

  return values
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0
}

function writeReport(reportPath, report) {
  if (!isAbsolute(reportPath) || !reportPath.endsWith(".json")) {
    console.error(
      "MVP_LIVE_ENV_CHECKLIST_REPORT_PATH must be an absolute .json path.",
    )
    process.exit(1)
  }

  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}
