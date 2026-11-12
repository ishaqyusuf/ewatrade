import { expect, test } from "bun:test"
import {
  acceptsServiceEvidencePhotoBytes,
  serviceEvidenceStoragePath,
} from "./service-evidence"

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])
const pdf = new TextEncoder().encode("%PDF-1.7\n")

test("accepts only photos whose bytes match the declared type", () => {
  expect(acceptsServiceEvidencePhotoBytes(jpeg, "image/jpeg")).toBe(true)
  expect(acceptsServiceEvidencePhotoBytes(jpeg, "image/png")).toBe(false)
  expect(acceptsServiceEvidencePhotoBytes(pdf, "application/pdf")).toBe(false)
})

test("keys private job photos by business, job and evidence", () => {
  const target = {
    contentDigest: "c".repeat(64),
    contentType: "image/jpeg",
    evidenceId: "ev1",
    jobId: "job1",
    sizeBytes: 10,
    tenantId: "ten1",
  }
  expect(serviceEvidenceStoragePath(target)).toBe(
    `services/evidence/ten1/job1/ev1/${"c".repeat(64)}.jpg`,
  )
  expect(() =>
    serviceEvidenceStoragePath({ ...target, jobId: "../x" }),
  ).toThrow()
  expect(() =>
    serviceEvidenceStoragePath({ ...target, contentType: "application/pdf" }),
  ).toThrow()
})
