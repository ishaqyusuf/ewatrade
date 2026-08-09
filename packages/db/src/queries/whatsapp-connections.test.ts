import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  consumePrescriptionQuickAction,
  getWhatsAppEmbeddedSignupSession,
  recordWhatsAppCommunicationStatus,
  resolveWhatsAppInboundConnection,
  resolveWhatsAppStatusConnection,
  setWhatsAppConnectionLifecycle,
} from "./whatsapp-connections"

describe("WhatsApp Embedded Signup session", () => {
  test("requires one unconsumed, unexpired, user-and-Store-scoped capability", async () => {
    const queries: unknown[] = []
    const db = {
      whatsAppEmbeddedSignupSession: {
        findFirst: async (query: unknown) => {
          queries.push(query)
          return {
            discoveredNumbers: [
              {
                businessDisplayName: "Pharmacy One",
                displayNumber: "+2348000000000",
                phoneNumberId: "phone-1",
                wabaId: "waba-1",
              },
            ],
            expiresAt: new Date("2026-08-09T12:00:00.000Z"),
          }
        },
      },
    } as unknown as PrismaClient

    await expect(
      getWhatsAppEmbeddedSignupSession(db, {
        publicToken: "signup-token",
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "owner-1",
      }),
    ).resolves.toMatchObject({
      numbers: [{ phoneNumberId: "phone-1", wabaId: "waba-1" }],
    })
    expect(queries[0]).toMatchObject({
      where: {
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
        publicTokenDigest: expect.any(String),
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "owner-1",
      },
    })
    expect(JSON.stringify(queries[0])).not.toContain("signup-token")
  })
})

describe("WhatsApp inbound connection routing", () => {
  test("returns every active same-Tenant branch and requires explicit Store selection", async () => {
    const db = {
      whatsAppConnection: {
        findFirst: async () => ({
          bindings: [
            {
              store: {
                name: "Central Pharmacy",
                prescriptionSettings: { status: "ACTIVE" },
                tenantId: "tenant-1",
              },
              storeId: "store-1",
              tenantId: "tenant-1",
            },
            {
              store: {
                name: "Airport Branch",
                prescriptionSettings: { status: "ACTIVE" },
                tenantId: "tenant-1",
              },
              storeId: "store-2",
              tenantId: "tenant-1",
            },
          ],
          credentialReference: "credential-1",
          id: "connection-1",
          phoneNumberId: "phone-1",
          tenantId: "tenant-1",
        }),
      },
    } as unknown as PrismaClient

    await expect(
      resolveWhatsAppInboundConnection(db, { phoneNumberId: "phone-1" }),
    ).resolves.toMatchObject({
      bindings: [
        { storeId: "store-1", tenantId: "tenant-1" },
        { storeId: "store-2", tenantId: "tenant-1" },
      ],
      connectionId: "connection-1",
      phoneNumberId: "phone-1",
      requiresStoreSelection: true,
      tenantId: "tenant-1",
    })
  })

  test("fails the whole route when any active binding crosses the connection Tenant", async () => {
    const db = {
      whatsAppConnection: {
        findFirst: async () => ({
          bindings: [
            {
              store: {
                name: "Central Pharmacy",
                prescriptionSettings: { status: "ACTIVE" },
                tenantId: "tenant-1",
              },
              storeId: "store-1",
              tenantId: "tenant-1",
            },
            {
              store: {
                name: "Other Pharmacy",
                prescriptionSettings: { status: "ACTIVE" },
                tenantId: "tenant-2",
              },
              storeId: "store-2",
              tenantId: "tenant-2",
            },
          ],
          credentialReference: "credential-1",
          id: "connection-1",
          phoneNumberId: "phone-1",
          tenantId: "tenant-1",
        }),
      },
    } as unknown as PrismaClient

    await expect(
      resolveWhatsAppInboundConnection(db, { phoneNumberId: "phone-1" }),
    ).rejects.toMatchObject({ code: "CONNECTION_NOT_FOUND" })
  })
})

describe("WhatsApp communication receipts", () => {
  test("records a read timestamp without crossing the connection/tenant scope", async () => {
    const updates: unknown[] = []
    const transaction = {
      $queryRaw: async () => [{ id: "attempt-1" }],
      prescriptionCommunicationAttempt: {
        findFirst: async (input: unknown) => {
          expect(input).toMatchObject({
            where: {
              connectionId: "connection-1",
              intent: { tenantId: "tenant-1" },
              providerMessageId: "wamid.1",
            },
          })
          return { id: "attempt-1" }
        },
        findUnique: async () => ({
          deliveredAt: null,
          id: "attempt-1",
          readAt: null,
          status: "SENT",
        }),
        update: async (input: unknown) => {
          updates.push(input)
          return input
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient
    const occurredAt = new Date("2026-08-09T12:00:00.000Z")

    await recordWhatsAppCommunicationStatus(db, {
      connectionId: "connection-1",
      occurredAt,
      providerMessageId: "wamid.1",
      status: "read",
      tenantId: "tenant-1",
    })

    expect(updates[0]).toMatchObject({
      data: {
        deliveredAt: occurredAt,
        failureCode: null,
        readAt: occurredAt,
        status: "READ",
      },
      where: { id: "attempt-1" },
    })
  })

  test("does not regress a read receipt or overwrite its original timestamp", async () => {
    const updates: unknown[] = []
    const readAt = new Date("2026-08-09T12:00:00.000Z")
    const transaction = {
      $queryRaw: async () => [{ id: "attempt-1" }],
      prescriptionCommunicationAttempt: {
        findFirst: async () => ({ id: "attempt-1" }),
        findUnique: async () => ({
          deliveredAt: readAt,
          id: "attempt-1",
          readAt,
          status: "READ",
        }),
        update: async (input: unknown) => {
          updates.push(input)
          return input
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    const result = await recordWhatsAppCommunicationStatus(db, {
      connectionId: "connection-1",
      occurredAt: new Date("2026-08-09T12:01:00.000Z"),
      providerMessageId: "wamid.1",
      status: "delivered",
      tenantId: "tenant-1",
    })

    expect(result).toMatchObject({ readAt, status: "READ" })
    expect(updates).toHaveLength(0)
  })

  test("resolves late receipts by immutable attempt identity, not active binding state", async () => {
    const db = {
      prescriptionCommunicationAttempt: {
        findFirst: async (input: unknown) => {
          expect(input).toMatchObject({
            where: {
              connection: { phoneNumberId: "phone-1" },
              providerMessageId: "wamid.late",
            },
          })
          return {
            connectionId: "suspended-connection",
            intent: { tenantId: "tenant-1" },
          }
        },
      },
    } as unknown as PrismaClient

    expect(
      await resolveWhatsAppStatusConnection(db, {
        phoneNumberId: "phone-1",
        providerMessageId: "wamid.late",
      }),
    ).toEqual({ connectionId: "suspended-connection", tenantId: "tenant-1" })
  })
})

describe("WhatsApp failure controls", () => {
  test("rejects a stale or already consumed quick action", async () => {
    const transaction = {
      prescriptionQuickAction: {
        findFirst: async () => null,
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      consumePrescriptionQuickAction(db, {
        actionId: "rx:expired-capability",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "QUICK_ACTION_INVALID" })
  })

  test("revokes a credential by suspending only its Tenant bindings", async () => {
    const bindingUpdates: unknown[] = []
    const transaction = {
      whatsAppConnection: {
        update: async () => ({ id: "connection-1", status: "REVOKED" }),
      },
      whatsAppConnectionAuditEvent: {
        create: async (input: unknown) => input,
      },
      whatsAppStoreBinding: {
        updateMany: async (input: unknown) => {
          bindingUpdates.push(input)
          return { count: 2 }
        },
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await setWhatsAppConnectionLifecycle(db, {
      actorUserId: "user-1",
      connectionId: "connection-1",
      status: "revoked",
      tenantId: "tenant-1",
    })

    expect(bindingUpdates).toEqual([
      {
        data: { status: "SUSPENDED" },
        where: { connectionId: "connection-1", tenantId: "tenant-1" },
      },
    ])
  })
})
