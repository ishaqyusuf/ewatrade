import { expect, test } from "bun:test"
import {
  acceptsOrderAttachmentBytes,
  orderAttachmentKind,
  orderAttachmentStoragePath,
} from "./order-attachments"

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])
const pdf = new TextEncoder().encode("%PDF-1.7\n")

test("accepts photos and PDFs whose bytes match the declared type", () => {
  expect(orderAttachmentKind("image/jpeg")).toBe("IMAGE")
  expect(orderAttachmentKind("application/pdf")).toBe("DOCUMENT")
  expect(orderAttachmentKind("video/mp4")).toBeNull()
  expect(acceptsOrderAttachmentBytes(jpeg, "image/jpeg")).toBe(true)
  expect(acceptsOrderAttachmentBytes(pdf, "application/pdf")).toBe(true)
  expect(acceptsOrderAttachmentBytes(pdf, "image/jpeg")).toBe(false)
})

test("keys objects by business, order and attachment", () => {
  expect(
    orderAttachmentStoragePath({
      attachmentId: "att1",
      contentDigest: "b".repeat(64),
      contentType: "image/png",
      orderId: "ord1",
      sizeBytes: 10,
      tenantId: "ten1",
    }),
  ).toBe(`orders/attachments/ten1/ord1/att1/${"b".repeat(64)}.png`)
  expect(() =>
    orderAttachmentStoragePath({
      attachmentId: "../x",
      contentDigest: "b".repeat(64),
      contentType: "image/png",
      orderId: "ord1",
      sizeBytes: 10,
      tenantId: "ten1",
    }),
  ).toThrow()
})
