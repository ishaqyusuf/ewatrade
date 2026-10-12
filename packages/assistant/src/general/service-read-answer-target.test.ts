import { expect, test } from "bun:test"
import { type GeneralAnswer, generalStoredPartSchema } from "./contracts"

const targets = [
  {
    kind: "commerce_quote_approval",
    approvalId: "original-approval",
    quoteId: "original-quote",
    quoteVersionId: "original-version",
  },
  {
    kind: "service_booking",
    bookingId: "original-booking",
    sourceId: "original-source",
    offeringId: "original-offering",
  },
] satisfies NonNullable<GeneralAnswer["target"]>[]

const saved = (target: unknown) => ({
  type: "data-general-answer",
  data: {
    id: "saved-answer",
    title: "Original service record",
    value: "Stored facts",
    scope: "Current Store",
    asOf: "2026-10-12T10:00:00.000Z",
    detail: "Current eligibility is checked again when opening the record.",
    target,
  },
})

test("saved answer serialization retains both exact service originals across chat hydration", () => {
  for (const target of targets) {
    const part = {
      type: "data-general-answer",
      data: { ...saved(target).data, target },
    } satisfies { type: "data-general-answer"; data: GeneralAnswer }
    expect(
      generalStoredPartSchema.parse(JSON.parse(JSON.stringify(part))),
    ).toEqual(part)
  }
})

test("saved chat cannot smuggle service scope, authority or bearer secrets into an original opener", () => {
  for (const target of targets) {
    for (const field of [
      "tenantId",
      "storeId",
      "actorUserId",
      "canApprove",
      "accessToken",
    ])
      expect(
        generalStoredPartSchema.safeParse(
          saved({ ...target, [field]: "forged" }),
        ).success,
      ).toBe(false)
    expect(
      generalStoredPartSchema.safeParse(saved({ ...target, kind: undefined }))
        .success,
    ).toBe(false)
    expect(
      generalStoredPartSchema.safeParse(
        saved({ ...target, kind: "service_job" }),
      ).success,
    ).toBe(false)
  }
})
