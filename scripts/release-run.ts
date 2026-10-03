import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { relative, resolve } from "node:path"

type Environment = "preview" | "production"
export type ReleaseStep = { label: string; argv: string[] }
type Options = { environment: Environment; then: string; dryRun: boolean }

export const RELEASE_RUN_HELP = `Usage: bun run release:run --env preview|production [--then SCRIPT] [--dry-run]

Runs the existing local-infra-kit DB push locally, then for the selected environment.
Both must succeed before the application command starts. Normal interactive
confirmation and Prisma warnings remain visible. No data-loss flags are supplied.

Default application command: release:plan (shows a plan; does not deploy).
Deployment commands: api:preview:deploy (Preview), api:deploy or deploy:api
(Production), jobs:deploy (Production). Other supported commands: release:status,
release:collect and release:check. A failed/cancelled stage stops the sequence.
`

export function releaseRunOptions(args: string[]): Options {
  const values = new Map<string, string>()
  let dryRun = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--dry-run" && !dryRun) {
      dryRun = true
      continue
    }
    if (arg !== "--env" && arg !== "--then")
      throw new Error(`Unsupported release:run argument: ${arg}`)
    const value = args[++index]
    if (!value || value.startsWith("--") || values.has(arg))
      throw new Error(`Supply ${arg} exactly once with a value.`)
    values.set(arg, value)
  }
  const environment = values.get("--env")
  if (environment !== "preview" && environment !== "production")
    throw new Error("Choose --env preview or production.")
  const then = values.get("--then") ?? "release:plan"
  const shared = [
    "release:plan",
    "release:status",
    "release:collect",
    "release:check",
  ]
  const deployments =
    environment === "preview"
      ? ["api:preview:deploy"]
      : ["api:deploy", "deploy:api", "jobs:deploy"]
  if (![...shared, ...deployments].includes(then))
    throw new Error(
      `Application command ${then} is unsupported for ${environment}.`,
    )
  return { environment, then, dryRun }
}

export function releaseRunSteps(options: Options): ReleaseStep[] {
  const command = (script: string, ...args: string[]) => [
    "bun",
    "--env-file=/dev/null",
    "run",
    script,
    ...args,
  ]
  return [
    { label: "Local database push", argv: command("db:push", "--local") },
    {
      label: `${options.environment} database push`,
      argv: command(
        "db:push",
        options.environment === "preview" ? "--preview" : "--prod",
      ),
    },
    {
      label: `Application: ${options.then}`,
      argv: command(
        options.then,
        ...(options.then.startsWith("release:")
          ? ["--env", options.environment]
          : []),
      ),
    },
  ]
}

/** Profile selection belongs to the existing infra command, never a carried-over URL. */
export function releaseRunEnvironment(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const selected = { ...env }
  selected.DATABASE_URL = undefined
  return selected
}

/** The hosted push must use the schema that just passed the local push. */
export function releaseRunSchemaFingerprint(root: string): string {
  const directory = resolve(root, "packages/db/prisma")
  const files: string[] = []
  const visit = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = resolve(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.name.endsWith(".prisma")) files.push(child)
    }
  }
  visit(directory)
  if (files.length === 0) throw new Error("No Prisma schema files were found.")
  const hash = createHash("sha256")
  hash
    .update(readFileSync(resolve(root, "packages/db/prisma.config.ts")))
    .update("\0")
  for (const file of files.sort()) {
    hash.update(relative(directory, file)).update("\0")
    hash.update(readFileSync(file)).update("\0")
  }
  return hash.digest("hex")
}

export async function runRelease(
  args: string[],
  dependencies: {
    execute: (step: ReleaseStep) => Promise<number>
    log: (message: string) => void
    env?: NodeJS.ProcessEnv
    schemaFingerprint?: () => string
  },
): Promise<number> {
  if (args.length === 1 && args[0] === "--help") {
    dependencies.log(RELEASE_RUN_HELP)
    return 0
  }
  const options = releaseRunOptions(args)
  const steps = releaseRunSteps(options)
  if (options.dryRun) {
    for (const step of steps)
      dependencies.log(`${step.label}: ${step.argv.join(" ")}`)
    return 0
  }
  const env = dependencies.env ?? process.env
  if (env.CI && env.CI !== "false" && env.CI !== "0")
    throw new Error(
      "Run release:run interactively outside CI; CI verifies application evidence only.",
    )
  const schemaFingerprint = dependencies.schemaFingerprint?.()
  for (const step of steps) {
    if (
      dependencies.schemaFingerprint &&
      dependencies.schemaFingerprint() !== schemaFingerprint
    )
      throw new Error(
        "Prisma schema changed during the release sequence. Run it again to verify the new schema locally first.",
      )
    dependencies.log(step.label)
    const code = await dependencies.execute(step)
    if (code !== 0) {
      dependencies.log(
        `${step.label} stopped with exit code ${code}; later stages were not run.`,
      )
      return code
    }
  }
  return 0
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..")
  try {
    process.exit(
      await runRelease(Bun.argv.slice(2), {
        log: console.log,
        schemaFingerprint: () => releaseRunSchemaFingerprint(root),
        execute: async (step) =>
          await Bun.spawn(step.argv, {
            cwd: root,
            env: releaseRunEnvironment(process.env),
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
          }).exited,
      }),
    )
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Release sequence failed.",
    )
    process.exit(2)
  }
}
