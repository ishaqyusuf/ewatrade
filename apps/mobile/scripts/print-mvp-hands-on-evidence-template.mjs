const USE_PRODUCTION_ENV = Boolean(process.env.MVP_HANDS_ON_EVIDENCE_ENV_FILE)
const checklistCommand = USE_PRODUCTION_ENV
  ? "bun run --cwd apps/mobile qa:mvp-hands-on-checklist:prod"
  : "bun run --cwd apps/mobile qa:mvp-hands-on-checklist"
const liveChecklistCommand = USE_PRODUCTION_ENV
  ? "bun run --cwd apps/mobile qa:mvp-live-env-checklist:prod"
  : "bun run --cwd apps/mobile qa:mvp-live-env-checklist"
const liveReadinessCommand = USE_PRODUCTION_ENV
  ? "bun run --cwd apps/mobile qa:mvp-live-readiness:prod"
  : "bun run --cwd apps/mobile qa:mvp-live-readiness"
const fullReadinessCommand = USE_PRODUCTION_ENV
  ? "bun run --cwd apps/mobile qa:mvp-readiness:prod"
  : "bun run --cwd apps/mobile qa:mvp-readiness"
const blockerReportCommand = USE_PRODUCTION_ENV
  ? "bun run --cwd apps/mobile qa:mvp-live-blocker-report:prod"
  : ""

const evidenceSections = [
  {
    checks: [
      "Splash hands off to Login from a cold start.",
      "Owner email OTP or Google flow lands in the expected business context.",
      "New-owner signup asks only for name, business name, and email before OTP.",
    ],
    title: "Launch And Auth",
  },
  {
    checks: [
      "First product prompt captures product, unit, price, variants, and starting stock.",
      "Dashboard shows sales, stock, low-stock, staff/session, sync, and subscription surfaces.",
      "Light and dark screenshots show readable contrast with no overlapping controls.",
      "Compact-phone screenshots show text, controls, and bottom navigation without overlap.",
      "Owner and attendant role screenshots show the correct dashboard actions and restrictions.",
    ],
    title: "First Product And Dashboard",
  },
  {
    checks: [
      "Staff invite/onboarding fields remain keyboard-safe.",
      "Keyboard-open screenshots cover auth, OTP, first product, quantity, customer, staff invite, and follow-up forms.",
      "Sales session opens for the actor or shows the intended production-unavailable fallback.",
    ],
    title: "Staff And Sessions",
  },
  {
    checks: [
      "Create Sale lists products and variants correctly.",
      "Quantity plus/minus/numeric entry updates total on the same screen.",
      "Cash/transfer payment and customer book capture complete without duplicate entry.",
      "Tap targets, contrast, status copy, and text fit meet the redesign acceptance bar.",
    ],
    title: "Sale And Customer Book",
  },
  {
    checks: [
      "Offline banner is visible and uses reconnect-sync copy.",
      "At least one offline event queues safely and reconciles without duplicate sale or stock movement.",
      "Pending, failed, conflict, retry, and review states are readable in Sync status.",
      "Offline, pending, failed, retry, and conflict screenshots show clear status copy.",
    ],
    title: "Offline And Sync",
  },
  {
    checks: [
      "Stock intake, unit conversion, and manual adjustment quantity fields stay keyboard-safe.",
      "Reports, CSV/export, closeout, credit, and sync conflict surfaces are readable.",
      "Starter, Growth, and Pro plan surfaces plus upgrade handoff are visible.",
      "Floating bottom-sheet screenshots cover first product, create sale, inventory, staff, customer, product share, and sync states.",
    ],
    title: "Inventory, Reports, And Subscription",
  },
  {
    checks: [
      "Product link generation, copy/share, analytics, and deactivation controls are visible.",
      "Public preview metadata gate passes for product, business, host, image, Open Graph, and Twitter metadata.",
      "Browser checkout submits a disposable order and the pending request appears for follow-up.",
      "Follow-up completes or cancels the request with notification/audit and stock reservation evidence.",
      "NativeWind source checks pass for className/style discipline on changed mobile UI components.",
    ],
    title: "Share Links And Web Checkout",
  },
]

console.log("# Mobile Retail Ops MVP Hands-On Evidence")
console.log("")
console.log(
  `Environment target: ${
    USE_PRODUCTION_ENV ? "production env file" : "default local env file"
  }`,
)
console.log("")
console.log("## Safe Evidence Rules")
console.log(
  "- Do not paste OTPs, bearer tokens, Google ID tokens, customer passwords, or live share tokens.",
)
console.log(
  "- Record URLs only as host/path summaries when the URL contains a private share token.",
)
console.log(
  "- Screenshot paths are allowed only when they do not reveal customer secrets.",
)
console.log("")
console.log("## Preflight Commands")
console.log(
  `- [ ] ${checklistCommand} -> absolute .log/.txt/.md/.json artifact path`,
)
console.log(
  `- [ ] ${liveChecklistCommand} -> absolute .log/.txt/.md/.json artifact path`,
)
if (blockerReportCommand) {
  console.log(
    `- [ ] ${blockerReportCommand} -> absolute .log/.txt/.md/.json artifact path`,
  )
}
console.log(
  `- [ ] ${liveReadinessCommand} -> absolute .log/.txt/.md/.json artifact path`,
)
console.log(
  `- [ ] ${fullReadinessCommand} -> absolute .log/.txt/.md/.json artifact path`,
)
console.log("")
console.log("## Run Context")
console.log("- Date:")
console.log("- Device or emulator:")
console.log("- OS/API target:")
console.log("- Viewport:")
console.log("- API target host:")
console.log("- Storefront target host:")
console.log("- QA mode:")
console.log("- Tester:")
console.log("")

for (const section of evidenceSections) {
  console.log(`## ${section.title}`)
  for (const check of section.checks) {
    console.log(`- [ ] ${check}`)
  }
  console.log("- Evidence:")
  console.log("- Screenshots or logs: absolute screenshot/log artifact path")
  console.log("- Notes:")
  console.log("")
}

console.log("## Release Gate Summary")
console.log("- [ ] Live Google provider flow has current evidence.")
console.log("- [ ] Live shared-link write/email flow has current evidence.")
console.log("- [ ] Deployed public preview has current evidence.")
console.log("- [ ] Browser checkout has current evidence.")
console.log("- [ ] Full device smoke run has current evidence.")
console.log("- Google evidence: command plus absolute .json evidence path")
console.log(
  "- Shared-link live evidence: command plus absolute .json evidence path",
)
console.log(
  "- Public preview evidence: command plus absolute .json evidence path",
)
console.log(
  "- Browser checkout evidence: command plus absolute .png evidence path",
)
console.log(
  "- Device smoke evidence: hands-on checklist command or full device smoke note plus absolute screenshot/log artifact path",
)
console.log("- Remaining blockers:")
console.log(
  "- Live blocker report: blocker-report command plus absolute .json path when blockers remain; report must be from production env, same run date, and include missingRequiredCount plus publicConfiguredValues proof. Use None when no blockers remain.",
)
console.log("")
console.log("## Evidence Validation")
console.log(
  "- After the note is complete, set MVP_HANDS_ON_EVIDENCE_FILE to this file path and run bun run --cwd apps/mobile qa:mvp-hands-on-evidence-file.",
)
