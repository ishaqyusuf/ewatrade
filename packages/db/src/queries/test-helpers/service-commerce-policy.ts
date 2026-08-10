import {
  ServiceCommercePolicyChannel,
  ServiceCommercePolicyOutcome,
  ServiceCommercePolicySubject,
  ServiceCommercePolicyVertical,
} from "../../../generated/prisma/enums"

export function allowedServiceCommercePolicyDecisionRows() {
  return Object.values(ServiceCommercePolicyVertical).flatMap((vertical) =>
    Object.values(ServiceCommercePolicyChannel).flatMap((channel) =>
      Object.values(ServiceCommercePolicySubject).map((subject, index) => ({
        approvalReference: "approved-test-evidence",
        channel,
        effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
        evidenceReference: "private-test-evidence",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        id: `policy-${vertical}-${channel}-${subject}`,
        jurisdictionCode: "NG",
        licenceReference: null,
        outcome: ServiceCommercePolicyOutcome.ALLOWED,
        reason: "Test policy decision",
        reviewedByUserId: "reviewer-1",
        revision: index + 1,
        revokedAt: null,
        storeId: "store-1",
        subject,
        tenantId: "tenant-1",
        vertical,
      })),
    ),
  )
}
