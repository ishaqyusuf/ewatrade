import { expect, test } from "bun:test"
import {
  staffProcedureAction,
  staffProcedureStoreInput,
} from "./staff-procedure-policy"

test("Activity admits only its audited query paths and never caller-owned Store injection", () => {
  for (const path of [
    "activity.listPage",
    "activity.get",
    "activity.filters",
  ]) {
    expect(staffProcedureAction(path, "query")).toBe("read")
    expect(staffProcedureAction(path, "mutation")).toBeNull()
    expect(staffProcedureStoreInput.has(path)).toBe(false)
  }
  expect(staffProcedureAction("activity.record", "mutation")).toBeNull()
  expect(staffProcedureAction("activity.export", "query")).toBeNull()
})
