import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"

declare const fenceBrand: unique symbol
export type OfflineCommandFence = { readonly [fenceBrand]: true }

type HeldFence = {
  tx: Prisma.TransactionClient
  tenantId: string
  identities: ReadonlySet<string>
}

const issued = new WeakMap<object, HeldFence>()
const acquired = new WeakMap<
  object,
  {
    tenantId: string
    identities: ReadonlySet<string>
    ready: Promise<OfflineCommandFence>
  }
>()

function refuse() {
  return new CatalogError(
    "INVALID_STOCK_OPERATION",
    "Offline command coordination does not match this transaction and identity.",
  )
}

// A separate namespace avoids deterministic collisions with device locks. Sort
// the actual signed PostgreSQL lock values, including any hash collisions,
// rather than sorting the unhashed command identities.
function lockValue(tenantId: string, clientCommandId: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "ewatrade:offline-command:v1",
        tenantId,
        clientCommandId,
      ]),
    )
    .digest()
    .readBigInt64BE(0)
}

/**
 * Coordination only. Acquire the COMPLETE identity set before domain locks.
 * Callers retain actor, device, policy, command and financial authorization.
 * An already coordinated transaction may reuse a subset, never add identities.
 */
export async function acquireOfflineCommandFences(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; clientCommandIds: readonly string[] },
): Promise<OfflineCommandFence> {
  const tenantId = input.tenantId
  if (
    !tenantId ||
    input.clientCommandIds.length < 1 ||
    input.clientCommandIds.length > 500 ||
    input.clientCommandIds.some((id) => !id || id.length > 160)
  )
    throw refuse()

  const prior = acquired.get(tx)
  if (prior) {
    if (
      prior.tenantId !== tenantId ||
      input.clientCommandIds.some((id) => !prior.identities.has(id))
    )
      throw refuse()
    return prior.ready
  }

  const identities = new Set(input.clientCommandIds)
  const values = [
    ...new Set([...identities].map((id) => lockValue(tenantId, id))),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  // Reserve the complete set before the first await, including simultaneous
  // calls on one transaction. Subset callers wait for every lock to be held.
  const ready = Promise.resolve().then(async () => {
    for (const value of values)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${value}::bigint)`
    const fence = Object.freeze({}) as OfflineCommandFence
    issued.set(fence, { tx, tenantId, identities })
    return fence
  })
  acquired.set(tx, { tenantId, identities, ready })
  return ready
}

/** A structural lookalike, another transaction or another identity is inert. */
export function assertOfflineCommandFence(
  tx: Prisma.TransactionClient,
  fence: OfflineCommandFence,
  input: { tenantId: string; clientCommandId: string },
) {
  const held = issued.get(fence)
  if (
    !held ||
    held.tx !== tx ||
    held.tenantId !== input.tenantId ||
    !held.identities.has(input.clientCommandId)
  )
    throw refuse()
}
