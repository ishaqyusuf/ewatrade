const USE_PRODUCTION_ENV = Boolean(process.env.MVP_HANDS_ON_SMOKE_ENV_FILE)
const liveChecklistCommand = USE_PRODUCTION_ENV
  ? "bun run --cwd apps/mobile qa:mvp-live-env-checklist:prod"
  : "bun run --cwd apps/mobile qa:mvp-live-env-checklist"
const liveReadinessCommand = USE_PRODUCTION_ENV
  ? "bun run --cwd apps/mobile qa:mvp-live-readiness:prod"
  : "bun run --cwd apps/mobile qa:mvp-live-readiness"
const fullReadinessCommand = USE_PRODUCTION_ENV
  ? "bun run --cwd apps/mobile qa:mvp-readiness:prod"
  : "bun run --cwd apps/mobile qa:mvp-readiness"
const evidenceTemplateCommand = USE_PRODUCTION_ENV
  ? "bun run --cwd apps/mobile qa:mvp-hands-on-evidence-template:prod"
  : "bun run --cwd apps/mobile qa:mvp-hands-on-evidence-template"

const PRECHECKS = [
  {
    command: "bun run --cwd apps/mobile qa:mvp-local-readiness",
    reason:
      "Confirms source, typecheck, contract, and base Google OAuth setup gates are green before external QA.",
  },
  {
    command: "bun run --cwd apps/mobile qa:mvp-source",
    reason:
      "Confirms the source-level MVP guard bundle is green before device QA.",
  },
  {
    command: "bun run --cwd apps/mobile qa:mvp-contracts",
    reason:
      "Confirms focused API, DB, storefront, notification, and fixture contracts are green.",
  },
  {
    command: "bun run --cwd apps/mobile qa:android-ready",
    reason:
      "Confirms an Android device or emulator is attached for hands-on mobile QA.",
  },
  {
    command: liveChecklistCommand,
    reason: "Shows the missing external/live values without printing secrets.",
  },
  {
    command: liveReadinessCommand,
    reason:
      "Confirms live Google, shared-link, preview, and browser checkout setup against the selected env file.",
  },
  {
    command: fullReadinessCommand,
    reason:
      "Runs the complete release gate with local implementation checks plus Android and live proof gates.",
  },
]

const SMOKE_SECTIONS = [
  {
    title: "Launch And Auth",
    checks: [
      "Launch the app from a cold start and confirm the splash hands off to Login.",
      "Open Google/Gmail sign-in and confirm setup/provider failures fall back to email-code copy.",
      "Use email login or sign-up, request an OTP, enter the code, and confirm the owner lands in the correct business context.",
      "On sign-up, confirm the form only asks for name, business name, and email address before OTP verification.",
    ],
  },
  {
    title: "First Product And Dashboard",
    checks: [
      "For a new owner, open the first-product prompt and add a product with primary unit, price, stock, optional description, and optional image URL.",
      "Add at least one sub-unit or variant, then confirm dashboard stock, low-stock, report, and pending-sync surfaces remain readable.",
      "Toggle light and dark appearance during dashboard review and confirm the sample-inspired dark palette remains readable.",
    ],
  },
  {
    title: "Staff And Sessions",
    checks: [
      "Invite a staff member with a prompt-style email field and confirm the invite queues or sends without raw server error copy.",
      "Open the staff invite or staff onboarding route and confirm keyboard-safe fields remain visible.",
      "Open a sales day/session for the current actor and confirm local fallback works when production is unavailable.",
    ],
  },
  {
    title: "Sale And Customer Book",
    checks: [
      "Create a sale from the plus action, choose a product or clickable variant, and adjust quantity with plus, minus, and numeric keyboard entry.",
      "Confirm the total updates on the same screen, select cash or transfer, add or pick a customer, and complete the transaction.",
      "Open Customer book and confirm the new customer appears without requiring duplicate entry.",
    ],
  },
  {
    title: "Offline And Sync",
    checks: [
      "Switch to offline mode and confirm the top banner says changes will sync when reconnecting.",
      "Create at least one supported offline change, then open Sync status and confirm pending, failed, conflict, retry, and review states are readable.",
      "Return online or run sync where available, and confirm queued changes reconcile without duplicate sales or stock deductions.",
    ],
  },
  {
    title: "Inventory, Reports, And Subscription",
    checks: [
      "Record stock intake, unit conversion, and manual adjustment paths with keyboard-safe quantity fields.",
      "Open Reports and confirm sales, stock, closeout, credit, sync conflict, and CSV/export surfaces are readable.",
      "Open Plans and confirm Starter, Growth, and Pro tiers, usage limits, and upgrade handoff copy are visible without provider-specific leakage.",
    ],
  },
  {
    title: "Share Links And Web Checkout",
    checks: [
      "Open Product links from a real product, generate or refresh a link, copy/share it, and confirm analytics and deactivation controls are visible.",
      "Run the deployed preview gate for an existing link and confirm canonical, Open Graph, Twitter, product, business, host, and image metadata pass.",
      "Run browser checkout against a disposable customer and confirm the pending order appears for admin/sales follow-up.",
      "Complete or cancel the pending request and confirm notification/audit and stock reservation outcomes are visible.",
    ],
  },
]

console.log("Mobile Retail Ops MVP hands-on smoke checklist")
console.log(
  "Use this with a real Android device/emulator and the live readiness checklist before closing the MVP QA ticket.",
)
console.log(
  `Environment target: ${
    USE_PRODUCTION_ENV ? "production env file" : "default local env file"
  }`,
)

console.log("\n== Preflight ==")
for (const precheck of PRECHECKS) {
  console.log(`- ${precheck.command}`)
  console.log(`  ${precheck.reason}`)
}

console.log("\n== Device Evidence ==")
console.log(`- Start from ${evidenceTemplateCommand}.`)
console.log(
  "- Capture light and dark screenshots for dashboard, auth, OTP, product links, subscription, and sync/conflict states.",
)
console.log(
  "- Record the device/emulator name, viewport size, date, API target, storefront target, and whether the run used local fallback or production.",
)
console.log(
  "- Do not paste OTPs, bearer tokens, Google ID tokens, customer passwords, or live share tokens into the evidence note.",
)

for (const section of SMOKE_SECTIONS) {
  console.log(`\n== ${section.title} ==`)

  for (const check of section.checks) {
    console.log(`- [ ] ${check}`)
  }
}

console.log("\n== Completion Note ==")
console.log(
  "- The QA ticket can close only after the live Google provider flow, live shared-link write/email flow, deployed public preview, browser checkout, and full device smoke run all have current evidence.",
)
