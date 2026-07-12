import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const TYPECHECKS = [
  {
    args: ["--cwd", "apps/mobile", "tsc", "--noEmit", "--pretty", "false"],
    label: "Mobile app",
  },
  {
    args: ["--filter", "@ewatrade/api", "typecheck"],
    label: "API package",
  },
  {
    args: ["--filter", "@ewatrade/storefront", "typecheck"],
    label: "Storefront app",
  },
  {
    args: ["--filter", "@ewatrade/db", "typecheck"],
    label: "Database package",
  },
  {
    args: ["--filter", "@ewatrade/utils", "typecheck"],
    label: "Utilities package",
  },
  {
    args: ["--filter", "@ewatrade/notifications", "typecheck"],
    label: "Notifications package",
  },
  {
    args: ["--filter", "@ewatrade/email", "typecheck"],
    label: "Email package",
  },
  {
    args: ["--filter", "@ewatrade/jobs", "typecheck"],
    label: "Jobs package",
  },
]

for (const check of TYPECHECKS) {
  console.log(`\n== ${check.label} typecheck ==`)

  const result = spawnSync("bun", check.args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log("\nMobile MVP typechecks passed.")
