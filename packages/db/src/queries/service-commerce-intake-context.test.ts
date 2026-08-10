import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  ServiceCommerceIntakeContextError,
  assertServiceCommerceIntakeContextInTransaction,
} from "./service-commerce-intake-context"

describe("Service Commerce intake write context", () => {
  test("fails a revoked entry revision closed inside the source transaction", async () => {
    const db = {
      customerEntryPoint: { findFirst: async () => null },
    } as unknown as PrismaClient
    await expect(
      assertServiceCommerceIntakeContextInTransaction(db, {
        context: {
          entryPointId: "entry_1",
          entryPointRevision: 2,
          kind: "entry_point",
        },
        storeId: "store_1",
        tenantId: "tenant_1",
        vertical: "service",
      }),
    ).rejects.toBeInstanceOf(ServiceCommerceIntakeContextError)
  })

  test("scopes a claimed provider event to Tenant, Store and vertical", async () => {
    let query: unknown
    const db = {
      whatsAppInboundEvent: {
        findFirst: async (input: unknown) => {
          query = input
          return { id: "event_1" }
        },
      },
    } as unknown as PrismaClient
    await assertServiceCommerceIntakeContextInTransaction(db, {
      context: {
        inboundEventId: "event_1",
        kind: "inbound_event",
        providerEventId: "wamid_1",
      },
      storeId: "store_1",
      tenantId: "tenant_1",
      vertical: "pharmacy",
    })
    expect(query).toMatchObject({
      where: {
        id: "event_1",
        providerEventId: "wamid_1",
        routeVertical: "PHARMACY",
        status: "PROCESSING",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    })
  })
})
