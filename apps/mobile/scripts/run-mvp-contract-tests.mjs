import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const CONTRACT_TESTS = [
  {
    files: ["apps/api/src/auth/mobile-google.test.ts"],
    label: "API Google auth verifier",
  },
  {
    files: ["apps/api/src/trpc/routers/auth.test.ts"],
    label: "API mobile auth schemas",
  },
  {
    files: ["apps/api/src/trpc/routers/retail-ops-follow-up.test.ts"],
    label: "API retail ops follow-up router",
  },
  {
    files: ["apps/api/src/schemas/tenant.test.ts"],
    label: "API tenant store schemas",
  },
  {
    files: ["packages/db/src/queries/stores.test.ts"],
    label: "DB tenant store queries",
  },
  {
    files: ["packages/db/src/queries/mobile-auth.test.ts"],
    label: "DB mobile auth queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-share-links.test.ts"],
    label: "DB shared-link follow-up queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-products.test.ts"],
    label: "DB retail ops product setup queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops.test.ts"],
    label: "DB retail ops dashboard report queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-sales.test.ts"],
    label: "DB retail ops sales queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-sessions.test.ts"],
    label: "DB retail ops session queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-stock.test.ts"],
    label: "DB retail ops stock operation queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-stock-wallets.test.ts"],
    label: "DB retail ops staff stock wallet queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-sync.test.ts"],
    label: "DB retail ops sync ledger queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-subscriptions.test.ts"],
    label: "DB retail ops subscription queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-fulfillment.test.ts"],
    label: "DB retail ops fulfillment queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-customers.test.ts"],
    label: "DB retail ops customer queries",
  },
  {
    files: ["packages/db/src/queries/retail-ops-staff.test.ts"],
    label: "DB retail ops staff queries",
  },
  {
    files: ["apps/api/src/schemas/retail-ops.test.ts"],
    label: "API retail ops schemas",
  },
  {
    files: [
      "apps/mobile/src/lib/quantity.test.ts",
      "apps/mobile/src/lib/reports-export.test.ts",
      "apps/mobile/src/lib/retail-ops-sync.test.ts",
      "apps/mobile/src/lib/retail-ops-subscription.test.ts",
      "apps/mobile/src/store/retailOpsStore.test.ts",
    ],
    label: "Mobile offline, quantity, subscription, and local smoke helpers",
  },
  {
    files: ["packages/notifications/src/services/email-service.test.ts"],
    label: "Shared-link notification dispatch",
  },
  {
    files: [
      "apps/storefront/src/app/p/[tenantSlug]/[storeSlug]/[productSlug]/shared-product-order-utils.test.ts",
    ],
    label: "Storefront shared product order helpers",
  },
]
const COMMAND_CHECKS = [
  {
    args: ["apps/mobile/scripts/check-android-qa-ready-fixtures.mjs"],
    command: process.execPath,
    label: "Android QA readiness fixtures",
  },
  {
    args: ["apps/mobile/scripts/check-google-oauth-ready-fixtures.mjs"],
    command: process.execPath,
    label: "Mobile Google OAuth readiness fixtures",
  },
  {
    args: ["apps/mobile/scripts/check-expo-env-attachment-fixtures.mjs"],
    command: process.execPath,
    label: "Expo EAS env attachment fixtures",
  },
  {
    args: ["apps/mobile/scripts/check-google-oauth-live-fixtures.mjs"],
    command: process.execPath,
    label: "Mobile Google OAuth live QA fixtures",
  },
  {
    args: ["apps/mobile/scripts/check-shared-link-live-ready-fixtures.mjs"],
    command: process.execPath,
    label: "Shared-link live readiness fixtures",
  },
  {
    args: ["apps/mobile/scripts/check-shared-link-preview-url-fixtures.mjs"],
    command: process.execPath,
    label: "Shared-link public preview URL fixtures",
  },
  {
    args: [
      "apps/mobile/scripts/check-shared-link-browser-checkout-fixtures.mjs",
    ],
    command: process.execPath,
    label: "Shared-link browser checkout readiness fixtures",
  },
  {
    args: ["apps/mobile/scripts/check-mvp-live-env-checklist-fixtures.mjs"],
    command: process.execPath,
    label: "MVP live environment checklist fixtures",
  },
  {
    args: ["apps/mobile/scripts/check-mvp-live-readiness-fixtures.mjs"],
    command: process.execPath,
    label: "MVP live readiness runner fixtures",
  },
  {
    args: ["apps/mobile/scripts/check-mvp-readiness-fixtures.mjs"],
    command: process.execPath,
    label: "MVP readiness runner fixtures",
  },
  {
    args: ["apps/mobile/scripts/check-mvp-local-readiness-fixtures.mjs"],
    command: process.execPath,
    label: "MVP local readiness runner fixtures",
  },
  {
    args: [
      "apps/mobile/scripts/check-mvp-hands-on-smoke-checklist-fixtures.mjs",
    ],
    command: process.execPath,
    label: "MVP hands-on smoke checklist fixtures",
  },
  {
    args: [
      "apps/mobile/scripts/check-mvp-hands-on-evidence-template-fixtures.mjs",
    ],
    command: process.execPath,
    label: "MVP hands-on evidence template fixtures",
  },
  {
    args: ["apps/mobile/scripts/check-mvp-hands-on-evidence-file-fixtures.mjs"],
    command: process.execPath,
    label: "MVP hands-on evidence file fixtures",
  },
]

for (const testGroup of CONTRACT_TESTS) {
  console.log(`\n== ${testGroup.label} ==`)

  const result = spawnSync("bun", ["test", ...testGroup.files], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

for (const check of COMMAND_CHECKS) {
  console.log(`\n== ${check.label} ==`)

  const result = spawnSync(check.command, check.args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log("\nMobile MVP contract tests passed.")
