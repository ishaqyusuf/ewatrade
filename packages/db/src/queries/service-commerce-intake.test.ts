import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { submitServiceCommerceIntake } from "./service-commerce-intake"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

const consent = {
  contactOptIn: false,
  privacyNoticeVersion: "2026-08-10",
}

describe("Service Commerce channel-neutral intake repository", () => {
  test("resolves an active Store attendant before returning exact Product recovery", async () => {
    const calls: unknown[] = []
    const client = {
      serviceCommerceStoreTeamAssignment: {
        findFirst: async (args: unknown) => {
          calls.push(args)
          return { id: "assignment_1" }
        },
      },
    }
    await expect(
      submitServiceCommerceIntake(dbClient(client), {
        actorUserId: "attendant_1",
        envelope: {
          channel: "staff",
          clientCommandId: "staff_1",
          consent,
          context: { kind: "store", storeId: "store_1" },
          intent: {
            kind: "exact_product",
            offeringId: "offering_1",
            quantity: "1",
          },
        },
        tenantId: "tenant_1",
      }),
    ).resolves.toEqual({
      action: "use_cart",
      code: "unsupported",
      status: "recovery",
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      where: {
        membership: { tenantId: "tenant_1", userId: "attendant_1" },
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    })
  })

  test("fails closed instead of falling back when the Store has no active attendant", async () => {
    const client = {
      serviceCommerceStoreTeamAssignment: { findFirst: async () => null },
    }
    await expect(
      submitServiceCommerceIntake(dbClient(client), {
        actorUserId: "attendant_1",
        envelope: {
          channel: "staff",
          clientCommandId: "staff_1",
          consent,
          context: { kind: "store", storeId: "store_1" },
          intent: {
            kind: "exact_product",
            offeringId: "offering_1",
            quantity: "1",
          },
        },
        tenantId: "tenant_1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  test("re-resolves a public entry and replays one Inquiry without duplicating its audit", async () => {
    let inquiry: Record<string, unknown> | null = null
    let createdAudit = false
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      commerceInquiry: {
        findFirst: async () => inquiry,
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          inquiry ??= {
            ...create,
            id: "inquiry_1",
            lines: [{ id: "line_1" }],
            status: "RECEIVED",
            vertical: "SERVICE",
          }
          return inquiry
        },
      },
      commerceInquiryAuditEvent: {
        create: async () => {
          createdAudit = true
          return { id: "audit_1" }
        },
        findFirst: async () => (createdAudit ? { id: "audit_1" } : null),
      },
      customerEntryPoint: {
        findFirst: async () => ({
          id: "entry_1",
          revision: 1,
          status: "PUBLISHED",
          store: { name: "Bag Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => ({
          intakeEnabled: true,
          status: "ACTIVE",
          webEnabled: true,
          whatsappEnabled: false,
        }),
      },
      serviceCommerceStoreTeamAssignment: {
        findFirst: async () => ({ id: "assignment_1" }),
      },
      store: {
        findFirst: async () => ({
          countryCode: "NG",
          serviceCommerceProfile: {
            intakeEnabled: true,
            staffEnabled: true,
            status: "ACTIVE",
            webEnabled: true,
            whatsappEnabled: false,
          },
        }),
      },
      whatsAppStoreBinding: { findMany: async () => [] },
    }
    const envelope = {
      channel: "web" as const,
      clientCommandId: "web_1",
      consent,
      context: { kind: "entry_point" as const, token: "entry_token" },
      intent: {
        customer: { name: "Ada" },
        demand: {
          kind: "commerce_inquiry" as const,
          reason: "needs_identification" as const,
        },
        kind: "commerce_inquiry" as const,
        lines: [{ description: "Red small bag" }],
        summary: "Is this available?",
      },
    }
    await expect(
      submitServiceCommerceIntake(dbClient(client), { envelope }),
    ).resolves.toMatchObject({
      replayed: false,
      source: { id: "inquiry_1", kind: "commerce_inquiry" },
      status: "accepted",
    })
    await expect(
      submitServiceCommerceIntake(dbClient(client), { envelope }),
    ).resolves.toMatchObject({ replayed: true })
    await expect(
      submitServiceCommerceIntake(dbClient(client), {
        envelope: {
          ...envelope,
          intent: {
            ...envelope.intent,
            summary: "Different payload under the same command identity",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})
