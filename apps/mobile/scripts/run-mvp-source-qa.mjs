import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const CHECKS = [
  {
    label: "App launch config",
    script: "check-app-launch-config.mjs",
  },
  {
    label: "App shell",
    script: "check-app-shell.mjs",
  },
  {
    label: "Action primitives",
    script: "check-action-primitives.mjs",
  },
  {
    label: "Auth onboarding flow",
    script: "check-auth-onboarding-flow.mjs",
  },
  {
    label: "Auth redesign",
    script: "check-auth-redesign.mjs",
  },
  {
    label: "Create-sale flow",
    script: "check-create-sale-flow.mjs",
  },
  {
    label: "Customer book flow",
    script: "check-customer-book-flow.mjs",
  },
  {
    label: "Dashboard production flow",
    script: "check-dashboard-production-flow.mjs",
  },
  {
    label: "Design foundation",
    script: "check-design-foundation.mjs",
  },
  {
    label: "First-product flow",
    script: "check-first-product-flow.mjs",
  },
  {
    label: "Inventory operations flow",
    script: "check-inventory-operations-flow.mjs",
  },
  {
    label: "Keyboard coverage",
    script: "check-keyboard-coverage.mjs",
  },
  {
    label: "Long-list coverage",
    script: "check-long-list-coverage.mjs",
  },
  {
    label: "Mobile env config",
    script: "check-mobile-env-config.mjs",
  },
  {
    label: "Expo EAS env attachment",
    script: "check-expo-env-attachment.mjs",
  },
  {
    label: "MVP surface structure",
    script: "check-mvp-surface-structure.mjs",
  },
  {
    label: "Mobile auth API boundary",
    script: "check-mobile-auth-api-boundary.mjs",
  },
  {
    label: "MVP smoke-flow coverage",
    script: "check-mvp-smoke-flow-coverage.mjs",
  },
  {
    label: "NativeWind style mix",
    script: "check-nativewind-style-mix.mjs",
  },
  {
    label: "Offline visual coverage",
    script: "check-offline-visual-coverage.mjs",
  },
  {
    label: "Offline sync flow",
    script: "check-offline-sync-flow.mjs",
  },
  {
    label: "Prompt placeholders",
    script: "check-prompt-placeholders.mjs",
  },
  {
    label: "Product share management flow",
    script: "check-product-share-management-flow.mjs",
  },
  {
    label: "Reports flow",
    script: "check-reports-flow.mjs",
  },
  {
    label: "Retail Ops API boundary",
    script: "check-retail-ops-api-boundary.mjs",
  },
  {
    label: "Session/offline persistence",
    script: "check-session-offline-persistence.mjs",
  },
  {
    label: "Theme colors",
    script: "check-theme-color-guard.mjs",
  },
  {
    label: "Shared product storefront",
    script: "check-shared-product-storefront.mjs",
  },
  {
    label: "Staff flow",
    script: "check-staff-flow.mjs",
  },
  {
    label: "Subscription flow",
    script: "check-subscription-flow.mjs",
  },
]

for (const check of CHECKS) {
  console.log(`\n== ${check.label} ==`)

  const result = spawnSync(process.execPath, [join(SCRIPT_DIR, check.script)], {
    stdio: "inherit",
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
}

console.log("\nMobile MVP source QA passed.")
