import { expect, test } from "bun:test"
import { qaRuntimeIdentity } from "./qa-runtime-identity"

test("QA runtime distinguishes development, embedded, active OTA and emergency fallback", () => {
  const base = {
    enabled: true,
    embedded: false,
    emergency: false,
    updateId: "update-1",
    build: "35",
  }
  expect(qaRuntimeIdentity(base)).toBe("QA runtime update-1 · build 35")
  expect(qaRuntimeIdentity({ ...base, embedded: true })).toBe(
    "QA runtime embedded · build 35",
  )
  expect(qaRuntimeIdentity({ ...base, enabled: false })).toBe(
    "QA runtime development",
  )
  expect(qaRuntimeIdentity({ ...base, emergency: true })).toBe(
    "QA runtime recovery",
  )
  expect(qaRuntimeIdentity({ ...base, updateId: null, build: null })).toBe(
    "QA runtime unknown · build unknown",
  )
})
