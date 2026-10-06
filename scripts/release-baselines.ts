import { randomUUID } from "node:crypto"
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"
import type { ReleaseBaselineClaims } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/baselines"
import { latestVerifiedReceiptForTarget } from "../.release/toolkit/bf26b05e442e122a9e9ef14cb6a8eff5a9d565d7/src/release/evidence"
import {
  assertReleaseRevision,
  dirtyReleaseInputs,
  releaseGit,
} from "./release-source"
import {
  type VerifiedCandidateReleaseProof,
  isVerifiedCandidateReleaseProof,
  verifyCandidateReleaseProof,
} from "./release-verify"

const FULL_SHA = /^[0-9a-f]{40}$/i
const CLAIM_SHA = /^[0-9a-f]{7,64}$/i

function lstatOrNull(path: string) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return null
    throw error
  }
}

function assertParentSafe(parent: string) {
  const parentStat = lstatOrNull(parent)
  if (parentStat?.isSymbolicLink())
    throw new Error("Baseline claims parent directory must not be a symlink.")
  if (parentStat && !parentStat.isDirectory())
    throw new Error("Baseline claims parent must be a directory.")
  return parentStat
}

function validateExistingClaims(
  path: string,
  project: string,
): ReleaseBaselineClaims {
  const stat = lstatOrNull(path)
  if (!stat) return { version: 1, project, baselines: {} }
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(
      "Baseline claims output must be a regular file, not a symlink.",
    )
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    throw new Error("Existing baseline claims file is invalid JSON.")
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as ReleaseBaselineClaims).version !== 1 ||
    (parsed as ReleaseBaselineClaims).project !== project ||
    !(parsed as ReleaseBaselineClaims).baselines ||
    typeof (parsed as ReleaseBaselineClaims).baselines !== "object" ||
    Array.isArray((parsed as ReleaseBaselineClaims).baselines)
  )
    throw new Error(
      "Existing baseline claims version or project does not match the verified manifest.",
    )

  const claims = parsed as ReleaseBaselineClaims
  for (const environment of ["preview", "production"] as const) {
    const selected = claims.baselines[environment]
    if (selected === undefined) continue
    if (!selected || typeof selected !== "object" || Array.isArray(selected))
      throw new Error(`Invalid existing ${environment} baseline claims.`)
    for (const [targetId, revision] of Object.entries(selected)) {
      if (
        revision !== null &&
        (typeof revision !== "string" || !CLAIM_SHA.test(revision))
      )
        throw new Error(`Invalid existing baseline revision for ${targetId}.`)
    }
  }
  return claims
}

function writeClaimsAtomically(
  parent: string,
  path: string,
  claims: ReleaseBaselineClaims,
) {
  const parentStat = assertParentSafe(parent)
  if (!parentStat) mkdirSync(parent, { mode: 0o700 })

  const currentParent = lstatSync(parent)
  if (currentParent.isSymbolicLink() || !currentParent.isDirectory())
    throw new Error(
      "Baseline claims parent directory must be a real directory.",
    )
  const outputStat = lstatOrNull(path)
  if (outputStat?.isSymbolicLink())
    throw new Error("Baseline claims output must not be a symlink.")
  if (outputStat && !outputStat.isFile())
    throw new Error("Baseline claims output must be a regular file.")

  const temporary = resolve(parent, `.baselines.${randomUUID()}.tmp`)
  let fd: number | undefined
  try {
    fd = openSync(temporary, "wx", 0o600)
    writeFileSync(fd, `${JSON.stringify(claims, null, 2)}\n`, "utf8")
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(temporary, path)
    const directoryFd = openSync(parent, "r")
    try {
      fsyncSync(directoryFd)
    } finally {
      closeSync(directoryFd)
    }
  } finally {
    if (fd !== undefined) closeSync(fd)
    rmSync(temporary, { force: true })
  }
}

/**
 * Refresh advisory planner baselines only from a branded strict verifier proof.
 * Call `verifyCandidateReleaseProof` for this same repository/environment first.
 */
export function refreshReleaseBaselines(input: {
  repository: string
  environment: "preview" | "production"
  proof: VerifiedCandidateReleaseProof
}) {
  if (!input || !["preview", "production"].includes(input.environment))
    throw new Error("Baseline refresh needs a valid release environment.")
  if (!isVerifiedCandidateReleaseProof(input.proof))
    throw new Error(
      "Baseline refresh requires a genuine strict verifier proof.",
    )

  const repository = assertReleaseRevision(
    input.repository,
    input.proof.report.revision,
  )
  const revision = releaseGit(repository, ["rev-parse", "HEAD"])
  if (
    !FULL_SHA.test(revision) ||
    input.proof.report.revision !== revision ||
    input.proof.report.environment !== input.environment ||
    input.proof.report.project !== input.proof.manifest.project ||
    input.proof.report.ready !== true ||
    input.proof.evidence.project !== input.proof.manifest.project ||
    input.proof.evidence.environment !== input.environment
  )
    throw new Error(
      "Baseline refresh requires a ready proof for this exact HEAD and environment.",
    )

  const next: Record<string, string> = {}
  for (const target of input.proof.manifest.targets) {
    if (!target.environments.includes(input.environment)) continue
    const receipt = latestVerifiedReceiptForTarget(
      input.proof.evidence,
      target.id,
    )
    if (
      !receipt ||
      receipt.project !== input.proof.manifest.project ||
      receipt.environment !== input.environment ||
      !FULL_SHA.test(receipt.revision)
    )
      throw new Error(`Verified provider baseline is missing for ${target.id}.`)
    next[target.id] = receipt.revision
  }
  if (Object.keys(next).length === 0)
    throw new Error(
      "Verified manifest has no active targets for baseline refresh.",
    )

  if (dirtyReleaseInputs(repository, input.proof.manifest).length)
    throw new Error(
      "Release inputs changed after baseline proof; verify again.",
    )

  const parent = resolve(repository, ".release")
  const path = resolve(parent, "baselines.json")
  assertParentSafe(parent)
  const existing = validateExistingClaims(path, input.proof.manifest.project)
  const claims: ReleaseBaselineClaims = {
    version: 1,
    project: input.proof.manifest.project,
    baselines: {
      ...existing.baselines,
      [input.environment]: next,
    },
  }
  writeClaimsAtomically(parent, path, claims)
  return { path, claims }
}

export async function verifyAndRefreshReleaseBaselines(input: {
  repository: string
  environment: "preview" | "production"
  revision: string
}) {
  const proof = await verifyCandidateReleaseProof(input)
  return refreshReleaseBaselines({ ...input, proof })
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
        "Use release-baselines --env preview|production --repo <candidate root> --revision <full SHA>.",
      )
    const result = await verifyAndRefreshReleaseBaselines({
      environment: args[1] as "preview" | "production",
      repository: args[3],
      revision: args[5],
    })
    console.log(JSON.stringify({ advisory: true, ...result }))
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Baseline refresh failed.",
    )
    process.exitCode = 2
  }
}
