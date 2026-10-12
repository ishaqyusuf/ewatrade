import { expect, test } from "bun:test"
import { StaffStoreAccessError } from "@ewatrade/db/staff-store-access"
import {
  assertStaffAccessWriteReady,
  staffAccessOperation,
} from "./general-staff-store-access"

test("false native readiness refuses before write preparation without modifying process configuration", () => {
  expect(() => assertStaffAccessWriteReady(false)).toThrow(
    "rollout is not ready",
  )
  try {
    assertStaffAccessWriteReady(false)
  } catch (error) {
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" })
  }
  expect(() => assertStaffAccessWriteReady(true)).not.toThrow()
})
test("canonical access errors stay typed and unexpected audit faults escape", async () => {
  for (const code of ["FORBIDDEN", "CONFLICT", "INVALID_INPUT"] as const)
    await expect(
      staffAccessOperation(async () => {
        throw new StaffStoreAccessError(code, "Canonical refusal")
      }),
    ).rejects.toMatchObject({
      code: code === "INVALID_INPUT" ? "BAD_REQUEST" : code,
      message: "Canonical refusal",
    })
  const error = new Error("Original audit failure")
  await expect(
    staffAccessOperation(async () => {
      throw error
    }),
  ).rejects.toBe(error)
})
