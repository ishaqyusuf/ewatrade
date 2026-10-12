import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import {
  coverageDocument,
  draftImpactRecord,
  evaluateImpactGate,
  impactRecordDirectory,
  parseCoverageSnapshot,
} from "../packages/assistant/src/capabilities/impact"

// Usage:
//   bun assistant:impact                 check uncommitted work (CI: commits since origin/main)
//   bun assistant:impact --base <ref>    check everything since the merge base with <ref>
//   bun assistant:impact --draft <id>    print a starting record from machine-known rows
// Run `bun --cwd apps/api assistant:coverage --check` first: this gate reads the
// tracked coverage snapshot and trusts it to be current.
const args = process.argv.slice(2)
const option = (name: string) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const git = (...command: string[]) =>
  execFileSync("git", command, { encoding: "utf8" })
const ci = Boolean(process.env.CI)
const base = git(
  "merge-base",
  option("--base") ?? (ci ? "origin/main" : "HEAD"),
  "HEAD",
).trim()
// CI compares commits; locally the working tree and untracked files count too.
const changedPaths = [
  ...new Set(
    (ci
      ? git("diff", "--name-only", `${base}...HEAD`)
      : git("diff", "--name-only", base) +
        git("ls-files", "--others", "--exclude-standard")
    )
      .split("\n")
      .filter(Boolean),
  ),
]
const headCoverage = parseCoverageSnapshot(
  existsSync(coverageDocument) ? readFileSync(coverageDocument, "utf8") : "",
)
let baseText = ""
try {
  baseText = git("show", `${base}:${coverageDocument}`)
} catch {}
const baseCoverage = parseCoverageSnapshot(baseText)

const draftId = option("--draft")
if (args.includes("--draft")) {
  const id =
    draftId ?? `${new Date().toISOString().slice(0, 10)}-describe-the-change`
  console.log(
    JSON.stringify(
      draftImpactRecord({
        id,
        changedPaths,
        base: baseCoverage,
        head: headCoverage,
      }),
      null,
      2,
    ),
  )
  process.exit(0)
}

const records = new Map<string, unknown>()
for (const path of changedPaths) {
  if (!path.startsWith(`${impactRecordDirectory}/`) || !path.endsWith(".json"))
    continue
  if (!existsSync(path)) continue
  try {
    records.set(path, JSON.parse(readFileSync(path, "utf8")))
  } catch (error) {
    records.set(path, { invalidJson: String(error) })
  }
}
const result = evaluateImpactGate({
  changedPaths,
  records,
  base: baseCoverage,
  head: headCoverage,
  exists: (path) => existsSync(path),
  localFiles: !ci,
})
for (const note of result.notes) console.log(`note: ${note}`)
if (result.errors.length) {
  console.error(`Assistant impact gate: ${result.errors.length} problem(s)`)
  for (const error of result.errors) console.error(`- ${error}`)
  process.exit(1)
}
const areas = [...result.areas.keys()]
console.log(
  areas.length || result.records.length
    ? `Assistant impact gate passed: ${result.records.length} record(s) cover ${areas.join(", ") || "no gated area"}; ${result.changes.capabilities.size} capability and ${result.changes.procedures.size} procedure row(s) changed.`
    : "Assistant impact gate passed: no gated change.",
)
