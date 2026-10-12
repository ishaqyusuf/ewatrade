import { expect, test } from "bun:test"
import {
  acceptsOrderAttachmentBytes,
  orderAttachmentKind,
  orderAttachmentStoragePath,
} from "./order-attachments"

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])
const pdf = new TextEncoder().encode("%PDF-1.7\n")

const mp4 = new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
])

test("accepts photos, PDFs and videos whose bytes match the declared type", () => {
  expect(orderAttachmentKind("image/jpeg")).toBe("IMAGE")
  expect(orderAttachmentKind("application/pdf")).toBe("DOCUMENT")
  expect(orderAttachmentKind("video/mp4")).toBe("VIDEO")
  expect(orderAttachmentKind("video/webm")).toBeNull()
  expect(acceptsOrderAttachmentBytes(mp4, "video/quicktime")).toBe(true)
  expect(acceptsOrderAttachmentBytes(jpeg, "video/mp4")).toBe(false)
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
