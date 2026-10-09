import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma/client"
export function createOversightReadClient() {
  const connectionString = process.env.EWATRADE_DATABASE_URL
  if (!connectionString)
    throw new Error("Read database connection is not configured")
  const url = new URL(connectionString)
  const existing = url.searchParams.get("options") ?? ""
  url.searchParams.set(
    "options",
    `${existing} -c default_transaction_read_only=on -c statement_timeout=15000`.trim(),
  )
  url.searchParams.set("sslmode", "verify-full")
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url.toString(),
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    }),
    transactionOptions: { maxWait: 10000, timeout: 15000 },
  })
}
