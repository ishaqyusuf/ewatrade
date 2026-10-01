import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { verifyBundledAppleRoots } from "./verify-apple-roots.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const contents = readFileSync(
  path.join(root, "apps/api/src/billing/apple-root-certificates.json"),
  "utf8",
)

test("the packaged Apple trust roots pass the billing preflight", () => {
  assert.equal(verifyBundledAppleRoots(), true)
})

test("the preflight rejects changed certificate bytes and missing roots", () => {
  const changed = JSON.parse(contents)
  changed[0].derBase64 = changed[0].derBase64.replace(/^./, "A")
  assert.throws(() => verifyBundledAppleRoots(JSON.stringify(changed)))

  const missing = JSON.parse(contents)
  missing.pop()
  assert.throws(() => verifyBundledAppleRoots(JSON.stringify(missing)))
})
