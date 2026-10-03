import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import {
  matchesAny,
  validateReleaseManifest,
} from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/manifest"
import type { ReleaseManifest } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/plan"

export function releaseGitBytes(repository: string, args: string[]) {
  return execFileSync("git", ["-c", "core.fsmonitor=false", ...args], {
    cwd: repository,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  })
}

export function releaseGit(repository: string, args: string[]) {
  return releaseGitBytes(repository, args).toString("utf8").trim()
}

export function assertReleaseRevision(repository: string, revision: string) {
  const root = realpathSync(repository)
  if (
    !/^[0-9a-f]{40}$/i.test(revision) ||
    releaseGit(root, ["rev-parse", "--show-toplevel"]) !== root ||
    releaseGit(root, ["rev-parse", "HEAD"]) !== revision
  )
    throw new Error(
      "Release verification requires the exact repository root and full checked-out revision.",
    )
  return root
}

export function committedManifest(
  repository: string,
  revision: string,
): ReleaseManifest {
  const committed = releaseGit(repository, [
    "show",
    `${revision}:release.manifest.json`,
  ])
  if (
    readFileSync(
      resolve(repository, "release.manifest.json"),
      "utf8",
    ).trim() !== committed
  )
    throw new Error("Release manifest differs from the committed revision.")
  const manifest = JSON.parse(committed) as ReleaseManifest
  validateReleaseManifest(manifest)
  if (manifest.project !== "ewatrade")
    throw new Error("Release project does not match EwaTrade.")
  return manifest
}

/** Candidate data may expand reviewed coverage, but cannot remove trusted requirements. */
export function assertTrustedTopology(
  candidate: ReleaseManifest,
  trusted: ReleaseManifest,
) {
  for (const required of trusted.targets) {
    const target = candidate.targets.find((item) => item.id === required.id)
    if (
      !target ||
      target.kind !== required.kind ||
      required.environments.some(
        (item) => !target.environments.includes(item),
      ) ||
      required.sourcePaths.some((item) => !target.sourcePaths.includes(item)) ||
      (required.nativeCandidatePaths ?? []).some(
        (item) => !target.nativeCandidatePaths?.includes(item),
      ) ||
      (required.prerequisites ?? []).some(
        (item) => !target.prerequisites?.includes(item),
      ) ||
      (required.impactTargets ?? []).some(
        (item) => !target.impactTargets?.includes(item),
      )
    )
      throw new Error(
        `Candidate release topology weakens trusted requirements for ${required.id}.`,
      )
  }
  if (
    candidate.targets.some(
      (target) => !trusted.targets.some((item) => item.id === target.id),
    )
  )
    throw new Error(
      "New release targets require a trusted provider binding before verification.",
    )
}

export function committedSourceFingerprints(
  repository: string,
  revision: string,
  manifest: ReleaseManifest,
) {
  const entries = releaseGit(repository, ["ls-tree", "-r", "-z", revision])
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf("\t")
      const [mode, kind, blob] = entry.slice(0, tab).split(" ")
      return { path: entry.slice(tab + 1), mode, kind, blob }
    })
  return Object.fromEntries(
    manifest.targets.map((target) => {
      const selected = entries.filter((entry) =>
        matchesAny(entry.path, [
          ...target.sourcePaths,
          ...(target.nativeCandidatePaths ?? []),
        ]),
      )
      if (
        selected.length === 0 ||
        selected.some(
          (entry) =>
            entry.kind !== "blob" || !["100644", "100755"].includes(entry.mode),
        )
      )
        throw new Error(
          `Release inputs for ${target.id} are missing or contain symlinks/submodules.`,
        )
      const canonical = selected
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map(({ path, mode, blob }) => [path, mode, blob])
      return [
        target.id,
        createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
      ]
    }),
  )
}

export function assertSourceEvidence(
  actual: Record<string, string>,
  claims: Record<string, string> | undefined,
) {
  if (
    !claims ||
    Object.entries(actual).some(([id, hash]) => claims[id] !== hash)
  )
    throw new Error(
      "Signed source fingerprints are missing or differ from the exact release revision.",
    )
}

export function dirtyReleaseInputs(
  repository: string,
  manifest: ReleaseManifest,
) {
  const dirty = releaseGit(repository, [
    "diff",
    "HEAD",
    "--no-ext-diff",
    "--no-renames",
    "--name-only",
    "-z",
  ]).split("\0")
  const untracked = releaseGit(repository, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]).split("\0")
  const patterns = manifest.targets.flatMap((target) => [
    ...target.sourcePaths,
    ...(target.nativeCandidatePaths ?? []),
  ])
  return [...new Set([...dirty, ...untracked])]
    .filter((path) => path && matchesAny(path, patterns))
    .sort()
}
