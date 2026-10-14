import { expect, test } from "bun:test"
import { collectionReference } from "./collection-intents"

test("collection references are stable, tenant-bound and provider-safe", () => {
  const reference = collectionReference("tenant-a", "link-1")
  expect(reference).toBe(collectionReference("tenant-a", "link-1"))
  expect(reference).not.toBe(collectionReference("tenant-b", "link-1"))
  expect(reference).not.toBe(collectionReference("tenant-a", "link-2"))
  expect(reference).toMatch(/^col_[a-f0-9]{32}$/)
})
