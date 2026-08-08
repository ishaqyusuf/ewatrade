import { describe, expect, test } from "bun:test"

import {
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
