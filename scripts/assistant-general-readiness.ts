/** Read-only local QA audit. Run through scripts/with-workspace-env.mjs. */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { resolve } from "node:path"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { resolveModel } from "../apps/api/src/assistant/chat-route"
import { generalAssistantAvailability } from "../apps/api/src/assistant/general-availability"
import { generalCapabilityEnabled } from "../apps/api/src/assistant/general-rollout"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"

if (process.env.DEV_PROFILE !== "local" || process.env.APP_ENV !== "local")
  throw Error("Select the local Development profile for this read-only audit")
applyDatabaseProfile(process.env, loadProductionDatabaseUrl(process.cwd()))
const { prisma } = await import("@ewatrade/db")
try {
  const model = await resolveModel(prisma, "QA", "GENERAL")
  const migrations = await prisma.$queryRaw<
    Array<{
      migration_name: string
      checksum: string
      finished_at: Date | null
      rolled_back_at: Date | null
    }>
  >`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`
  const directory = resolve("packages/db/prisma/migrations")
  let sourceCount = 0
  const missing: string[] = []
  const mismatched: string[] = []
  const unfinished = [
    ...new Set(
      migrations
        .filter((row) => !row.finished_at && !row.rolled_back_at)
        .map((row) => row.migration_name),
    ),
  ]
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    sourceCount += 1
    const sql = await readFile(resolve(directory, entry.name, "migration.sql"))
    const checksum = createHash("sha256").update(sql).digest("hex")
    const rows = migrations.filter(
      (row) => row.migration_name === entry.name && !row.rolled_back_at,
    )
    const applied = rows.find((row) => row.finished_at)
    if (!applied) missing.push(entry.name)
    else if (applied.checksum !== checksum) mismatched.push(entry.name)
  }
  const sourceFiles = [
    "scripts/assistant-general-readiness.ts",
    "apps/api/src/assistant/general-context.ts",
    "apps/api/src/assistant/general-rollout.ts",
    "apps/api/src/assistant/general-tools.ts",
    "apps/api/src/assistant/general-count-answer.ts",
    "apps/api/src/assistant/general-order-contact-count-answer.ts",
    "apps/api/src/assistant/general-receivables.ts",
    "apps/api/src/assistant/general-catalog-item.ts",
    "apps/api/src/assistant/general-catalog-history.ts",
    "apps/api/src/assistant/general-inventory-balances.ts",
    "apps/api/src/assistant/general-inventory-totals.ts",
    "packages/db/src/queries/inventory-compatible-pages.ts",
    "packages/db/src/queries/inventory-reporting.ts",
    "apps/api/src/trpc/routers/catalog-detail.ts",
    "packages/db/src/queries/customer-ledger/receivables.ts",
    "apps/api/src/assistant/general-lookup-inputs.ts",
    "apps/api/src/assistant/general-order-answer.ts",
    "apps/api/src/schemas/order-visibility.ts",
    "apps/api/src/trpc/routers/orders.ts",
    "apps/api/src/schemas/customers.ts",
    "apps/api/src/schemas/catalog.ts",
    "apps/api/src/trpc/routers/customers.ts",
    "apps/api/src/trpc/routers/catalog.ts",
    "packages/db/src/queries/customers.ts",
    "packages/db/src/queries/literal-contains.ts",
    "apps/api/src/assistant/general-low-stock-answers.ts",
    "apps/api/src/assistant/general-operational-answers.ts",
    "packages/db/src/queries/catalog-low-stock.ts",
    "packages/db/src/queries/commercial-order-operational-summary.ts",
    "apps/api/src/trpc/routers/inventory.ts",
    "apps/api/src/schemas/inventory.ts",
    "packages/assistant/src/general/rehearsal.ts",
    "packages/assistant/src/general/prompt.ts",
    "apps/api/src/assistant/general-chat-route.ts",
    "apps/api/src/assistant/general-sales-answer.ts",
    "apps/api/src/assistant/general-product-availability.ts",
    "apps/api/src/assistant/general-product-units.ts",
    "apps/dashboard/src/components/general-assistant/general-unit-editor.tsx",
    "packages/assistant/src/general/unit-configuration.ts",
    "packages/db/src/queries/catalog-unit-configurations.ts",
    "apps/dashboard/src/components/general-assistant/general-proposal-editor.tsx",
    "packages/assistant/src/general/contracts.ts",
    "packages/db/src/queries/catalog.ts",
    "apps/api/src/assistant/model-resolution.ts",
    "packages/assistant/src/capabilities/manifest.ts",
    "apps/api/src/schemas/orders.ts",
    "packages/db/src/queries/commercial-orders.ts",
    "apps/api/src/assistant/general-stock-receipt.ts",
    "apps/api/src/assistant/general-stock-count.ts",
    "packages/db/src/queries/inventory-stock-count-review.ts",
    "apps/dashboard/src/components/general-assistant/general-stock-count-editor.tsx",
    "apps/dashboard/src/components/inventory/stock-count-details.tsx",
    "apps/dashboard/src/components/sheets/stock-count-sheet.tsx",
    "apps/dashboard/src/hooks/use-stock-count-params.ts",
    "apps/dashboard/src/components/general-assistant/general-stock-receipt-editor.tsx",
    "packages/db/src/queries/inventory-operations.ts",
  ]
  const fingerprints = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      ]),
    ),
  )
  const report = {
    profile: "local",
    source: {
      head: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      fingerprints,
    },
    pilot: {
      restricted: process.env.ASSISTANT_GENERAL_CAPABILITIES !== undefined,
      capabilities: capabilityManifest
        .filter((value) => generalCapabilityEnabled(value))
        .map((value) => value.id),
    },
    checkedAt: new Date().toISOString(),
    availability: generalAssistantAvailability(process.env),
    qaModel: model
      ? {
          provider: model.provider,
          modelId: model.modelId,
          rehearsal: model.rehearsal,
        }
      : null,
    migrationLedger: { sourceCount, missing, mismatched, unfinished },
    legal:
      "Local testing bypass applies; production registration acceptance requires separate proof.",
    deployment: "Local source audit only; no hosted deployment verified.",
  }
  console.log(JSON.stringify(report, null, 2))
  if (
    !report.availability.enabled ||
    !model?.rehearsal ||
    report.pilot.capabilities.length === 0 ||
    missing.length ||
    mismatched.length ||
    unfinished.length
  )
    process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
