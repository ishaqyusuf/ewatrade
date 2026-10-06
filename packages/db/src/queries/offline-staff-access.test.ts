import { expect, test } from "bun:test"
import {
  OfflineStaffAccessError,
  assertOfflineStaffActor,
} from "./offline-staff-access"
import type { DbClient } from "./types"
function db(role: string, mode = "LEGACY", status = "ACTIVE", isActive = true) {
  return {
    $queryRaw: async () => [{ role, staffAccessMode: mode, status, isActive }],
  } as unknown as DbClient
}
const input = { actorUserId: "staff", tenantId: "business" }
test("old queued Orders cannot execute after scoped cutover or suspension", async () => {
  for (const role of ["CASHIER", "OPERATOR", "MANAGER"])
    await expect(
      assertOfflineStaffActor(db(role, "SCOPED"), input),
    ).rejects.toBeInstanceOf(OfflineStaffAccessError)
  await expect(
    assertOfflineStaffActor(db("OWNER", "LEGACY", "SUSPENDED"), input),
  ).rejects.toBeInstanceOf(OfflineStaffAccessError)
  await expect(
    assertOfflineStaffActor(db("OWNER", "LEGACY", "ACTIVE", false), input),
  ).rejects.toBeInstanceOf(OfflineStaffAccessError)
})
test("current active administrators and legacy checkout staff retain offline Order authority", async () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "CASHIER"])
    await expect(
      assertOfflineStaffActor(db(role), input),
    ).resolves.toBeUndefined()
  await expect(
    assertOfflineStaffActor(db("OWNER", "SCOPED"), input),
  ).resolves.toBeUndefined()
})
