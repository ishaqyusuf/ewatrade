import type { Prisma, PrismaClient } from "../../generated/prisma/client"

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

/** The arguments after the client, for a wrapper that forwards them. */
export type ArgsAfterClient<F> = F extends (
  client: never,
  ...rest: infer R
) => unknown
  ? R
  : never
