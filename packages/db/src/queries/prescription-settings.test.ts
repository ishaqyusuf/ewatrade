import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  assertActivePrescriptionStore,
  assertPrescriptionStoreRole,
  evaluatePrescriptionStoreReadiness,
  setPrescriptionStoreActivation,
  validatePrescriptionRoleAssignment,
} from "./prescription-settings"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

describe("Prescription Commerce store readiness", () => {
  test("allows activation only when policy, fulfilment, attendant, and verified pharmacist gates pass", () => {
    expect(
      evaluatePrescriptionStoreReadiness({
        activeAttendantCount: 1,
        contactPolicyConfigured: true,
        deliveryEnabled: false,
        operatingHoursConfigured: true,
        pickupEnabled: true,
        servicePolicyConfigured: true,
        verifiedPharmacistCount: 1,
      }),
    ).toEqual({ missing: [], ready: true })
  })

  test("reports every missing activation gate instead of partially enabling the store", () => {
    expect(
      evaluatePrescriptionStoreReadiness({
        activeAttendantCount: 0,
        contactPolicyConfigured: false,
        deliveryEnabled: false,
        operatingHoursConfigured: false,
        pickupEnabled: false,
        servicePolicyConfigured: false,
        verifiedPharmacistCount: 0,
      }),
    ).toEqual({
      missing: [
        "operating_hours",
        "service_policy",
        "contact_policy",
        "fulfilment_mode",
        "attendant",
        "verified_pharmacist",
      ],
      ready: false,
    })
  })

  test("requires a verified credential reference for pharmacist assignment", () => {
    expect(() =>
      validatePrescriptionRoleAssignment({
        credentialReference: undefined,
        credentialVerified: true,
        role: "pharmacist",
      }),
    ).toThrow("Pharmacist assignment requires a credential reference")

    expect(() =>
      validatePrescriptionRoleAssignment({
        credentialReference: "PCN-verified-reference",
        credentialVerified: false,
        role: "pharmacist",
      }),
    ).toThrow("Pharmacist credential must be verified before assignment")
  })

  test("does not require professional credentials for attendant assignment", () => {
    expect(
      validatePrescriptionRoleAssignment({
        credentialReference: undefined,
        credentialVerified: false,
        role: "attendant",
      }),
    ).toEqual({ credentialReference: null, credentialVerifiedAt: null })
  })

  test("requires web channel policy before activation succeeds", async () => {
    const decisions = allowedServiceCommercePolicyDecisionRows().filter(
      (decision) => !(decision.channel === "WEB" && decision.subject === "WEB"),
    )
    let activated = false
    const transaction = {
      prescriptionIncidentControl: { findFirst: async () => null },
      prescriptionStoreAuditEvent: { create: async () => ({ id: "audit-1" }) },
      prescriptionStoreRole: {
        findMany: async () => [
          {
            credentialReference: null,
            credentialVerifiedAt: null,
            role: "ATTENDANT",
            status: "ACTIVE",
          },
          {
            credentialReference: "licence-1",
            credentialVerifiedAt: new Date(),
            role: "PHARMACIST",
            status: "ACTIVE",
          },
        ],
      },
      prescriptionStoreSettings: {
        update: async () => {
          activated = true
          return { id: "settings-1" }
        },
        upsert: async () => ({
          contactPolicy: "Contact policy",
          deliveryEnabled: false,
          id: "settings-1",
          operatingHours: [{ day: "monday", isClosed: false }],
          pickupEnabled: true,
          servicePolicy: "Service policy",
        }),
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 1 }),
      },
      serviceCommercePolicyDecision: { findMany: async () => decisions },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      store: { findFirst: async () => ({ id: "store-1", name: "Store" }) },
    } as unknown as PrismaClient

    await expect(
      setPrescriptionStoreActivation(db, {
        active: true,
        actorUserId: "owner-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "PRESCRIPTION_NOT_READY" })
    expect(activated).toBe(false)
  })
})

describe("Prescription Commerce Store authorization", () => {
  test("requires active settings in the exact Tenant and Store", async () => {
    const queries: unknown[] = []
    const db = {
      prescriptionStoreSettings: {
        findFirst: async (input: unknown) => {
          queries.push(input)
          return null
        },
      },
    } as unknown as PrismaClient

    await expect(
      assertActivePrescriptionStore(db, {
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ code: "PRESCRIPTION_NOT_ACTIVE" })
    expect(queries).toEqual([
      {
        where: {
          status: "ACTIVE",
          storeId: "store-1",
          tenantId: "tenant-1",
        },
      },
    ])
  })

  test("accepts only the requested active Store role and verified pharmacist", async () => {
    const roleQueries: unknown[] = []
    let currentRole: Record<string, unknown> | null = {
      credentialReference: null,
      credentialVerifiedAt: null,
      id: "attendant-role",
    }
    const db = {
      prescriptionStoreRole: {
        findFirst: async (input: unknown) => {
          roleQueries.push(input)
          return currentRole
        },
      },
      prescriptionStoreSettings: {
        findFirst: async () => ({ id: "settings-1" }),
      },
    } as unknown as PrismaClient

    await expect(
      assertPrescriptionStoreRole(db, {
        role: "attendant",
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "user-1",
      }),
    ).resolves.toMatchObject({ id: "attendant-role" })
    currentRole = {
      credentialReference: null,
      credentialVerifiedAt: null,
      id: "pharmacist-role",
    }
    await expect(
      assertPrescriptionStoreRole(db, {
        role: "pharmacist",
        storeId: "store-1",
        tenantId: "tenant-1",
        userId: "user-2",
      }),
    ).rejects.toMatchObject({ code: "PRESCRIPTION_ROLE_REQUIRED" })
    currentRole = null
    await expect(
      assertPrescriptionStoreRole(db, {
        role: "attendant",
        storeId: "other-store",
        tenantId: "tenant-1",
        userId: "ordinary-user",
      }),
    ).rejects.toMatchObject({ code: "PRESCRIPTION_ROLE_REQUIRED" })
    expect(roleQueries).toEqual([
      {
        where: {
          role: "ATTENDANT",
          status: "ACTIVE",
          storeId: "store-1",
          tenantId: "tenant-1",
          userId: "user-1",
        },
      },
      {
        where: {
          role: "PHARMACIST",
          status: "ACTIVE",
          storeId: "store-1",
          tenantId: "tenant-1",
          userId: "user-2",
        },
      },
      {
        where: {
          role: "ATTENDANT",
          status: "ACTIVE",
          storeId: "other-store",
          tenantId: "tenant-1",
          userId: "ordinary-user",
        },
      },
    ])
  })
})
