import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"

import { PrismaClient } from "../generated/prisma/client"
import { instrumentDatabasePool } from "./performance-tracing"

declare global {
  // eslint-disable-next-line no-var
  var __ewatradePrisma__: PrismaClient | undefined
}

const databaseUrl = process.env.EWATRADE_DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    "EWATRADE_DATABASE_URL must be set before creating the Prisma client.",
  )
}

// Development keeps one client across hot reloads. After `db:generate` the module is
// re-evaluated with a new PrismaClient class; a cached instance of the old class lacks
// newly generated models, so it is replaced rather than reused.
const cached =
  globalThis.__ewatradePrisma__ instanceof PrismaClient
    ? globalThis.__ewatradePrisma__
    : undefined

export const prisma =
  cached ??
  new PrismaClient({
    adapter:
      process.env.PERFORMANCE_TRACE === "true"
        ? new PrismaPg(
            instrumentDatabasePool(
              new pg.Pool({ connectionString: databaseUrl }),
            ),
            { disposeExternalPool: true },
          )
        : new PrismaPg({ connectionString: databaseUrl }),
    transactionOptions: {
      maxWait: 10_000,
      timeout: 30_000,
    },
  })

if (process.env.NODE_ENV !== "production") {
  globalThis.__ewatradePrisma__ = prisma
}
