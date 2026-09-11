import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../generated/prisma/client"

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

export const prisma =
  globalThis.__ewatradePrisma__ ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
    }),
    transactionOptions: {
      maxWait: 10_000,
      timeout: 30_000,
    },
  })

if (process.env.NODE_ENV !== "production") {
  globalThis.__ewatradePrisma__ = prisma
}
