import { Prisma, type PrismaClient } from "../../generated/prisma/client"

/** Bounded for remote Neon latency; see the coding standards. */
const OWN_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const

/**
 * Runs `run` in a new interactive transaction on the root client.
 *
 * Never choose between "open a transaction" and "already in one" with
 * `"$transaction" in db`: Prisma's transaction client has `$transaction` too,
 * so that check starts a nested transaction (P2028), and Prisma 7.6 then
 * writes the outer transaction's id into the options object it was given, so
 * every later transaction reusing that object fails as well. Callers already
 * in a transaction call the function's `…InTransaction` form instead, and
 * every call here gets a fresh options object.
 */
export function runInOwnTransaction<T>(
  db: PrismaClient,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(run, { ...OWN_TRANSACTION_OPTIONS })
}

export function isOwnSerializationConflict(error: unknown) {
  const property = (value: unknown, key: string) =>
    typeof value === "object" && value !== null
      ? Reflect.get(value, key)
      : undefined
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    // The adapter may reject commit directly, after Prisma's callback has finished.
    return (
      error instanceof Error &&
      error.name === "DriverAdapterError" &&
      property(error.cause, "kind") === "TransactionWriteConflict" &&
      property(error.cause, "originalCode") === "40001"
    )
  }
  if (error.code === "P2034") return true
  if (error.code !== "P2010") return false
  return (
    property(error.meta, "code") === "40001" ||
    property(
      property(property(error.meta, "driverAdapterError"), "cause"),
      "kind",
    ) === "TransactionWriteConflict" ||
    error.message.includes("Code: `40001`")
  )
}

/** Only rolled-back serialization conflicts are retried, with fresh authority reads. */
export async function runInOwnSerializableTransaction<T>(
  db: PrismaClient,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(run, {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 30_000,
      })
    } catch (error) {
      if (!isOwnSerializationConflict(error) || attempt >= 2) throw error
    }
  }
}

/** The arguments after the client, for a wrapper that forwards them. */
export type ArgsAfterClient<F> = F extends (
  client: never,
  ...rest: infer R
) => unknown
  ? R
  : never
