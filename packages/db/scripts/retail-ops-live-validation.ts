import { Prisma, type PrismaClient } from "../src/generated/prisma/client"

type CheckStatus = "pass" | "warn" | "fail"

type ValidationCheck = {
  name: string
  status: CheckStatus
  detail: string
  evidence?: unknown
}

type TablePresenceRow = {
  tableName: string
}

type MigrationRow = {
  migrationName: string
}

const REQUIRED_RETAIL_OPS_MIGRATIONS = [
  "20260711120000_retail_ops_stock_ledger_foundation",
  "20260711123000_retail_ops_subscription_foundation",
  "20260711130000_retail_ops_sync_foundation",
  "20260711133000_retail_ops_share_links_foundation",
  "20260711140000_retail_ops_closeout_foundation",
  "20260711143000_retail_ops_staff_stock_wallet_foundation",
  "20260711150000_retail_ops_customer_book_foundation",
  "20260711153000_retail_ops_product_units_price_history_foundation",
  "20260711160000_retail_ops_staff_profile_audit_foundation",
  "20260711163000_retail_ops_billing_checkout_foundation",
  "20260711170000_retail_ops_share_link_operations_foundation"
]

const EXPECTED_RETAIL_OPS_TABLES = [
  "SubscriptionPlan",
  "TenantSubscription",
  "BillingCheckoutSession",
  "BillingInvoice",
  "BillingProviderEvent",
  "ProductUnitTemplate",
  "ProductUnitTemplateUnit",
  "ProductUnitPriceHistory",
  "InventoryMovement",
  "OfflineDevice",
  "OfflineDeviceRevocation",
  "RetailOpsSyncRun",
  "RetailOpsSyncEvent",
  "ProductShareLink",
  "ProductShareLinkEvent",
  "ProductShareLinkView",
  "ProductShareLinkOrderRequest",
  "ProductShareLinkReservation",
  "ProductShareLinkNotification",
  "ProductShareLinkAnalyticsDaily",
  "RetailOpsCustomer",
  "RetailOpsCustomerIdentity",
  "RetailOpsCustomerEvent",
  "RetailOpsCloseout",
  "RetailOpsPaymentDeclaration",
  "RetailOpsStockDeclaration",
  "RetailOpsCloseoutReview",
  "StaffStockWallet",
  "RetailOpsStaffProfile",
  "RetailOpsStaffInviteToken",
  "RetailOpsStaffLifecycleEvent"
]

const REQUIRED_PLAN_KEYS = ["starter", "growth", "pro"]

async function loadDatabaseClient(): Promise<PrismaClient> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must point to an intentional validation database before running Retail Ops live validation."
    )
  }

  const { prisma } = await import("../src/client")

  return prisma
}

function pass(name: string, detail: string, evidence?: unknown): ValidationCheck {
  return { name, status: "pass", detail, evidence }
}

function warn(name: string, detail: string, evidence?: unknown): ValidationCheck {
  return { name, status: "warn", detail, evidence }
}

function fail(name: string, detail: string, evidence?: unknown): ValidationCheck {
  return { name, status: "fail", detail, evidence }
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

async function runRequiredCheck(
  name: string,
  check: () => Promise<ValidationCheck>
): Promise<ValidationCheck> {
  try {
    return await check()
  } catch (error) {
    return fail(name, formatError(error))
  }
}

async function tableExists(db: PrismaClient, tableName: string) {
  const rows = await db.$queryRaw<TablePresenceRow[]>(Prisma.sql`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ${tableName}
    LIMIT 1
  `)

  return rows.length > 0
}

async function checkConnection(db: PrismaClient) {
  await db.$connect()

  return pass("database connection", "Connected to the configured validation database.")
}

async function checkMigrations(db: PrismaClient) {
  const migrationTableExists = await tableExists(db, "_prisma_migrations")

  if (!migrationTableExists) {
    return fail(
      "retail ops migration records",
      "The _prisma_migrations table is missing on the selected database."
    )
  }

  const rows = await db.$queryRaw<MigrationRow[]>(Prisma.sql`
    SELECT migration_name AS "migrationName"
    FROM "_prisma_migrations"
    WHERE migration_name IN (${Prisma.join(REQUIRED_RETAIL_OPS_MIGRATIONS)})
    ORDER BY migration_name
  `)
  const applied = new Set(rows.map((row) => row.migrationName))
  const missing = REQUIRED_RETAIL_OPS_MIGRATIONS.filter(
    (migrationName) => !applied.has(migrationName)
  )

  if (missing.length > 0) {
    return fail(
      "retail ops migration records",
      "One or more required Retail Ops migrations have not been applied.",
      { missing, applied: rows.map((row) => row.migrationName) }
    )
  }

  return pass(
    "retail ops migration records",
    "All required Retail Ops migrations are recorded as applied.",
    { applied: rows.map((row) => row.migrationName) }
  )
}

async function checkExpectedTables(db: PrismaClient) {
  const missing: string[] = []

  for (const tableName of EXPECTED_RETAIL_OPS_TABLES) {
    if (!(await tableExists(db, tableName))) {
      missing.push(tableName)
    }
  }

  if (missing.length > 0) {
    return fail(
      "retail ops table presence",
      "One or more required Retail Ops tables are missing from the selected database.",
      { missing }
    )
  }

  return pass(
    "retail ops table presence",
    "All expected Retail Ops foundation tables are present.",
    { count: EXPECTED_RETAIL_OPS_TABLES.length }
  )
}

async function checkDelegateCounts(db: PrismaClient) {
  const counts = {
    billingProviderEvents: await db.billingProviderEvent.count(),
    closeouts: await db.retailOpsCloseout.count(),
    customerBookRows: await db.retailOpsCustomer.count(),
    inventoryMovements: await db.inventoryMovement.count(),
    productUnitPriceHistory: await db.productUnitPriceHistory.count(),
    shareLinks: await db.productShareLink.count(),
    staffProfiles: await db.retailOpsStaffProfile.count(),
    staffStockWallets: await db.staffStockWallet.count(),
    syncRuns: await db.retailOpsSyncRun.count()
  }

  return pass(
    "retail ops delegate read probes",
    "Core Retail Ops Prisma delegates can read their durable tables.",
    counts
  )
}

async function checkSubscriptionPlans(db: PrismaClient) {
  const plans = await db.subscriptionPlan.findMany({
    where: {
      key: {
        in: REQUIRED_PLAN_KEYS
      }
    },
    select: {
      key: true,
      isActive: true
    },
    orderBy: {
      key: "asc"
    }
  })
  const activeKeys = new Set(
    plans.filter((plan) => plan.isActive).map((plan) => plan.key)
  )
  const missingActiveKeys = REQUIRED_PLAN_KEYS.filter((key) => !activeKeys.has(key))

  if (missingActiveKeys.length > 0) {
    return fail(
      "retail ops subscription plan reference data",
      "The validation database is missing active Starter, Growth, or Pro plan rows.",
      { missingActiveKeys, plans }
    )
  }

  return pass(
    "retail ops subscription plan reference data",
    "Active Starter, Growth, and Pro plan rows exist.",
    { plans }
  )
}

async function checkUnitTemplateReferenceData(db: PrismaClient) {
  const templates = await db.productUnitTemplate.findMany({
    where: {
      isActive: true,
      isSystem: true
    },
    select: {
      key: true,
      name: true
    },
    orderBy: [
      {
        sortOrder: "asc"
      },
      {
        key: "asc"
      }
    ],
    take: 20
  })

  if (templates.length === 0) {
    return warn(
      "retail ops unit-template reference data",
      "No active system ProductUnitTemplate rows were found; app fallback presets must be documented for this validation run."
    )
  }

  return pass(
    "retail ops unit-template reference data",
    "Active system ProductUnitTemplate rows exist.",
    { templates }
  )
}

async function buildValidationReport(db: PrismaClient) {
  const checks = [
    await runRequiredCheck("database connection", () => checkConnection(db)),
    await runRequiredCheck("retail ops migration records", () => checkMigrations(db)),
    await runRequiredCheck("retail ops table presence", () => checkExpectedTables(db)),
    await runRequiredCheck("retail ops delegate read probes", () =>
      checkDelegateCounts(db)
    ),
    await runRequiredCheck("retail ops subscription plan reference data", () =>
      checkSubscriptionPlans(db)
    ),
    await runRequiredCheck("retail ops unit-template reference data", () =>
      checkUnitTemplateReferenceData(db)
    )
  ]
  const failed = checks.filter((check) => check.status === "fail")
  const warnings = checks.filter((check) => check.status === "warn")

  return {
    ok: failed.length === 0,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    checks,
    summary: {
      failed: failed.length,
      passed: checks.filter((check) => check.status === "pass").length,
      warnings: warnings.length
    }
  }
}

async function main() {
  const db = await loadDatabaseClient()

  try {
    const report = await buildValidationReport(db)

    console.log(JSON.stringify(report, null, 2))

    if (!report.ok) {
      process.exitCode = 1
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        readOnly: true,
        checks: [
          fail(
            "retail ops live validation bootstrap",
            formatError(error)
          )
        ],
        summary: {
          failed: 1,
          passed: 0,
          warnings: 0
        }
      },
      null,
      2
    )
  )
  process.exitCode = 1
})
