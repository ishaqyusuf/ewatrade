import { expect, test } from "bun:test"
import {
  staffProcedureAction,
  staffProcedureStoreInput,
} from "./staff-procedure-policy"

test("scoped staff may read only their narrow policy notices and acknowledge their receipts", () => {
  expect(
    staffProcedureAction("businessBanking.notificationChanges", "query"),
  ).toBe("read")
  expect(
    staffProcedureAction("businessBanking.notificationChanges", "mutation"),
  ).toBeNull()
  expect(
    staffProcedureAction(
      "businessBanking.markNotificationChangesRead",
      "mutation",
    ),
  ).toBe("read")
  expect(
    staffProcedureAction(
      "businessBanking.markNotificationChangesRead",
      "query",
    ),
  ).toBeNull()
  expect(
    staffProcedureStoreInput.has("businessBanking.notificationChanges"),
  ).toBe(false)
  for (const path of [
    "businessBanking.notificationEligibility",
    "businessBanking.notificationSettings",
    "businessBanking.saveBankDetails",
    "businessBanking.createBankAccount",
    "businessBanking.updateNotificationPolicy",
    "businessBanking.notificationChangesUnsafe",
  ]) {
    expect(staffProcedureAction(path, "query")).toBeNull()
    expect(staffProcedureAction(path, "mutation")).toBeNull()
  }
})
