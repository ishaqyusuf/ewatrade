import { afterEach, expect, test } from "bun:test"
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import {
  beginComponentAttempt,
  readAttemptStatus,
  saveComponentArtifact,
  verifyArtifact,
} from "./artifacts"
import { createComponentInput } from "./contracts"
import { offlineSampleBrief, offlineSampleSource } from "./offline-sample"
import { runComponentPipeline, validateInertComponentHtml } from "./pipeline"

const roots: string[] = []
const store = () => {
  const value = realpathSync(
    mkdtempSync("/private/tmp/storefront-pipeline-test-"),
  )
  roots.push(value)
  return value
}
function removeOwnedFixture(root: string) {
  chmodSync(root, 0o700)
  for (const name of readdirSync(root)) {
    const child = `${root}/${name}`
    const stat = lstatSync(child)
    if (stat.isDirectory() && !stat.isSymbolicLink()) removeOwnedFixture(child)
  }
  rmSync(root, { recursive: true, force: true })
}
afterEach(() => {
  for (const root of roots.splice(0)) removeOwnedFixture(root)
})
const request = {
  attemptId: "attempt-local-01",
  sourceRevision: "a".repeat(40),
  brief: offlineSampleBrief,
}
const input = () =>
  createComponentInput({
    manifest: offlineSampleSource.manifest,
    settings: { heading: "", description: "" },
    data: {
      business: {
        name: "Fixture shop",
        slug: "fixture-shop",
        description: null,
      },
    },
    theme: {},
    availableActions: [{ type: "openConversation" }],
    approvedAssets: new Map(),
  })

test("attempt is durable before generator; uncertain outcomes block replay and bind exact request", async () => {
  const storeRoot = store()
  let calls = 0
  const generator = {
    kind: "provider" as const,
    async generate() {
      calls++
      expect(readAttemptStatus(storeRoot, request.attemptId)).toMatchObject({
        status: "outcome-unknown",
      })
      expect(
        readFileSync(
          `${storeRoot}/attempts/${request.attemptId}/started.json`,
          "utf8",
        ),
      ).toContain("outcome-unknown")
      throw new Error("sensitive provider response must never be in diagnostic")
    },
  }
  const failed = await runComponentPipeline(
    { storeRoot, ...request },
    generator,
  )
  expect(failed.status).toBe("outcome-unknown")
  expect(failed.diagnostics[0]?.code).toBe(
    "COMPONENT_GENERATION_OUTCOME_UNKNOWN",
  )
  expect(
    await runComponentPipeline({ storeRoot, ...request }, generator),
  ).toMatchObject({ replayed: true, artifactId: failed.artifactId })
  await expect(
    runComponentPipeline(
      {
        storeRoot,
        ...request,
        brief: { ...request.brief, intent: "different" },
      },
      generator,
    ),
  ).rejects.toThrow("COMPONENT_ATTEMPT_INPUT_CONFLICT")
  expect(calls).toBe(1)
})

test("default generator is disabled; malformed raw output becomes inspectable failure without a build", async () => {
  const storeRoot = store()
  const disabled = await runComponentPipeline({ storeRoot, ...request })
  expect(disabled).toMatchObject({
    status: "failed",
    diagnostics: [
      { stage: "generation", code: "COMPONENT_GENERATOR_DISABLED" },
    ],
  })
  const failed = await runComponentPipeline(
    { storeRoot, ...request, attemptId: "attempt-local-02" },
    {
      kind: "offline-fixture",
      async generate() {
        return {
          output: "malformed JSON",
          generation: null,
          fixtureLabel: "malformed-fixture",
        }
      },
    },
  )
  expect(failed).toMatchObject({
    status: "failed",
    diagnostics: [{ stage: "schema", repairable: true }],
  })
  if (!failed.artifactId || !failed.artifactPath)
    throw new Error("Failure artifact missing")
  expect(
    verifyArtifact(storeRoot, failed.artifactId).files.some(
      (file) => file.name === "output.raw.json",
    ),
  ).toBe(true)
  expect(readFileSync(`${failed.artifactPath}/output.raw.json`, "utf8")).toBe(
    "malformed JSON",
  )
  expect(
    verifyArtifact(storeRoot, failed.artifactId).files.some(
      (file) => file.name === "qualification.mjs",
    ),
  ).toBe(false)
})

test("artifact inventory detects tampering, extra files, traversal and symlink substitution", () => {
  const root = store()
  const saved = saveComponentArtifact(root, {
    "receipt.json": '{"status":"failed"}',
    "component.tsx": "inert source bytes",
  })
  expect(verifyArtifact(root, saved.artifactId).files).toHaveLength(2)
  expect(
    saveComponentArtifact(root, {
      "component.tsx": "inert source bytes",
      "receipt.json": '{"status":"failed"}',
    }),
  ).toEqual(saved)
  expect(() => verifyArtifact(root, "../escape")).toThrow()
  chmodSync(saved.artifactPath, 0o700)
  chmodSync(`${saved.artifactPath}/component.tsx`, 0o600)
  writeFileSync(`${saved.artifactPath}/component.tsx`, "tampered")
  expect(() => verifyArtifact(root, saved.artifactId)).toThrow(
    "COMPONENT_ARTIFACT_HASH_MISMATCH",
  )
  unlinkSync(`${saved.artifactPath}/component.tsx`)
  symlinkSync("/etc/hosts", `${saved.artifactPath}/component.tsx`)
  expect(() => verifyArtifact(root, saved.artifactId)).toThrow()
  expect(() => saveComponentArtifact(root, { "../escape": "no" })).toThrow()
  expect(beginComponentAttempt(root, "reserved-local", request, "prompt")).toBe(
    true,
  )
  expect(beginComponentAttempt(root, "reserved-local", request, "prompt")).toBe(
    false,
  )
})

test("strict HTML output gate rejects active and ambiguous markup including React-object forgeries", () => {
  const projected = input()
  expect(
    validateInertComponentHtml(
      '<div><section><h1>Fixture shop</h1><button type="button" data-sf-action-index="0">Contact</button></section></div>',
      projected,
    ),
  ).toMatchObject({ buttons: 1, activeContent: false })
  for (const html of [
    "<script>alert(1)</script>",
    '<svg onload="x"></svg>',
    '<iframe srcdoc="x"></iframe>',
    '<img src="https://attacker.invalid/pixel" alt="x"/>',
    '<section onclick="x">Text</section>',
    '<section style="background:url(https://attacker.invalid)">Text</section>',
    '<a href="javascript:x">Go</a>',
    "<section><p>Invalid</section>",
    '<button type="submit">Go</button>',
    '<button type="button"></button>',
    '<section class="x" class="y">Text</section>',
    "<section><!----></section>",
    '<button type="button" data-sf-action-index="9">Contact</button>',
  ])
    expect(() => validateInertComponentHtml(html, projected)).toThrow()
})
