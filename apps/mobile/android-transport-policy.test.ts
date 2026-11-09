import { expect, test } from "bun:test"

const {
  applyTransportPolicy,
} = require("./plugins/with-android-transport-policy.cjs")

function manifest(attributes: Record<string, string> = {}) {
  return { manifest: { application: [{ $: { ...attributes } }] } }
}

test("release refuses cleartext even after incremental development prebuild", () => {
  const input = manifest({ "android:label": "EwaTrade" })
  applyTransportPolicy(input, true)
  expect(input.manifest.application[0].$["android:usesCleartextTraffic"]).toBe(
    "true",
  )
  applyTransportPolicy(input, false)
  expect(input.manifest.application[0].$).toEqual({
    "android:label": "EwaTrade",
    "android:usesCleartextTraffic": "false",
  })
  // Switching back must preserve local Metro/API HTTP compatibility.
  applyTransportPolicy(input, true)
  expect(input.manifest.application[0].$["android:usesCleartextTraffic"]).toBe(
    "true",
  )
})

test("release fails closed if network-security XML could override the policy", () => {
  const input = manifest({ "android:networkSecurityConfig": "@xml/custom" })
  expect(() => applyTransportPolicy(input)).toThrow(
    "Review Android networkSecurityConfig",
  )
  expect(input.manifest.application[0].$["android:networkSecurityConfig"]).toBe(
    "@xml/custom",
  )
})

test("a missing native application cannot silently skip the policy", () => {
  expect(() => applyTransportPolicy({ manifest: {} })).toThrow(
    "Android application manifest is missing",
  )
})
