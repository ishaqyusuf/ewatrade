import { expect, test } from "bun:test"
import {
  serviceWorkStatusLabel,
  usesCustomerSignOff,
} from "./service-work-presentation"

test("cleaning-only work uses sign-off; mixed, empty and laundry work retain handoff", () => {
  expect(usesCustomerSignOff([" Home  Cleaning ", "Event Cleaning"])).toBe(true)
  for (const names of [
    [],
    ["Laundry"],
    ["Dry Cleaning"],
    ["Home Cleaning", "Laundry"],
    ["Home Cleaning supplies"],
  ]) {
    expect(usesCustomerSignOff(names)).toBe(false)
  }
  expect(serviceWorkStatusLabel("READY_FOR_HANDOFF", ["Home Cleaning"])).toBe(
    "Customer sign-off",
  )
  expect(serviceWorkStatusLabel("ready_for_handoff", ["Event Cleaning"])).toBe(
    "Customer sign-off",
  )
  expect(serviceWorkStatusLabel("READY_FOR_HANDOFF", ["Laundry"])).toBe(
    "ready for handoff",
  )
  expect(serviceWorkStatusLabel("BLOCKED", ["Home Cleaning"])).toBe("blocked")
})
