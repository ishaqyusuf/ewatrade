import { describe, expect, test } from "bun:test"

import { runPrescriptionPrivacyRequest } from "./prescription-privacy-request"

describe("prescription privacy request job", () => {
  test("keeps the durable payload identifier-only without deleting media", async () => {
    const completed: Array<Record<string, unknown>> = []
    await runPrescriptionPrivacyRequest(
      { actorUserId: "user-1", privacyRequestId: "privacy-1" },
      {
        claim: async () => ({
          media: [],
          prescriptionRequestIds: ["request-1"],
          privacyRequestId: "privacy-1",
          requestedChanges: null,
          storeId: "store-1",
          subjectReference: "RX-SAFE",
          tenantId: "tenant-1",
          type: "CORRECTION",
        }),
        complete: async (input) => {
          completed.push(input)
        },
      },
    )

    expect(completed).toHaveLength(1)
    expect(completed[0]?.deletedMediaIds).toEqual([])
    expect(completed[0]).not.toHaveProperty("prescriptionContent")
  })
})
