#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { loadSignedProviderBundle } from "../.release/ewatrade-provider-bundle"
import { readBaselineClaims } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/baselines"
import { collectGitTargetChanges } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/git-changes"
import { validateReleaseManifest } from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/manifest"
import {
  type ReleaseManifest,
  planRelease,
} from "../.release/toolkit/fef51031b8964dcd8043ee5d6a7558e482e7055d/src/release/plan"
import { assertBundleContract, releaseContract } from "./release-contract"
import { assertCompatibleMobileBaseline } from "./release-mobile-preflight"
import { notifyLocalReleaseChecklist } from "./release-notify"
import { dirtyReleaseInputs, releaseGit } from "./release-source"
import { committedSourceFingerprints } from "./release-source"

export function localReleaseChecklist(
  repository: string,
  environment: "preview" | "production",
) {
  const root = resolve(repository)
  const revision = releaseGit(root, ["rev-parse", "HEAD"])
  const manifest = JSON.parse(
    readFileSync(resolve(root, "release.manifest.json"), "utf8"),
  ) as ReleaseManifest
  validateReleaseManifest(manifest)
  const claims = readBaselineClaims(
    resolve(root, ".release/baselines.json"),
    manifest.project,
    environment,
    false,
  )
  const changes = collectGitTargetChanges(
    manifest,
    environment,
    revision,
    claims.baselines,
    root,
    true,
  )
  const plan = planRelease(manifest, {
    environment,
    revision,
    targetChanges: changes,
  })
  const dirtyPaths = dirtyReleaseInputs(root, manifest)
  const blockers = [
    "Local status is advisory; protected CI must verify the exact revision and active provider state.",
  ]
  if (!claims.present)
    blockers.push(
      "Deployment baselines are missing; all declared targets require review.",
    )
  if (dirtyPaths.length)
    blockers.push(
      "Release inputs contain uncommitted changes; HEAD does not describe the current release source.",
    )
  let signedEvidence: "available" | "unavailable" = "unavailable"
  const mobilePlatforms = (["android", "ios"] as const).map((platform) => ({
    platform,
    classification: "unknown" as
      | "unknown"
      | "ota-compatible"
      | "native-build-or-review",
    reason: "Fresh signed mobile compatibility evidence is unavailable.",
  }))
  try {
    const bundle = loadSignedProviderBundle({
      repository: root,
      revision,
      environment,
      toolkitRevision: "fef51031b8964dcd8043ee5d6a7558e482e7055d",
    })
    assertBundleContract(
      bundle,
      releaseContract(
        resolve(import.meta.dir, ".."),
        "fef51031b8964dcd8043ee5d6a7558e482e7055d",
      ),
    )
    signedEvidence = "available"
    if (
      dirtyPaths.length ||
      bundle.sourceFingerprints?.mobile !==
        committedSourceFingerprints(root, revision, manifest).mobile
    ) {
      for (const platform of mobilePlatforms)
        platform.reason =
          "Commit the reviewed release inputs and obtain matching source evidence before classifying OTA compatibility."
    } else {
      for (const platform of mobilePlatforms) {
        try {
          assertCompatibleMobileBaseline(
            {
              repository: root,
              revision,
              environment,
              platforms: [platform.platform],
            },
            bundle,
            manifest,
          )
          platform.classification = "ota-compatible"
          platform.reason =
            "Signed baseline fingerprint, runtime, channel and source ancestry match; local status remains advisory."
        } catch (error) {
          platform.classification = "native-build-or-review"
          platform.reason =
            error instanceof Error
              ? error.message
              : "Mobile compatibility review is required."
        }
      }
    }
  } catch {
    blockers.push(
      "Fresh signed evidence for this environment and revision is unavailable.",
    )
  }
  return {
    command: "status",
    project: manifest.project,
    environment,
    revision,
    mode: "working-tree",
    proofStatus: "advisory",
    baselineClaims: claims.present ? "unverified" : "missing",
    signedEvidence,
    mobilePlatforms,
    dirtyPaths,
    blockers,
    databasePolicy: {
      managedBy: "local-infra-kit",
      releaseGate: "excluded",
      strategy: "db-push",
      execution: "local-then-selected-environment",
      confirmation: "existing-interactive-prompts",
      command: `bun run release:run --env ${environment}`,
    },
    actions: plan.actions.map((action) => ({
      ...action,
      operation: action.action,
      verification: "pending" as const,
      instructions:
        action.targetKind === "mobile"
          ? "Obtain signed per-platform fingerprints, runtimes and compatible builds; publish OTA only after the exact-source preflight succeeds."
          : "Verify the provider artifact, exact source revision, environment and active deployment state.",
    })),
  }
}

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2)
    if (
      args[0] !== "--env" ||
      !["preview", "production"].includes(args[1]) ||
      args.slice(2).some((arg) => !["--json", "--notify"].includes(arg)) ||
      new Set(args.slice(2)).size !== args.slice(2).length ||
      args.length > 4
    )
      throw new Error(
        "Use release:status --env preview|production [--json] [--notify].",
      )
    const result = localReleaseChecklist(
      resolve(import.meta.dir, ".."),
      args[1] as "preview" | "production",
    )
    if (args.includes("--notify"))
      notifyLocalReleaseChecklist({
        environment: result.environment,
        revision: result.revision,
        actionCount: result.actions.length,
        dirtyCount: result.dirtyPaths.length,
      })
    if (args.includes("--json")) console.log(JSON.stringify(result))
    else {
      console.log(
        `EwaTrade ${result.environment}: ${result.actions.length} release actions to review (${result.revision.slice(0, 8)}).`,
      )
      for (const action of result.actions)
        console.log(
          `- ${action.targetId}: ${action.operation}; prerequisites: ${action.prerequisites.join(", ") || "none"}`,
        )
      for (const blocker of result.blockers) console.log(`- ${blocker}`)
      for (const platform of result.mobilePlatforms)
        console.log(
          `- ${platform.platform}: ${platform.classification}; ${platform.reason}`,
        )
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Local release status failed.",
    )
    process.exitCode = 2
  }
}
