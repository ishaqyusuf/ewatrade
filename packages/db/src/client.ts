import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../generated/prisma/client"
import { createInstrumentedDatabasePool } from "./performance-tracing"

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

// Short pauses between Dashboard interactions should reuse an existing socket.
// Keep the default max/min; idle connections still expire without keepalive SQL.
const poolOptions = { connectionString: databaseUrl, idleTimeoutMillis: 30_000 }

export const prisma =
  cached ??
  new PrismaClient({
    adapter:
      process.env.PERFORMANCE_TRACE === "true"
        ? new PrismaPg(createInstrumentedDatabasePool(poolOptions), {
            disposeExternalPool: true,
          })
        : new PrismaPg(poolOptions),
    transactionOptions: {
      maxWait: 10_000,
      timeout: 30_000,
    },
  })

if (process.env.NODE_ENV !== "production") {
  globalThis.__ewatradePrisma__ = prisma
}
