import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "./generated/prisma/client"

declare global {
  // eslint-disable-next-line no-var
  var __ewatradePrisma__: PrismaClient | undefined
}

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set before creating the Prisma client.")
}

export const prisma =
  globalThis.__ewatradePrisma__ ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl
    })
  })

if (process.env.NODE_ENV !== "production") {
  globalThis.__ewatradePrisma__ = prisma
}
