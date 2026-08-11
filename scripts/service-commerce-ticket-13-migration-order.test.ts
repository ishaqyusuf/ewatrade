import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const migrationRoot = resolve(root, "packages/db/prisma/migrations")

const reportingMigrations = [
  "20260811144714_service_commerce_reporting_usage",
  "20260811161234_catalog_source_resolution_snapshot",
  "20260811161703_commerce_quote_price_suggestion_snapshot",
  "20260811172000_reporting_truth_snapshots",
  "20260811200000_service_commerce_report_read_audit",
  "20260811203000_service_commerce_report_read_source",
  "20260811210000_service_commerce_report_rate_limit",
] as const

function migrationSql(migration: (typeof reportingMigrations)[number]) {
  return readFileSync(
    resolve(migrationRoot, migration, "migration.sql"),
    "utf8",
  )
}

const reviewedStoreConstraintDrop =
  'ALTER TABLE "ServiceCommerceReportReadAuditEvent" DROP CONSTRAINT "ServiceCommerceReportReadAuditEvent_storeId_fkey";'
const reviewedStoreConstraintReplacement =
  'ALTER TABLE "ServiceCommerceReportReadAuditEvent" ADD CONSTRAINT "ServiceCommerceReportReadAuditEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;'

function occursExactlyOnce(value: string, pattern: string) {
  return value.split(pattern).length === 2
}

function hasUnreviewedDestructiveStatement(
  migration: (typeof reportingMigrations)[number],
  sql: string,
) {
  const hasReviewedReplacementPair =
    migration === "20260811203000_service_commerce_report_read_source" &&
    occursExactlyOnce(sql, reviewedStoreConstraintDrop) &&
    occursExactlyOnce(sql, reviewedStoreConstraintReplacement)
  const withoutReviewedConstraint = hasReviewedReplacementPair
    ? sql
        .replace(reviewedStoreConstraintDrop, "")
        .replace(reviewedStoreConstraintReplacement, "")
    : sql
  const withoutComments = withoutReviewedConstraint.replace(/--.*$/gm, "")
  const withoutForeignKeyDeleteActions = withoutComments.replace(
    /\bON\s+DELETE\s+(?:RESTRICT|CASCADE|SET\s+NULL|NO\s+ACTION)\b/gi,
    "",
  )

  return /\b(?:DROP|DELETE|TRUNCATE)\b/i.test(withoutForeignKeyDeleteActions)
}

describe("Ticket 13 reporting migration preflight", () => {
  test("keeps the seven generated reporting migrations present and replay-ordered", () => {
    for (const migration of reportingMigrations) {
      expect(
        existsSync(resolve(migrationRoot, migration, "migration.sql")),
      ).toBe(true)
    }

    expect([...reportingMigrations]).toEqual(
      [...reportingMigrations].toSorted(),
    )
  })

  test("adds the rate-limit enum value only after its report-read enum exists", () => {
    const reportReadAudit = migrationSql(
      "20260811200000_service_commerce_report_read_audit",
    )
    const rateLimit = migrationSql(
      "20260811210000_service_commerce_report_rate_limit",
    )

    expect(reportReadAudit).toContain(
      'CREATE TYPE "ServiceCommerceReportReadDenialReason"',
    )
    expect(rateLimit).toContain(
      "ALTER TYPE \"ServiceCommerceReportReadDenialReason\" ADD VALUE 'RATE_LIMITED'",
    )
    expect(
      reportingMigrations.indexOf(
        "20260811200000_service_commerce_report_read_audit",
      ),
    ).toBeLessThan(
      reportingMigrations.indexOf(
        "20260811210000_service_commerce_report_rate_limit",
      ),
    )
  })

  test("contains no data- or schema-destructive reporting migration statement", () => {
    for (const migration of reportingMigrations) {
      expect(
        hasUnreviewedDestructiveStatement(migration, migrationSql(migration)),
      ).toBe(false)
    }

    const source = migrationSql(
      "20260811203000_service_commerce_report_read_source",
    )
    expect(source).toContain(reviewedStoreConstraintDrop)
    expect(source).toContain(reviewedStoreConstraintReplacement)
  })

  test("rejects every unreviewed destructive statement form", () => {
    const migration = "20260811172000_reporting_truth_snapshots"

    for (const sql of [
      'DROP VIEW "ServiceCommerceReport";',
      'DROP MATERIALIZED VIEW "ServiceCommerceReport";',
      'ALTER TABLE "CommercialOrder" DROP COLUMN "completedAt";',
      'DELETE FROM "CommercialOrder";',
      'WITH target AS (SELECT "id" FROM "CommercialOrder") DELETE FROM "CommercialOrder";',
      'TRUNCATE TABLE "CommercialOrder";',
    ]) {
      expect(hasUnreviewedDestructiveStatement(migration, sql)).toBe(true)
    }

    expect(
      hasUnreviewedDestructiveStatement(
        "20260811203000_service_commerce_report_read_source",
        `${reviewedStoreConstraintDrop}\n${reviewedStoreConstraintReplacement}`,
      ),
    ).toBe(false)
    expect(
      hasUnreviewedDestructiveStatement(
        "20260811203000_service_commerce_report_read_source",
        reviewedStoreConstraintDrop,
      ),
    ).toBe(true)
  })
})
