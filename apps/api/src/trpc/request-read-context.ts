import { traceSynchronousPhase } from "@ewatrade/db/performance-tracing"
import type { TenantContext } from "@ewatrade/db/queries"

type TenantInput = {
  userId: string
  tenantSlug?: string | null
  storeId?: string | null
}

/** Lifetime is one HTTP GET, never a shared authorization cache. */
export function createRequestReadContext(method: string) {
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
        value = Promise.resolve().then(read)
        values.set(userId, value)
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
        value = Promise.resolve().then(read)
        values.set(key, value)
      } else {
        traceSynchronousPhase("scopeReuse", () => undefined)
      }
      // Each procedure owns its copy; one reader cannot change another's facts.
      return value.then((tenant) => (tenant ? structuredClone(tenant) : null))
    },
  }
}
