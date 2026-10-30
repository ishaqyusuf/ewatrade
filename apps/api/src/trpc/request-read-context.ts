import { traceSynchronousPhase } from "@ewatrade/db/performance-tracing"
import type { TenantContext } from "@ewatrade/db/queries"

type TenantInput = {
  userId: string
  tenantSlug?: string | null
  storeId?: string | null
}

/** Lifetime is one HTTP GET, never a shared authorization cache. */
export function createRequestReadContext(
  method: string,
  initialEligibility?: {
    db: object
    userId: string
    read: () => Promise<void>
  },
  initialTenant?: {
    db: object
    input: TenantInput
    read: () => Promise<TenantContext | null>
  },
) {
  if (method !== "GET") return undefined
  const eligibility = new WeakMap<object, Map<string, Promise<void>>>()
  const tenants = new WeakMap<
    object,
    Map<string, Promise<TenantContext | null>>
  >()
  return {
    eligibility(db: object, userId: string, read: () => Promise<void>) {
      let values = eligibility.get(db)
      if (!values) {
        values = new Map()
        eligibility.set(db, values)
      }
      let value = values.get(userId)
      if (!value) {
        const initial =
          initialEligibility?.db === db && initialEligibility.userId === userId
            ? initialEligibility.read
            : undefined
        // Evaluate only when a protected query asks. Account recovery/public
        // calls must not start enforcing an unrelated age gate in context.
        value = Promise.resolve().then(initial ?? read)
        values.set(userId, value)
        if (initial) traceSynchronousPhase("legalReuse", () => undefined)
      } else {
        traceSynchronousPhase("legalReuse", () => undefined)
      }
      return value
    },
    tenant(
      db: object,
      input: TenantInput,
      read: () => Promise<TenantContext | null>,
    ) {
      let values = tenants.get(db)
      if (!values) {
        values = new Map()
        tenants.set(db, values)
      }
      const key = JSON.stringify([
        input.userId,
        input.tenantSlug ?? null,
        input.storeId ?? null,
      ])
      let value = values.get(key)
      if (!value) {
        const initial =
          initialTenant?.db === db &&
          key ===
            JSON.stringify([
              initialTenant.input.userId,
              initialTenant.input.tenantSlug ?? null,
              initialTenant.input.storeId ?? null,
            ])
            ? initialTenant.read
            : undefined
        value = Promise.resolve().then(initial ?? read)
        values.set(key, value)
        if (initial) traceSynchronousPhase("scopeReuse", () => undefined)
      } else {
        traceSynchronousPhase("scopeReuse", () => undefined)
      }
      // Each procedure owns its copy; one reader cannot change another's facts.
      return value.then((tenant) => (tenant ? structuredClone(tenant) : null))
    },
  }
}
