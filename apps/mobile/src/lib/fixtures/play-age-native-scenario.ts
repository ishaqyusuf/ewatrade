import { mock } from "bun:test"
import assert from "node:assert/strict"
let native: unknown = null
let calls = 0
const platform = { OS: "ios" }
mock.module("react-native", () => ({ Platform: platform }))
mock.module("expo-modules-core", () => ({
  requireOptionalNativeModule: () => native,
}))
const { createNativePlayAgeReader } = await import("../play-age-signals")
assert.equal(calls, 0) // Import and factory creation never invoke an SDK.
const reader = createNativePlayAgeReader(() => 1)
assert.equal((await reader.read()).observation.kind, "unsupported")
platform.OS = "android"
assert.equal((await reader.read()).observation.kind, "unsupported")
native = {
  observeAge: async () => {
    calls++
    return { kind: "shared" }
  },
} // Old/incompatible bridge.
assert.equal((await reader.read()).observation.kind, "unsupported")
assert.equal(calls, 0)
native = {
  requestAccess: async () => {
    calls++
    return { kind: "disabled" }
  },
  readShared: async () => {
    throw Error("must not query while disabled")
  },
}
assert.deepEqual((await reader.read()).observation, { kind: "disabled" })
assert.equal(calls, 1)
let releaseAccess: (value: unknown) => void = () => {}
let queries = 0
native = {
  requestAccess: () =>
    new Promise((resolve) => {
      releaseAccess = resolve
    }),
  readShared: async () => {
    queries++
    return {
      kind: "shared",
      lower: 18,
      upper: null,
      source: "self-declared",
      change: "not-provided",
    }
  },
}
const pending = reader.read()
await Promise.resolve()
reader.invalidate()
releaseAccess({ kind: "access-shared" })
assert.equal((await pending).stale, true)
assert.equal(queries, 0)
console.log("play-age-native: passed")
