import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  recordWhatsAppCommunicationStatus,
  resolveWhatsAppStatusConnection,
} from "./whatsapp-connections"

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
