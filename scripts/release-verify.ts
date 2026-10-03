#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  createEwaTradeProviderBindings,
  loadSignedProviderBundle,
} from "../.release/ewatrade-provider-bundle"
import { runConsumerReleaseCheck } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/consumer"
import type { VerifiedReleaseEvidence } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/evidence"
import { isGenuineReleaseGate } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/gate"
import { validateReleaseManifest } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/manifest"
import type { ReleaseManifest } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/plan"
import { verifyVendorSnapshot } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/vendor"
import {
  assertBundleContract,
  assertProviderTargetBindings,
  releaseContract,
} from "./release-contract"
import { assertMobileEnvironmentReceipt } from "./release-mobile-preflight"
import {
  assertReleaseRevision,
  assertSourceEvidence,
  assertTrustedTopology,
  committedManifest,
  committedSourceFingerprints,
  dirtyReleaseInputs,
} from "./release-source"

type CandidateReleaseInput = {
  repository: string
  environment: "preview" | "production"
  revision: string
}
const PROOFS = new WeakSet<object>()
function freezeProof(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return
  for (const child of Object.values(value)) freezeProof(child)
  Object.freeze(value)
}
export type VerifiedCandidateReleaseProof = Awaited<
  ReturnType<typeof verifyCandidateReleaseProof>
>
export function isVerifiedCandidateReleaseProof(
  proof: unknown,
): proof is VerifiedCandidateReleaseProof {
  return typeof proof === "object" && proof !== null && PROOFS.has(proof)
}

export async function verifyCandidateReleaseProof(
  input: CandidateReleaseInput,
) {
  const repository = assertReleaseRevision(input.repository, input.revision)
  const trustedRoot = resolve(import.meta.dir, "..")
  const lock = verifyVendorSnapshot(trustedRoot)
  const contract = releaseContract(trustedRoot, lock.toolkitRevision)
  const trusted = JSON.parse(
    readFileSync(resolve(trustedRoot, "release.manifest.json"), "utf8"),
  ) as ReleaseManifest
  validateReleaseManifest(trusted)
  const manifest = committedManifest(repository, input.revision)
  assertTrustedTopology(manifest, trusted)
  if (dirtyReleaseInputs(repository, manifest).length)
    throw new Error(
      "Candidate release inputs differ from the committed revision.",
    )
  const context = {
    ...input,
    repository,
    toolkitRevision: lock.toolkitRevision,
  }
  const bundle = loadSignedProviderBundle(context)
  assertBundleContract(bundle, contract)
  assertProviderTargetBindings(bundle)
  assertSourceEvidence(
    committedSourceFingerprints(repository, input.revision, manifest),
    bundle.sourceFingerprints,
  )
  assertMobileEnvironmentReceipt(context, bundle)
  const bindings = createEwaTradeProviderBindings(context, bundle)
  let evidence: VerifiedReleaseEvidence | undefined
  const report = await runConsumerReleaseCheck(context, {
    ...bindings,
    verifyActions: async (...args) => {
      evidence = args[3]
      return bindings.verifyActions(...args)
    },
  })
  if (
    !isGenuineReleaseGate(report) ||
    report.revision !== input.revision ||
    report.environment !== input.environment ||
    !evidence
  )
    throw new Error("Release verifier did not produce matching toolkit proof.")
  const proof = { report, bundle, manifest, evidence }
  freezeProof(proof)
  PROOFS.add(proof)
  return proof
}

export async function verifyCandidateRelease(input: CandidateReleaseInput) {
  return (await verifyCandidateReleaseProof(input)).report
}

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2)
    if (
      args.length !== 6 ||
      args[0] !== "--env" ||
      !["preview", "production"].includes(args[1]) ||
      args[2] !== "--repo" ||
      args[4] !== "--revision"
    )
      throw new Error(
        "Use release-verify --env preview|production --repo <candidate root> --revision <full SHA>.",
      )
    const report = await verifyCandidateRelease({
      environment: args[1] as "preview" | "production",
      repository: args[3],
      revision: args[5],
    })
    console.log(JSON.stringify(report))
    process.exitCode = report.ready ? 0 : 1
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Release verification failed.",
    )
    process.exitCode = 2
  }
}
