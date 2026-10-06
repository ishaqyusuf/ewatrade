#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const lock = JSON.parse(
  readFileSync(resolve(root, ".release/toolkit.lock.json"), "utf8"),
) as { toolkitRevision?: string }
const revision = lock.toolkitRevision
if (!revision || !/^[0-9a-f]{40}$/i.test(revision)) {
  console.error("Release toolkit lock is invalid.")
  process.exit(2)
}

const [command, ...args] = Bun.argv.slice(2)
if (command === "mobile-publish") {
  const { runAppUpdate } = await import(
    "../../local-infra-kit/src/app-update/command"
  )
  const config = (await import("../app-update.config")).default
  await runAppUpdate(["publish", ...args], { root, config })
  process.exit(0)
}
if (command === "run") {
  const result = Bun.spawnSync(
    [
      "bun",
      "--env-file=/dev/null",
      resolve(root, "scripts/release-run.ts"),
      ...args,
    ],
    {
      cwd: root,
      env: process.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  )
  process.exit(result.exitCode)
}
if (command === "status") {
  const result = Bun.spawnSync(
    [
      "bun",
      "--env-file=/dev/null",
      resolve(root, "scripts/release-status.ts"),
      ...args,
    ],
    {
      cwd: root,
      env: process.env,
      stdout: "inherit",
      stderr: "inherit",
    },
  )
  process.exit(result.exitCode)
}
if (["ci", "baselines", "collect", "mobile-source"].includes(command)) {
  const revision = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: root,
    stdout: "pipe",
    stderr: "ignore",
  })
    .stdout.toString()
    .trim()
  const forwarded = args.includes("--repo") ? args : [...args, "--repo", root]
  const result = Bun.spawnSync(
    [
      "bun",
      "--env-file=/dev/null",
      resolve(
        root,
        command === "ci"
          ? "scripts/release-verify.ts"
          : command === "baselines"
            ? "scripts/release-baselines.ts"
            : command === "collect"
              ? "scripts/release-collect.ts"
              : "scripts/release-mobile-source.ts",
      ),
      ...forwarded,
      "--revision",
      revision,
    ],
    {
      cwd: root,
      env: process.env,
      stdout: "inherit",
      stderr: "inherit",
    },
  )
  process.exit(result.exitCode)
}
const entry = resolve(root, ".release/toolkit", revision, "bin/release.ts")
const forwarded = [command ?? "", ...args]
const result = Bun.spawnSync(["bun", entry, ...forwarded], {
  cwd: root,
  env: process.env,
  stdout: "inherit",
  stderr: "inherit",
})
process.exit(result.exitCode)
