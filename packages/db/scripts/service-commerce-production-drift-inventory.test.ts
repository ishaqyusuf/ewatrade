import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

import {
  runServiceCommerceProductionDriftInventory,
  serviceCommerceProductionDriftInventoryPgConfig,
} from "./service-commerce-production-drift-inventory"

const environment = {
  APP_ENV: "production",
  DATABASE_PROFILE_VERIFIED: "1",
  EWATRADE_DATABASE_URL:
    "postgresql://app-writer:application-password@database.example.com:5432/ewatrade",
  DEV_PROFILE: "prod",
  PRODUCTION_READONLY_DATABASE_URL:
    "postgresql://readonly-inventory:never-return-this-password@database.example.com:5432/ewatrade?sslmode=verify-full",
  SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_AUTHORIZED: "1",
  SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_TARGET_FINGERPRINT:
    "postgresql://database.example.com:5432/ewatrade#identity=e41be799",
}

function fakePostgres(options?: { fail?: boolean }) {
  const facts = { connectionString: "", connected: 0, ended: 0 }
  const client = {
    connect: async () => {
      facts.connected += 1
    },
    end: async () => {
      facts.ended += 1
    },
    query: async (sql: string) => {
      if (options?.fail) throw new Error("raw database failure")
      if (sql.includes("SHOW transaction_read_only")) {
        return { rows: [{ transaction_read_only: "on" }] }
      }
      if (sql.includes("has_schema_privilege")) {
        return {
          rows: [
            {
              all_present_tables_selectable: true,
              any_database_create_or_temp_privilege: false,
              any_non_system_schema_create_privilege: false,
              any_non_system_sequence_write_privilege: false,
              any_non_system_table_write_privilege: false,
              any_security_definer_execute_privilege: false,
              elevated_role: false,
              owns_non_system_object: false,
            },
          ],
        }
      }
      if (sql.includes("_prisma_migrations")) return { rows: [] }
      return { rows: [] }
    },
  }

  return {
    createClient: (connectionString: string) => {
      facts.connectionString = connectionString
      return client
    },
    facts,
  }
}

describe("Service Commerce production drift inventory CLI", () => {
  test("enables node-postgres channel binding for the validated read-only URL", () => {
    expect(
      serviceCommerceProductionDriftInventoryPgConfig(
        environment.PRODUCTION_READONLY_DATABASE_URL,
      ),
    ).toEqual({
      connectionString: environment.PRODUCTION_READONLY_DATABASE_URL,
      enableChannelBinding: true,
    })
  })

  test("is exposed only through the root production-profile wrapper", () => {
    const rootPackage = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> }
    const databasePackage = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> }

    expect(rootPackage.scripts["db:drift-inventory"]).toContain(
      "scripts/with-workspace-env.mjs",
    )
    expect(rootPackage.scripts["db:drift-inventory"]).toContain(
      "REQUIRE_PROD_DATABASE_URL=1",
    )
    expect(databasePackage.scripts["audit:production-drift"]).toBeUndefined()
  })

  test("rejects every CLI argument instead of accepting URLs, SQL, or identifiers", async () => {
    const postgres = fakePostgres()

    await expect(
      runServiceCommerceProductionDriftInventory({
        argv: ["--table", "Customer"],
        createClient: postgres.createClient,
        environment,
        expectedMigrationNames: ["0001_init"],
      }),
    ).rejects.toThrow("PRODUCTION_DRIFT_INVENTORY_ARGUMENTS_FORBIDDEN")
    expect(postgres.facts.connected).toBe(0)
  })

  test("uses only the dedicated read-only credential and returns redacted observed evidence", async () => {
    const postgres = fakePostgres()
    const result = await runServiceCommerceProductionDriftInventory({
      argv: [],
      createClient: postgres.createClient,
      environment,
      expectedMigrationNames: ["0001_init"],
    })

    expect(postgres.facts).toEqual({
      connected: 1,
      connectionString: environment.PRODUCTION_READONLY_DATABASE_URL,
      ended: 1,
    })
    expect(result).toMatchObject({
      formatVersion: 1,
      inventory: { observedOnly: true },
      targetFingerprint:
        environment.SERVICE_COMMERCE_PRODUCTION_DRIFT_INVENTORY_TARGET_FINGERPRINT,
      writesAuthorized: false,
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("never-return-this-password")
    expect(serialized).not.toContain("application-password")
    expect(serialized).not.toContain("EWATRADE_DATABASE_URL")
  })

  test("closes the read-only connection and exposes no raw database error", async () => {
    const postgres = fakePostgres({ fail: true })

    await expect(
      runServiceCommerceProductionDriftInventory({
        argv: [],
        createClient: postgres.createClient,
        environment,
        expectedMigrationNames: ["0001_init"],
      }),
    ).rejects.toThrow("PRODUCTION_DRIFT_INVENTORY_READ_FAILED")
    expect(postgres.facts.ended).toBe(1)
  })
})
