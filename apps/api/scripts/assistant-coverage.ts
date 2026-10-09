import { readFile, writeFile } from "node:fs/promises"
import {
  buildCapabilityCoverage,
  renderCoverageMarkdown,
} from "@ewatrade/assistant/capabilities/coverage"
import {
  coverageDocumentPath,
  listRouterProcedures,
} from "../src/assistant/capability-coverage"

// Usage: `bun assistant:coverage` regenerates the Brain snapshot;
// `bun assistant:coverage --check` fails when it is stale or invalid.
const check = process.argv.includes("--check")
const { rows, errors } = buildCapabilityCoverage(await listRouterProcedures())
if (errors.length) {
  console.error(`Assistant coverage has ${errors.length} problem(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
const document = renderCoverageMarkdown(rows)
const current = await readFile(coverageDocumentPath, "utf8").catch(() => "")
if (check) {
  if (current !== document) {
    console.error(
      "Assistant coverage snapshot is stale. Run `bun --cwd apps/api assistant:coverage`.",
    )
    process.exit(1)
  }
  console.log("Assistant coverage snapshot is current.")
} else {
  await writeFile(coverageDocumentPath, document)
  console.log(`Wrote ${coverageDocumentPath}`)
}
process.exit(0)
