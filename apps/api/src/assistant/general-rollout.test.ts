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
test("pilot selection permits only named capabilities; unset retains source compatibility", () => {
  expect(generalCapabilityEnabled(read, {})).toBe(true)
  expect(generalCapabilityEnabled(write, {})).toBe(true)
  const env = {
    ASSISTANT_GENERAL_CAPABILITIES: " sales.summary.read ,sales.summary.read ",
  }
  expect(generalCapabilityEnabled(read, env)).toBe(true)
  expect(generalCapabilityEnabled(write, env)).toBe(false)
})
test("explicit empty, unknown and planned capabilities fail closed", () => {
  for (const value of ["", " , ", "sales.summary.read,typo", "*"])
    expect(
      generalCapabilityEnabled(read, { ASSISTANT_GENERAL_CAPABILITIES: value }),
    ).toBe(false)
  expect(generalCapabilityEnabled({ ...read, rollout: "planned" }, {})).toBe(
    false,
  )
})
