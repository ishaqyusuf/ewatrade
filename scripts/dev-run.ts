#!/usr/bin/env bun

async function run(command: string[]) {
  const child = Bun.spawn(command, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await child.exited

  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

const profile = process.env.DEV_PROFILE ?? "local"
const profileFlag = profile === "production" ? "--prod" : `--${profile}`

await run(["bun", "run", "kill:ports"])
await run(["bun", "run", "db:start", "--mode", profile])
await run(["bun", "run", "db:generate", profileFlag])
await run(["bun", "run", "--cwd", "packages/db", "db:migrate:deploy"])
await run(["turbo", "dev", "--parallel", ...Bun.argv.slice(2)])
