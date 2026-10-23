import assert from "node:assert/strict"
import { input, source } from "../src/fixtures.test-support"
import { COMPONENT_COMPILER, runIsolatedComponentBuild } from "../src/isolation"

await assert.rejects(
  runIsolatedComponentBuild(source, []),
  /COMPONENT_FIXTURE_COUNT_INVALID/,
)
await assert.rejects(
  runIsolatedComponentBuild(source, [{ ...input() }]),
  /COMPONENT_TRUSTED_INPUT_REQUIRED/,
)
const result = await runIsolatedComponentBuild(source, [
  input(),
  input({ settings: { heading: "Sparse fixture" } }),
  input({ settings: { heading: "Large fixture ".repeat(8) } }),
])
assert.equal(result.receipt.fixtureCount, 3)
assert.equal(result.htmlFixtures.length, 3)
assert.equal(result.receipt.fixtureInputHashes.length, 3)
assert.equal(result.receipt.fixtureHtmlHashes.length, 3)
assert(result.htmlFixtures[1]?.includes("Sparse fixture"))
assert(result.htmlFixtures[2]?.includes("Large fixture"))
assert(result.html.includes("Local fixture"))
assert(result.html.includes('data-sf-action-index="0"'))
assert(!result.html.includes("onclick"))
assert.equal(result.receipt.image, COMPONENT_COMPILER.image)
assert.equal(result.receipt.generatedSourceExecutedInHost, false)
for (const phase of [result.receipt.compiler, result.receipt.renderer]) {
  assert.equal(phase.guards.network, "none")
  assert.equal(phase.guards.memoryBytes, 536870912)
  assert.equal(phase.guards.mount.readOnly, true)
  assert.deepEqual(phase.probes, {
    hostReadDenied: true,
    sourceWriteDenied: true,
    rootWriteDenied: true,
    loopbackControl: true,
    networkDenied: true,
    noExternalInterface: true,
    noExternalRoute: true,
    credentialFreeEnvironment: true,
  })
}
console.log(JSON.stringify(result.receipt, null, 2))
