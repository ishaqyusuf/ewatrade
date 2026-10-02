#!/usr/bin/env bun

import { resolve } from "node:path"
import {
  type DevFilterOptions,
  type DevProfile,
  createDevRouter,
} from "../../local-infra-kit/src/dev-router"

type DevCliOptions = {
  profile: DevProfile
  filters?: DevFilterOptions
  passthroughArgs?: string[]
}

const router = createDevRouter({
  workspaceRoot: resolve(import.meta.dir, ".."),
  profileCommands: {
    local: ({ filters, passthroughArgs }) =>
      commandForProfile("local", filters, passthroughArgs),
    dev: ({ filters, passthroughArgs }) =>
      commandForProfile("dev", filters, passthroughArgs),
    preview: ({ filters, passthroughArgs }) =>
      commandForProfile("preview", filters, passthroughArgs),
    prod: ({ filters, passthroughArgs }) =>
      commandForProfile("prod", filters, passthroughArgs),
  },
})

export function parseArgs(argv: string[]): DevCliOptions {
  const { profile, filters, passthroughArgs, redisMode } =
    router.parseArgs(argv)
  if (redisMode) {
    throw new Error("EwaTrade does not support Redis dev flags.")
  }

  // Turbo does not start the mobile app's API dependency for an exact filter.
  if (
    filters?.targets.includes("@ewatrade/mobile") &&
    !filters.targets.includes("@ewatrade/api") &&
    !filters.targets.includes("!@ewatrade/api")
  ) {
    filters.targets.push("@ewatrade/api")
  }

  return {
    profile,
    ...(filters ? { filters } : {}),
    ...(passthroughArgs.length ? { passthroughArgs } : {}),
  }
}

export function commandForProfile(
  profile: DevProfile,
  filters?: DevFilterOptions,
  passthroughArgs: string[] = [],
): string[] {
  const turboFilterArgs = [
    ...(filters?.targets.flatMap((target) => ["--filter", target]) ?? []),
    ...passthroughArgs,
  ]

  switch (profile) {
    case "local":
      return [
        "node",
        "./scripts/with-workspace-env.mjs",
        "DEV_PROFILE=local",
        "EWATRADE_ENV_MODE=local",
        "bun",
        "--env-file=/dev/null",
        "../local-infra-kit/bin/dev-run.ts",
        "--profile",
        "ewatrade",
        "--",
        ...turboFilterArgs,
      ]
    case "dev":
      return [
        "node",
        "./scripts/with-workspace-env.mjs",
        "APP_ENV=dev",
        "DEV_PROFILE=dev",
        "EWATRADE_ENV_MODE=dev",
        "bun",
        "--env-file=/dev/null",
        "../local-infra-kit/bin/dev-run.ts",
        "--profile",
        "ewatrade",
        "--",
        ...turboFilterArgs,
      ]
    case "preview":
      return [
        "node",
        "./scripts/with-workspace-env.mjs",
        "APP_ENV=preview",
        "DEV_PROFILE=preview",
        "EWATRADE_ENV_MODE=preview",
        "bun",
        "--env-file=/dev/null",
        "../local-infra-kit/bin/dev-run.ts",
        "--profile",
        "ewatrade",
        "--",
        ...turboFilterArgs,
      ]
    case "prod":
      return [
        "node",
        "./scripts/with-workspace-env.mjs",
        "APP_ENV=production",
        "REQUIRE_PROD_DATABASE_URL=1",
        "turbo",
        "dev",
        "--parallel",
        ...turboFilterArgs,
      ]
  }
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2))
  const child = Bun.spawn(
    commandForProfile(
      options.profile,
      options.filters,
      options.passthroughArgs,
    ),
    {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  )

  process.exit(await child.exited)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
