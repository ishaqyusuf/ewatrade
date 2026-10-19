import type { TenantContext } from "@/lib/tenant"

/** Catalog reads and catalog management are independent permissions. */
export function catalogDetailAffordances(input: {
  readOnly: boolean
  inventoryAllowed: boolean
  canManageUsage: boolean
}) {
  return {
    privatePhotos: !input.readOnly,
    configureUnits: !input.readOnly && input.inventoryAllowed,
    manageUsage: !input.readOnly && input.canManageUsage,
  }
}

export type CatalogDetailReadScope = { key: string; generation: number }

/** Keep canonical invalidation prefixes while isolating reader/role-specific cached data. */
export function catalogDetailQueryKey(
  base: readonly unknown[],
  scope: CatalogDetailReadScope,
) {
  return [...base, "catalog-read-scope", scope.key]
}

export function catalogDetailReadScope(input: {
  actorUserId: string
  tenantId: string
  storeId: string
  readOnly: boolean
  accessKey: string
  generation: number
  visit: string
}): CatalogDetailReadScope {
  return {
    key: JSON.stringify([
      input.actorUserId,
      input.tenantId,
      input.storeId,
      input.readOnly,
      input.accessKey,
      input.generation,
      input.visit,
    ]),
    generation: input.generation,
  }
}

/** Retained Owner data is never a fallback while the current reader is being checked. */
export function catalogDetailReadIsFresh(
  query: {
    isSuccess: boolean
    isError: boolean
    isFetching: boolean
    isPaused: boolean
    isFetchedAfterMount: boolean
  },
  scope: CatalogDetailReadScope,
  currentGeneration: number,
) {
  return (
    query.isSuccess &&
    !query.isError &&
    !query.isFetching &&
    !query.isPaused &&
    query.isFetchedAfterMount &&
    scope.generation === currentGeneration
  )
}

/** Cache identity only; authorization remains in the fresh canonical RPC. */
export function catalogDetailAccessFingerprint(input: {
  membership: TenantContext["membership"]
  staffAccess?: TenantContext["staffAccess"]
  storeId: string
}) {
  const { membership, staffAccess, storeId } = input
  return JSON.stringify([
    membership.role,
    membership.staffAccessMode ?? null,
    membership.catalogEditor ?? null,
    staffAccess?.businessRole ?? null,
    staffAccess?.status ?? null,
    staffAccess?.mode ?? null,
    staffAccess?.catalogEditor ?? null,
    storeId,
    (staffAccess?.assignments ?? [])
      .map((assignment) => [
        assignment.storeId,
        assignment.role,
        assignment.status,
      ])
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
  ])
}
