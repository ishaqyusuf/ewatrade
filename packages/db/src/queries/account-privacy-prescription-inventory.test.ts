import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyPrescriptionInventory } from "./account-privacy-prescription-inventory"

test("counts pharmacy references and verified-email candidates without reading content", async () => {
  const queries: Array<[string, unknown]> = []
  const subject = "verified-user"
  const extraChecks: Array<[string, Record<string, unknown>]> = [
    [
      "prescriptionStoreSettings",
      {
        OR: [{ activatedByUserId: subject }, { deactivatedByUserId: subject }],
      },
    ],
    ["prescriptionChannel", { createdByUserId: subject }],
    ["prescriptionMedia", { reviewedByUserId: subject }],
    ["prescriptionMediaAccessEvent", { actorUserId: subject }],
    ["prescriptionTranscription", { requestedByUserId: subject }],
    ["prescriptionTranscriptionLine", { verifiedByUserId: subject }],
    ["prescriptionLineMapping", { mappedByUserId: subject }],
    ["prescriptionPaymentRefund", { requestedByUserId: subject }],
    [
      "prescriptionPickupFulfillment",
      { OR: [{ packedByUserId: subject }, { handedOffByUserId: subject }] },
    ],
    ["prescriptionPickupEvent", { actorUserId: subject }],
    [
      "prescriptionDeliveryZone",
      { OR: [{ createdByUserId: subject }, { updatedByUserId: subject }] },
    ],
    [
      "prescriptionDeliveryAddress",
      { OR: [{ evaluatedByUserId: subject }, { packedByUserId: subject }] },
    ],
    ["prescriptionDeliveryAssignment", { assignedByUserId: subject }],
    ["prescriptionDeliveryEvent", { actorUserId: subject }],
    ["prescriptionRetentionPolicy", { updatedByUserId: subject }],
    [
      "prescriptionIncidentControl",
      { OR: [{ activatedByUserId: subject }, { resolvedByUserId: subject }] },
    ],
    ["prescriptionSensitiveAccessEvent", { actorUserId: subject }],
  ]
  const db = {
    prescriptionStoreRole: {
      count: async (query: unknown) => {
        queries.push(["role", query])
        return 2
      },
    },
    prescriptionStoreAuditEvent: {
      count: async (query: unknown) => {
        queries.push(["role-audit", query])
        return 4
      },
    },
    prescriptionPharmacistReview: {
      count: async (query: unknown) => {
        queries.push(["review", query])
        return 5
      },
    },
    prescriptionRequestAuditEvent: {
      count: async (query: unknown) => {
        queries.push(["request-audit", query])
        return 6
      },
    },
    prescriptionRequest: {
      count: async (query: unknown) => {
        queries.push(["request", query])
        return 1
      },
    },
    prescriptionPrivacyRequest: {
      count: async (query: unknown) => {
        queries.push(["privacy", query])
        return 3
      },
    },
    ...Object.fromEntries(
      extraChecks.map(([name]) => [
        name,
        {
          count: async (query: unknown) => {
            queries.push([name, query])
            return 0
          },
        },
      ]),
    ),
  } as unknown as PrismaClient

  const inventory = await getAccountPrivacyPrescriptionInventory(
    db,
    subject,
    " Person@Example.TEST ",
  )
  expect(inventory).toMatchObject({
    pharmacyRoles: 2,
    pharmacyRoleAuditEvents: 4,
    staffAssistedRequests: 1,
    pharmacistReviews: 5,
    requestAuditEvents: 6,
    privacyRequests: 3,
    customerEmailMatches: 1,
  })
  expect(
    queries.filter(([name]) => !extraChecks.some(([extra]) => extra === name)),
  ).toEqual([
    [
      "role",
      {
        where: {
          OR: [
            { userId: "verified-user" },
            { credentialVerifiedByUserId: "verified-user" },
            { assignedByUserId: "verified-user" },
            { revokedByUserId: "verified-user" },
          ],
        },
      },
    ],
    [
      "role-audit",
      {
        where: {
          OR: [
            { actorUserId: "verified-user" },
            { subjectUserId: "verified-user" },
          ],
        },
      },
    ],
    ["request", { where: { staffAssistedByUserId: "verified-user" } }],
    ["review", { where: { pharmacistUserId: "verified-user" } }],
    ["request-audit", { where: { actorUserId: "verified-user" } }],
    [
      "privacy",
      {
        where: {
          OR: [
            { requestedByUserId: "verified-user" },
            { identityVerifiedByUserId: "verified-user" },
            { completedByUserId: "verified-user" },
          ],
        },
      },
    ],
    [
      "request",
      {
        where: {
          customerEmail: {
            equals: "person@example.test",
            mode: "insensitive",
          },
        },
      },
    ],
  ])
  expect(
    queries.filter(([name]) => extraChecks.some(([extra]) => extra === name)),
  ).toEqual(extraChecks.map(([name, where]) => [name, { where }]))
  expect(Object.values(inventory).filter((count) => count > 0)).toHaveLength(7)
})
