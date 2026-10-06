import { runAppUpdate } from "../../local-infra-kit/src/app-update/command"
import appUpdateConfig from "../app-update.config"
import {
  assertArtifactUrl,
  parseBuildNumber,
} from "../packages/utils/src/app-update"
import { MOBILE_PROJECT } from "./release-mobile-target"

/** Publication is delivery metadata, never evidence that a release gate passed. */
export function previewBuildPublication(
  value: unknown,
  expectedCommit: string,
  expectedId?: string,
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid EAS build metadata")
  const build = value as {
    id?: unknown
    status?: unknown
    platform?: unknown
    buildProfile?: unknown
    distribution?: unknown
    channel?: unknown
    appVersion?: unknown
    appBuildVersion?: unknown
    gitCommitHash?: unknown
    project?: { id?: unknown; ownerAccount?: { name?: unknown } }
    artifacts?: { buildUrl?: unknown }
  }
  if (
    !/^[0-9a-f]{40}$/i.test(expectedCommit) ||
    typeof build.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(build.id) ||
    (expectedId && build.id !== expectedId) ||
    build.status !== "FINISHED" ||
    build.platform !== "ANDROID" ||
    build.buildProfile !== "preview" ||
    build.distribution !== "INTERNAL" ||
    build.channel !== "preview" ||
    build.project?.id !== MOBILE_PROJECT.projectId ||
    build.project?.ownerAccount?.name !== MOBILE_PROJECT.owner ||
    typeof build.gitCommitHash !== "string" ||
    build.gitCommitHash.toLowerCase() !== expectedCommit.toLowerCase()
  )
    throw new Error(
      "Only the exact completed EwaTrade Android preview build can be published",
    )
  const artifactUrl = assertArtifactUrl(build.artifacts?.buildUrl)
  const buildNumber = parseBuildNumber(build.appBuildVersion)
  if (
    typeof build.appVersion !== "string" ||
    !/^[\w.+-]{1,80}$/.test(build.appVersion)
  )
    throw new Error("Invalid EAS app version")
  return {
    id: build.id as string,
    artifactUrl,
    buildNumber,
    appVersion: build.appVersion as string,
  }
}
export async function assertPreviewPublisherReady(
  root: string,
  forwardedArgs: string[],
) {
  if (forwardedArgs.includes("--no-wait"))
    throw new Error(
      "Preview Android builds must wait for completion to publish the in-app download. Remove --no-wait.",
    )
  await runAppUpdate(["status", "--backend", "preview"], {
    root,
    config: appUpdateConfig,
    print: () => {},
  })
}
export async function runPreviewBuildAndPublish(input: {
  command: string[]
  root: string
  expectedCommit: string
  runJson: (command: string[]) => Promise<{ code: number; output: string }>
  publish?: (args: string[]) => Promise<void>
}) {
  const command = input.command.filter(
    (arg) => arg !== "--json" && arg !== "--wait",
  )
  if (command.includes("--no-wait"))
    throw new Error("Preview publication requires a completed build")
  const result = await input.runJson([...command, "--wait", "--json"])
  if (result.code !== 0) return result.code
  const values = JSON.parse(result.output)
  const records = Array.isArray(values) ? values : [values]
  if (records.length !== 1)
    throw new Error("Expected exactly one Android preview build")
  const created = previewBuildPublication(records[0], input.expectedCommit)
  // Re-read that exact provider build; never pick the latest build from a list.
  const observed = await input.runJson([
    "eas",
    "build:view",
    created.id,
    "--json",
  ])
  if (observed.code !== 0)
    throw new Error(
      `Build ${created.id} finished, but its metadata could not be rechecked`,
    )
  const build = previewBuildPublication(
    JSON.parse(observed.output),
    input.expectedCommit,
    created.id,
  )
  const args = [
    "publish",
    "--backend",
    "preview",
    "--build-number",
    String(build.buildNumber),
    "--app-version",
    build.appVersion,
    "--url",
    build.artifactUrl,
  ]
  try {
    if (input.publish) await input.publish(args)
    else await runAppUpdate(args, { root: input.root, config: appUpdateConfig })
  } catch {
    throw new Error(
      `Preview build ${build.id} succeeded, but in-app publication failed. Fix the publisher configuration, then retry without rebuilding: bun release:mobile:publish ${args.slice(1).join(" ")}`,
    )
  }
  return 0
}
