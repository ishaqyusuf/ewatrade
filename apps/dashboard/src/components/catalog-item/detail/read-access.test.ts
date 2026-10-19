import { expect, test } from "bun:test"
import type { AppRouter } from "@ewatrade/api/trpc/routers/_app"
import { readRecordAppLink } from "@ewatrade/assistant/channels/read-record-links"
import { canStaffPerform } from "@ewatrade/auth/store-access"
import { QueryClient } from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import { createLoader } from "nuqs/server"
import { catalogDetailScope } from "../../../../../api/src/catalog/detail-access"
import { catalogDetailParamParsers } from "../../../hooks/use-catalog-detail-params"
import { canAccessDashboardPath } from "../../../lib/navigation"
import {
  catalogDetailAccessFingerprint,
  catalogDetailAffordances,
  catalogDetailQueryKey,
  catalogDetailReadIsFresh,
  catalogDetailReadScope,
} from "./read-access"

const origin = { tenantId: "business", storeId: "store" }

test("an authorized restricted catalog reader reaches the actual accessible Sales detail consumer without catalog management", () => {
  const policy = catalogDetailScope(
    { itemId: "saved-item", storeId: origin.storeId },
    {
      tenant: { id: origin.tenantId },
      membership: { role: "CASHIER" },
      stores: [{ id: origin.storeId }],
      activeStore: { id: origin.storeId },
    },
  )
  expect(policy.inventory).toBe(false)
  const link = readRecordAppLink(
    { kind: "catalog_item", catalogItemId: "saved-item", origin },
    {
      trustedAppOrigin: "https://dashboard.example.test",
      currentScope: origin,
    },
  )
  if (!link) throw Error("Expected authorized exact catalog handoff")
  const url = new URL(link.href)
  expect(
    canAccessDashboardPath(url.pathname, "CASHIER", {
      staffAccessMode: "LEGACY",
    }),
  ).toBe(true)
  expect(
    canAccessDashboardPath("/catalog", "CASHIER", {
      staffAccessMode: "LEGACY",
    }),
  ).toBe(false)
  const consumed = createLoader(catalogDetailParamParsers)(url)
  expect(consumed.catalogDetail).toBe("saved-item")
  expect(consumed.catalogDetailTab).toBe("overview")
  expect(
    catalogDetailAffordances({
      readOnly: true,
      inventoryAllowed: true,
      canManageUsage: true,
    }),
  ).toEqual({
    privatePhotos: false,
    configureUnits: false,
    manageUsage: false,
  })
  expect(
    catalogDetailAffordances({
      readOnly: false,
      inventoryAllowed: true,
      canManageUsage: true,
    }),
  ).toEqual({
    privatePhotos: true,
    configureUnits: true,
    manageUsage: true,
  })
})

test("Owner cached facts cannot satisfy a new readonly reader while actual canonical invalidation still reaches isolated queries", async () => {
  const cache = new QueryClient()
  // Key construction only: no client request is made by these actual canonical tRPC helpers.
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: createTRPCClient<AppRouter>({ links: [] }),
    queryClient: cache,
  })
  const base = trpc.catalog.detail.overview.queryKey({
    itemId: "saved-item",
    storeId: origin.storeId,
  })
  const actor = {
    actorUserId: "actor",
    ...origin,
    readOnly: false,
    accessKey: "original-role-and-store-grants",
    generation: 1,
    visit: "visit",
  }
  const ownerScope = catalogDetailReadScope(actor)
  const ownerKey = catalogDetailQueryKey(base, ownerScope)
  cache.setQueryData(ownerKey, {
    inventoryAllowed: true,
    privateStock: "Owner-only cached stock",
  })
  for (const patch of [
    { readOnly: true },
    { accessKey: "narrowed-role-or-store-grants" },
    { actorUserId: "other-actor" },
    { tenantId: "other-business" },
    { storeId: "other-store" },
    { generation: 2 },
    { visit: "next-mount" },
  ]) {
    const reader = catalogDetailReadScope({ ...actor, ...patch })
    expect(
      cache.getQueryData(catalogDetailQueryKey(base, reader)),
    ).toBeUndefined()
  }
  const readonlyScope = catalogDetailReadScope({ ...actor, readOnly: true })
  const readonlyKey = catalogDetailQueryKey(base, readonlyScope)
  cache.setQueryData(readonlyKey, { inventoryAllowed: false })
  await cache.invalidateQueries(trpc.catalog.detail.overview.queryFilter())
  expect(cache.getQueryState(ownerKey)?.isInvalidated).toBe(true)
  expect(cache.getQueryState(readonlyKey)?.isInvalidated).toBe(true)
  const success = {
    isSuccess: true,
    isError: false,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
  }
  expect(catalogDetailReadIsFresh(success, readonlyScope, 1)).toBe(true)
  expect(catalogDetailReadIsFresh(success, readonlyScope, 2)).toBe(false)
  for (const patch of [
    { isError: true },
    { isFetching: true },
    { isPaused: true },
    { isFetchedAfterMount: false },
  ])
    expect(
      catalogDetailReadIsFresh({ ...success, ...patch }, readonlyScope, 1),
    ).toBe(false)
  cache.clear()
})

test("fresh Store role narrowing with unchanged catalog management cannot retain previous inventory facts", () => {
  const cache = new QueryClient()
  const original = {
    membership: {
      id: "membership",
      tenantId: origin.tenantId,
      role: "MANAGER",
      staffAccessMode: "SCOPED" as const,
      catalogEditor: true,
    },
    staffAccess: {
      businessRole: "MANAGER" as const,
      status: "ACTIVE",
      mode: "SCOPED" as const,
      catalogEditor: true,
      assignments: [
        { storeId: origin.storeId, role: "MANAGER" as const, status: "ACTIVE" },
        { storeId: "other-store", role: "MANAGER" as const, status: "ACTIVE" },
      ],
    },
    storeId: origin.storeId,
  }
  const narrowed = {
    ...original,
    membership: { ...original.membership, role: "CASHIER" },
    staffAccess: {
      ...original.staffAccess,
      assignments: [
        { storeId: origin.storeId, role: "CASHIER" as const, status: "ACTIVE" },
        { storeId: "other-store", role: "MANAGER" as const, status: "ACTIVE" },
      ],
    },
  }
  const before = catalogDetailScope(
    { itemId: "saved-item", storeId: origin.storeId },
    {
      ...original,
      tenant: { id: origin.tenantId },
      stores: [{ id: origin.storeId }],
      activeStore: { id: origin.storeId },
    },
  )
  const after = catalogDetailScope(
    { itemId: "saved-item", storeId: origin.storeId },
    {
      ...narrowed,
      tenant: { id: origin.tenantId },
      stores: [{ id: origin.storeId }],
      activeStore: { id: origin.storeId },
    },
  )
  expect(before.inventory).toBe(true)
  expect(after.inventory).toBe(false)
  // The other Store's manager grant retains catalog editing; readOnly therefore stays false.
  expect(canStaffPerform(narrowed.staffAccess, "catalog")).toBe(true)
  const actor = {
    actorUserId: "actor",
    ...origin,
    readOnly: false,
    generation: 1,
    visit: "same-open-modal",
  }
  const originalAccess = catalogDetailAccessFingerprint(original)
  const narrowedAccess = catalogDetailAccessFingerprint(narrowed)
  expect(narrowedAccess).not.toBe(originalAccess)
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: createTRPCClient<AppRouter>({ links: [] }),
    queryClient: cache,
  })
  const base = trpc.catalog.detail.overview.queryKey({
    itemId: "saved-item",
    storeId: origin.storeId,
  })
  cache.setQueryData(
    catalogDetailQueryKey(
      base,
      catalogDetailReadScope({ ...actor, accessKey: originalAccess }),
    ),
    { inventoryAllowed: true, privateStock: "original manager stock" },
  )
  expect(
    cache.getQueryData(
      catalogDetailQueryKey(
        base,
        catalogDetailReadScope({ ...actor, accessKey: narrowedAccess }),
      ),
    ),
  ).toBeUndefined()
  expect(
    catalogDetailAccessFingerprint({
      ...original,
      staffAccess: {
        ...original.staffAccess,
        assignments: [...original.staffAccess.assignments].reverse(),
      },
    }),
  ).toBe(originalAccess)
  cache.clear()
})
