#!/usr/bin/env bun

import { readdirSync } from "node:fs"

import pg from "pg"

import {
  assertServiceCommerceProductionDriftInventoryEnvironment,
  collectServiceCommerceProductionDriftInventory,
} from "../src/migrations/service-commerce-production-drift-inventory"

type PgClientLike = {
  connect(): Promise<unknown>
  end(): Promise<unknown>
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }>
}

type RunInput = {
  argv: readonly string[]
  createClient(connectionString: string): PgClientLike
  environment: Readonly<Record<string, string | undefined>>
  expectedMigrationNames: readonly string[]
}

export function serviceCommerceProductionDriftInventoryPgConfig(
  connectionString: string,
) {
  return { connectionString, enableChannelBinding: true as const }
}

export async function runServiceCommerceProductionDriftInventory(
  input: RunInput,
) {
  if (input.argv.length > 0) {
    throw new Error("PRODUCTION_DRIFT_INVENTORY_ARGUMENTS_FORBIDDEN")
  }

  const target = assertServiceCommerceProductionDriftInventoryEnvironment(
    input.environment,
  )
  const client = input.createClient(target.readonlyDatabaseUrl)

  try {
    await client.connect()
    const inventory = await collectServiceCommerceProductionDriftInventory(
      {
        execute: async (sql) => {
          await client.query(sql)
        },
        query: async <T>(sql: string, params?: readonly unknown[]) =>
          (await client.query(sql, params)).rows as T,
      },
      { expectedMigrationNames: input.expectedMigrationNames },
    )

    return {
      formatVersion: 1 as const,
      inventory,
      targetFingerprint: target.fingerprint,
      writesAuthorized: false as const,
    }
  } catch {
    throw new Error("PRODUCTION_DRIFT_INVENTORY_READ_FAILED")
  } finally {
    await client.end().catch(() => undefined)
  }
}

function expectedMigrationNames() {
  return readdirSync(new URL("../prisma/migrations", import.meta.url), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function safeReasonCode(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return /^PRODUCTION_DRIFT_INVENTORY_[A-Z_]+$/.test(message)
    ? message
    : "PRODUCTION_DRIFT_INVENTORY_BLOCKED"
}

if (import.meta.main) {
  try {
    const result = await runServiceCommerceProductionDriftInventory({
      argv: Bun.argv.slice(2),
      createClient: (connectionString) => {
        const client = new pg.Client(
          serviceCommerceProductionDriftInventoryPgConfig(connectionString),
        )
        return {
          connect: () => client.connect(),
          end: () => client.end(),
          query: (sql, params) =>
            client.query(sql, params ? [...params] : undefined),
        }
      },
      environment: Bun.env,
      expectedMigrationNames: expectedMigrationNames(),
    })
    console.log(JSON.stringify(result))
  } catch (error) {
    console.error(
      JSON.stringify({ reasonCode: safeReasonCode(error), status: "BLOCKED" }),
    )
    process.exit(1)
  }
}
