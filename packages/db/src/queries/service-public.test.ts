import { describe, expect, test } from "bun:test"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { submitPublicServiceRequest } from "./service-public"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

describe("public Service Request intake", () => {
  test("rolls back a new Service Request when its conversation attachment fails", async () => {
    let persisted: { id: string } | null = null
    let pending: { id: string } | null = null
    const transaction = {
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      serviceRequest: {
        create: async () => {
          pending = { id: "service-request-1" }
          return { ...pending, revision: 1 }
        },
        findFirst: async () => null,
      },
      serviceRequestForm: {
        findFirst: async () => ({
          id: "form-1",
          offerings: [
            {
              offering: {
                id: "offering-1",
                name: "Cleaning",
                serviceOffering: { quantityScale: 0 },
                variant: { name: "Standard", selections: [] },
              },
              offeringId: "offering-1",
            },
          ],
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
      },
      serviceRequestLine: { create: async () => ({ id: "line-1" }) },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
    }
    const db = {
      $transaction: async (
        callback: (tx: typeof transaction) => Promise<unknown>,
      ) => {
        pending = null
        const result = await callback(transaction)
        persisted = pending
        return result
      },
    } as unknown as PrismaClient

    await expect(
      submitPublicServiceRequest(
        db,
        {
          clientRequestId: "service-request-attach-failure",
          customerName: "Ada",
          formToken: "public-form-token",
          lines: [{ offeringId: "offering-1", quantity: "1" }],
        },
        {
          onRequest: async (tx, request) => {
            expect(tx).toBe(transaction as never)
            expect(request.id).toBe("service-request-1")
            throw new Error("attachment failed")
          },
        },
      ),
    ).rejects.toThrow("attachment failed")
    expect(persisted).toBeNull()
  })

  test("recovers the concurrent first-create loser as an idempotent replay", async () => {
    let createAttempts = 0
    let persisted: Record<string, unknown> | null = null
    const transaction = {
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      serviceRequest: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createAttempts += 1
          persisted = {
            ...data,
            createdAt: new Date("2026-08-10T10:00:00.000Z"),
            id: "service-request-1",
          }
          throw new Prisma.PrismaClientKnownRequestError(
            "Concurrent request already committed.",
            { clientVersion: "test", code: "P2002" },
          )
        },
        findFirst: async () => null,
      },
      serviceRequestForm: {
        findFirst: async () => ({
          id: "form-1",
          offerings: [
            {
              offering: {
                id: "offering-1",
                name: "Cleaning",
                serviceOffering: { quantityScale: 0 },
                variant: { name: "Standard", selections: [] },
              },
              offeringId: "offering-1",
            },
          ],
          storeId: "store-1",
          tenantId: "tenant-1",
        }),
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
    }
    const db = {
      $transaction: async (
        callback: (tx: typeof transaction) => Promise<unknown>,
      ) => callback(transaction),
      serviceRequest: { findFirst: async () => persisted },
    } as unknown as PrismaClient

    await expect(
      submitPublicServiceRequest(db, {
        clientRequestId: "service-request-race",
        customerName: "Ada",
        formToken: "public-form-token",
        lines: [{ offeringId: "offering-1", quantity: "1" }],
      }),
    ).resolves.toMatchObject({
      created: false,
      id: "service-request-1",
    })
    expect(createAttempts).toBe(1)
  })
})
