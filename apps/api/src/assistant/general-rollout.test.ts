import { expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import { generalCapabilityEnabled } from "./general-rollout"
const read = capabilityManifest.find(
  (value) => value.id === "sales.summary.read",
)
const write = capabilityManifest.find(
  (value) => value.id === "sales.order.create",
)
if (!read || !write) throw Error("Required capabilities missing")
test("shipped capabilities are on; planned ones stay off", () => {
  expect(generalCapabilityEnabled(read)).toBe(true)
  expect(generalCapabilityEnabled(write)).toBe(true)
  expect(generalCapabilityEnabled({ ...read, rollout: "planned" })).toBe(false)
})
