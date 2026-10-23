import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { verifyArtifact } from "../src/artifacts"
import {
  offlineSampleBrief,
  offlineSampleGenerator,
} from "../src/offline-sample"
import { runComponentPipeline } from "../src/pipeline"

const storeRoot = "/private/tmp/storefront-component-offline-artifacts"
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim()
const result = await runComponentPipeline(
  {
    storeRoot,
    attemptId: `offline-${randomUUID()}`,
    sourceRevision,
    brief: offlineSampleBrief,
  },
  offlineSampleGenerator,
)
assert.equal(result.status, "ready", JSON.stringify(result.diagnostics))
assert(result.artifactId && result.artifactPath)
const verified = verifyArtifact(storeRoot, result.artifactId)
for (const name of ["populated", "empty", "unavailable"]) {
  const html = readFileSync(
    `${verified.artifactPath}/preview-${name}.html`,
    "utf8",
  )
  assert(html.includes("Fixture Store"))
  assert(html.includes("Synthetic fixture data."))
  assert(
    html.includes("script-src &#x27;none&#x27;") ||
      html.includes("script-src 'none'"),
  )
  assert.equal(html.includes(">Contact</button>"), name === "populated")
}
const build = JSON.parse(
  readFileSync(`${verified.artifactPath}/build-receipt.json`, "utf8"),
)
assert.equal(build.fixtureCount, 3)
assert.equal(build.generatedSourceExecutedInHost, false)
assert.equal(build.compiler.probes.credentialFreeEnvironment, true)
assert.equal(build.renderer.probes.networkDenied, true)
console.log(
  JSON.stringify(
    {
      ...result,
      storeRoot,
      previewPath: `${result.artifactPath}/preview.html`,
      bundleHash: build.bundleHash,
      buildRecipeHash: build.buildRecipeHash,
      fixtureCount: 3,
    },
    null,
    2,
  ),
)
