import { describe, expect, test } from "bun:test"

import {
  assertServiceCommerceProductionDriftInventoryEnvironment,
  collectServiceCommerceProductionDriftInventory,
} from "./service-commerce-production-drift-inventory"

const expectedMigrationNames = [
  "0001_init",
  "0002_better_auth",
  "20260706155304",
  "20260711120000_retail_ops_stock_ledger_foundation",
  "20260711123000_retail_ops_subscription_foundation",
  "20260711130000_retail_ops_sync_foundation",
]

const productionEnvironment = {
  APP_ENV: "production",
  DATABASE_PROFILE_VERIFIED: "1",
  EWATRADE_DATABASE_URL:
    "postgresql://app-writer:application-password@readonly.example.com:5432/ewatrade",
  DEV_PROFILE: "prod",
  PRODUCTION_READONLY_DATABASE_URL:
    "postgresql://readonly-inventory:never-return-this-password@readonly.example.com:5432/ewatrade?sslmode=verify-full",
  SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_AUTHORIZED: "1",
  SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_TARGET_FINGERPRINT:
    "postgresql://readonly.example.com:5432/ewatrade#identity=e41be799",
}

type QueryCall = { kind: "execute" | "query"; sql: string }

function inventoryClient(options?: {
  elevatedRole?: boolean
  errorCode?: string | null
  failQuery?: boolean
  globalWriterPrivilege?: boolean
  ledgerOverflow?: boolean
  metadataOverflow?: boolean
  ownsObject?: boolean
  securityDefinerExecutor?: boolean
  sequenceWriterPrivilege?: boolean
  serviceQuoteGraphInstalled?: boolean
}) {
  const calls: QueryCall[] = []
  const client = {
    execute: async (sql: string) => {
      calls.push({ kind: "execute" as const, sql })
    },
    query: async <T>(sql: string) => {
      calls.push({ kind: "query" as const, sql })
      if (options?.failQuery) throw new Error("read failed")
      if (sql.includes("SHOW transaction_read_only")) {
        return [{ transaction_read_only: "on" }] as T
      }
      if (sql.includes("has_schema_privilege")) {
        return [
          {
            all_present_tables_selectable: true,
            any_database_create_or_temp_privilege: false,
            any_non_system_schema_create_privilege: false,
            any_non_system_sequence_write_privilege:
              options?.sequenceWriterPrivilege ?? false,
            any_non_system_table_write_privilege:
              options?.globalWriterPrivilege ?? false,
            any_security_definer_execute_privilege:
              options?.securityDefinerExecutor ?? false,
            elevated_role: options?.elevatedRole ?? false,
            owns_non_system_object: options?.ownsObject ?? false,
          },
        ] as T
      }
      if (sql.includes("_prisma_migrations")) {
        if (options?.ledgerOverflow) {
          return Array.from({ length: 257 }, (_, index) => ({
            applied_steps_count: 1,
            error_code: null,
            finished_at: "2026-07-01T00:00:00.000Z",
            migration_name: `overflow_${index.toString().padStart(3, "0")}`,
            rolled_back_at: null,
          })) as T
        }
        return [
          {
            applied_steps_count: 1,
            error_code: null,
            finished_at: "2026-07-01T00:00:00.000Z",
            migration_name: "0001_init",
            rolled_back_at: null,
          },
          {
            applied_steps_count: 1,
            error_code: null,
            finished_at: "2026-07-02T00:00:00.000Z",
            migration_name: "0002_better_auth",
            rolled_back_at: null,
          },
          {
            applied_steps_count: 1,
            error_code: null,
            finished_at: "2026-07-03T00:00:00.000Z",
            migration_name: "20260706155304",
            rolled_back_at: null,
          },
          {
            applied_steps_count: 0,
            error_code: options?.errorCode ?? "42P01",
            finished_at: null,
            migration_name: "20260711120000_retail_ops_stock_ledger_foundation",
            rolled_back_at: null,
          },
          {
            applied_steps_count: 1,
            error_code: null,
            finished_at: "2026-07-04T00:00:00.000Z",
            migration_name: "manual_unreviewed_migration",
            rolled_back_at: null,
          },
        ] as T
      }
      if (sql.includes("information_schema.tables")) {
        return [
          { table_name: "_prisma_migrations" },
          { table_name: "CommercialOrder" },
          ...(options?.serviceQuoteGraphInstalled
            ? [
                { table_name: "ServiceQuote" },
                { table_name: "ServiceQuoteLine" },
                { table_name: "ServiceQuoteVersion" },
              ]
            : []),
          { table_name: "Store" },
        ] as T
      }
      if (sql.includes("information_schema.columns")) {
        if (options?.metadataOverflow) {
          return Array.from({ length: 513 }, (_, index) => ({
            column_name: `safe_column_${index.toString().padStart(3, "0")}`,
            data_type: "text",
            is_nullable: "YES",
            table_name: "Store",
          })) as T
        }
        return [
          {
            column_name: "id",
            data_type: "text",
            is_nullable: "NO",
            table_name: "Store",
          },
          {
            column_name: "id",
            data_type: "text",
            is_nullable: "NO",
            table_name: "CommercialOrder",
          },
          {
            column_name: "status",
            data_type: "USER-DEFINED",
            is_nullable: "NO",
            table_name: "CommercialOrder",
          },
        ] as T
      }
      if (sql.includes("inventory_indexes")) {
        return [
          {
            columns: ["id"],
            has_expression_or_predicate: false,
            is_primary: true,
            is_unique: true,
            name: "Store_pkey",
            table_name: "Store",
          },
        ] as T
      }
      if (sql.includes("pg_constraint")) {
        return [
          {
            columns: ["id"],
            kind: "PRIMARY_KEY",
            name: "Store_pkey",
            referenced_table: null,
            table_name: "Store",
          },
        ] as T
      }
      if (sql.includes("reltuples")) {
        return [{ estimated_rows: 4, table_name: "Store" }] as T
      }
      if (sql.includes('FROM "CommercialOrder"')) {
        return [{ completed_count: 0, total_count: 7 }] as T
      }
      if (sql.includes('FROM "ServiceQuote"')) {
        return [{ line_count: 0, quote_count: 0, version_count: 0 }] as T
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
  return { calls, client }
}

describe("Service Commerce production drift inventory environment", () => {
  test("requires exact production, verified, armed, read-only-target, and fingerprint facts", () => {
    expect(() =>
      assertServiceCommerceProductionDriftInventoryEnvironment(
        productionEnvironment,
      ),
    ).not.toThrow()

    for (const environment of [
      { ...productionEnvironment, APP_ENV: "development" },
      { ...productionEnvironment, DEV_PROFILE: "production" },
      { ...productionEnvironment, DATABASE_PROFILE_VERIFIED: "true" },
      {
        ...productionEnvironment,
        SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_AUTHORIZED: "true",
      },
      {
        ...productionEnvironment,
        SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_TARGET_FINGERPRINT:
          "postgresql://readonly.example.com:5432/ewatrade#identity=wrong",
      },
      { ...productionEnvironment, PRODUCTION_READONLY_DATABASE_URL: undefined },
      { ...productionEnvironment, EWATRADE_DATABASE_URL: undefined },
    ]) {
      expect(() =>
        assertServiceCommerceProductionDriftInventoryEnvironment(environment),
      ).toThrow()
    }
  })

  test("rejects local, implicit, overridden, mismatched, and shared-identity targets", () => {
    const localUrls = [
      "postgresql://readonly-inventory:password@localhost:5432/ewatrade",
      "postgresql://readonly-inventory:password@127.0.0.1:5432/ewatrade",
      "postgresql://readonly-inventory:password@[::1]:5432/ewatrade",
      "postgresql://readonly-inventory:password@[::ffff:127.0.0.1]:5432/ewatrade",
      "postgresql://readonly-inventory:password@[::ffff:7f00:1]:5432/ewatrade",
      "postgresql://readonly-inventory:password@10.10.1.4:5432/ewatrade",
      "postgresql://readonly-inventory:password@172.20.1.4:5432/ewatrade",
      "postgresql://readonly-inventory:password@192.168.1.4:5432/ewatrade",
      "postgresql://readonly-inventory:password@[fc00::1]:5432/ewatrade",
    ]
    for (const readonlyUrl of localUrls) {
      const applicationUrl = new URL(readonlyUrl)
      applicationUrl.username = "app-writer"
      applicationUrl.password = "application-password"
      expect(() =>
        assertServiceCommerceProductionDriftInventoryEnvironment({
          ...productionEnvironment,
          EWATRADE_DATABASE_URL: applicationUrl.href,
          PRODUCTION_READONLY_DATABASE_URL: readonlyUrl,
        }),
      ).toThrow("PRODUCTION_DATABASE_URL_LOCAL")
    }

    for (const readonlyUrl of [
      "postgresql:///ewatrade",
      "postgresql://readonly-inventory@readonly.example.com:5432/ewatrade",
      "postgresql://readonly-inventory:password@readonly.example.com:5432/ewatrade?host=attacker.example.com",
      "postgresql://readonly-inventory:password@readonly.example.com:5432/ewatrade?user=app-writer",
      "postgresql://readonly-inventory:password@readonly.example.com:5432/ewatrade",
      "postgresql://readonly-inventory:password@readonly.example.com:5432/ewatrade?sslmode=require",
      "https://readonly.example.com/ewatrade",
      "not a database url",
    ]) {
      expect(() =>
        assertServiceCommerceProductionDriftInventoryEnvironment({
          ...productionEnvironment,
          PRODUCTION_READONLY_DATABASE_URL: readonlyUrl,
        }),
      ).toThrow()
    }

    expect(() =>
      assertServiceCommerceProductionDriftInventoryEnvironment({
        ...productionEnvironment,
        PRODUCTION_READONLY_DATABASE_URL:
          "postgresql://app-writer:distinct-password@readonly.example.com:5432/ewatrade?sslmode=verify-full",
        SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_TARGET_FINGERPRINT:
          "postgresql://readonly.example.com:5432/ewatrade#identity=ae789f76",
      }),
    ).toThrow("PRODUCTION_DRIFT_INVENTORY_REQUIRES_READONLY_ROLE")
  })
})

describe("Service Commerce production drift inventory", () => {
  test("collects deterministic redacted observed-only evidence", async () => {
    const { calls, client } = inventoryClient()
    const result = await collectServiceCommerceProductionDriftInventory(
      client,
      { expectedMigrationNames },
    )

    expect(result).toMatchObject({
      criticalCensus: {
        commercialOrder: {
          availability: "AVAILABLE",
          completedCount: 0,
          totalCount: 7,
        },
        commerceQuoteGraph: { availability: "UNAVAILABLE" },
        serviceQuoteGraph: { availability: "UNAVAILABLE" },
      },
      migrations: {
        expected: { finishedCount: 3, pendingCount: 3, totalCount: 6 },
        unknown: { finishedCount: 1, pendingCount: 0, totalCount: 1 },
      },
      observedOnly: true,
      transaction: {
        leastPrivilegeVerified: true,
        readOnlyVerified: true,
        rolledBack: true,
      },
      truncation: { migrationLedger: false, schemaMetadata: false },
    })
    expect(result.migrations.rows).toContainEqual({
      appliedStepsCount: 0,
      errorCode: "42P01",
      name: "20260711120000_retail_ops_stock_ledger_foundation",
      state: "UNFINISHED",
    })
    expect(result.migrations.rows).toHaveLength(expectedMigrationNames.length)
    expect(result.schema.tables.map((table) => table.name)).toEqual(
      expect.arrayContaining([
        "_prisma_migrations",
        "CommerceQuote",
        "CommerceQuoteLine",
        "CommerceQuoteOption",
        "CommerceQuoteVersion",
        "CommercialOrder",
        "CommercialOrderLine",
        "CommercialOrderPayment",
      ]),
    )
    expect(calls.at(-1)).toEqual({ kind: "execute", sql: "ROLLBACK" })
    const indexSql = calls.find((call) =>
      call.sql.includes("inventory_indexes"),
    )?.sql
    expect(indexSql).toBeDefined()
    expect(
      indexSql?.match(/GROUP BY[\s\S]*index_meta\.(?:indexprs|indpred)/),
    ).toBeNull()

    const serialized = JSON.stringify(result)
    for (const forbiddenValue of [
      "manual_unreviewed_migration",
      "never-return-this-password",
      "P3018",
      "logs",
      "column_default",
      "indexdef",
      "constraintdef",
      "application-password",
    ]) {
      expect(serialized).not.toContain(forbiddenValue)
    }
  })

  test("derives only caller-known migration rows and aggregate unknown counts", async () => {
    const result = await collectServiceCommerceProductionDriftInventory(
      inventoryClient().client,
      { expectedMigrationNames: ["0001_init"] },
    )
    expect(result.migrations.expected).toEqual({
      finishedCount: 1,
      pendingCount: 0,
      totalCount: 1,
    })
    expect(result.migrations.unknown).toEqual({
      finishedCount: 3,
      pendingCount: 1,
      totalCount: 4,
    })
    expect(result.migrations.rows).toHaveLength(1)
  })

  test("returns unavailable rather than invented zeroes for absent graphs", async () => {
    const { calls, client } = inventoryClient()
    const result = await collectServiceCommerceProductionDriftInventory(
      client,
      { expectedMigrationNames },
    )
    expect(result.criticalCensus.serviceQuoteGraph).toEqual({
      availability: "UNAVAILABLE",
    })
    expect(result.criticalCensus.commerceQuoteGraph).toEqual({
      availability: "UNAVAILABLE",
    })
    expect(
      calls.some(
        (call) =>
          call.sql.includes("COUNT") &&
          call.sql.includes('FROM "ServiceQuote"'),
      ),
    ).toBe(false)
  })

  test("rolls back if a query fails", async () => {
    const { calls, client } = inventoryClient({ failQuery: true })
    await expect(
      collectServiceCommerceProductionDriftInventory(client, {
        expectedMigrationNames,
      }),
    ).rejects.toThrow("read failed")
    expect(calls.at(-1)).toEqual({ kind: "execute", sql: "ROLLBACK" })
  })

  test("fails closed for elevated or globally writable roles", async () => {
    for (const options of [
      { elevatedRole: true },
      { globalWriterPrivilege: true },
      { ownsObject: true },
      { securityDefinerExecutor: true },
      { sequenceWriterPrivilege: true },
    ]) {
      const { calls, client } = inventoryClient(options)
      await expect(
        collectServiceCommerceProductionDriftInventory(client, {
          expectedMigrationNames,
        }),
      ).rejects.toThrow("PRODUCTION_DRIFT_INVENTORY_ROLE_NOT_READONLY")
      expect(calls.at(-1)).toEqual({ kind: "execute", sql: "ROLLBACK" })
    }
  })

  test("allowlists migration SQLSTATE", async () => {
    const result = await collectServiceCommerceProductionDriftInventory(
      inventoryClient({ errorCode: "23505" }).client,
      { expectedMigrationNames },
    )
    expect(
      result.migrations.rows.find(
        (row) =>
          row.name === "20260711120000_retail_ops_stock_ledger_foundation",
      )?.errorCode,
    ).toBeNull()
  })

  test("fails closed on migration or metadata truncation", async () => {
    for (const [options, code] of [
      [
        { ledgerOverflow: true },
        "PRODUCTION_DRIFT_INVENTORY_MIGRATION_LEDGER_TRUNCATED",
      ],
      [
        { metadataOverflow: true },
        "PRODUCTION_DRIFT_INVENTORY_SCHEMA_METADATA_TRUNCATED",
      ],
    ] as const) {
      const { calls, client } = inventoryClient(options)
      await expect(
        collectServiceCommerceProductionDriftInventory(client, {
          expectedMigrationNames,
        }),
      ).rejects.toThrow(code)
      expect(calls.at(-1)).toEqual({ kind: "execute", sql: "ROLLBACK" })
    }
  })
})
