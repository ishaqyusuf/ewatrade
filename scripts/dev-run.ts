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

await run(["bun", "run", "dev:prepare"])
await run(["turbo", "dev", "--parallel", ...Bun.argv.slice(2)])
