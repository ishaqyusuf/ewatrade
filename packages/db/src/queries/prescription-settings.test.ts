import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  assertActivePrescriptionStore,
  assertPrescriptionStoreRole,
  evaluatePrescriptionStoreReadiness,
  validatePrescriptionRoleAssignment,
} from "./prescription-settings"

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
