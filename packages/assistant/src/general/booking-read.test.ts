import { expect, test } from "bun:test"
import {
  type ServiceBookingTarget,
  generalBookingReadInput,
  serviceBookingTargetSchema,
} from "./booking-read"

const original = {
  bookingId: "booking-1",
  sourceId: "source-1",
  offeringId: "offering-1",
}

test("requires exact booking/source/Offering identity and rejects model authority or capabilities", () => {
  expect(generalBookingReadInput.parse(original)).toEqual(original)
  for (const field of Object.keys(original))
    expect(
      generalBookingReadInput.safeParse({ ...original, [field]: "" }).success,
    ).toBe(false)
  for (const field of [
    "tenantId",
    "storeId",
    "actorUserId",
    "resourceId",
    "accessToken",
    "status",
    "paymentStatus",
    "startAt",
    "nextOperations",
  ]) {
    expect(
      generalBookingReadInput.safeParse({ ...original, [field]: "spoofed" })
        .success,
    ).toBe(false)
  }
})

test("saved target is a strict original staff record reference, without bearer secrets", () => {
  const target = {
    kind: "service_booking",
    ...original,
  } satisfies ServiceBookingTarget
  expect(serviceBookingTargetSchema.parse(target)).toEqual(target)
  expect(
    serviceBookingTargetSchema.safeParse({ ...target, tokenDigest: "secret" })
      .success,
  ).toBe(false)
  expect(
    serviceBookingTargetSchema.safeParse({
      ...target,
      kind: "prescription_booking",
    }).success,
  ).toBe(false)
})
