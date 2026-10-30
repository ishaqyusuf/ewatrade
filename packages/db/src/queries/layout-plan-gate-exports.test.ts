import { expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// The Dashboard shell/settings layouts need only plan readers and the launch
// gate. Their public subpaths must compile without the query barrel's
// unrelated domains. Compiles only; the output is never imported or executed.
const EXTERNAL = [
  "@prisma/client",
  "@prisma/client/*",
  "@prisma/adapter-pg",
  "pg",
  "pg-*",
  "sharp",
  "libheif-js",
  "@napi-rs/canvas",
  "pdfjs-dist",
  "pdfjs-dist/*",
  "@react-pdf/renderer",
  "@trigger.dev/*",
  "@sentry/*",
  "@opentelemetry/*",
]
const PLAN = ["getRetailOpsTenantPlanFeatures", "getRetailOpsTenantPlan"]
const GATE = ["isWebsiteDomainsLaunchApproved"]
const UNRELATED =
  /^(account-privacy|store-conversation|service-commerce|service-work|assistant-whatsapp\/|finance\/|customer-ledger\/|commercial-)/
const ALLOWED = new Set([
  "retail-ops-subscriptions.ts",
  "retail-ops-subscription-plans.ts",
  "website-domains-launch-gate.ts",
  "types.ts",
])

const resolved = (specifier: string) =>
  fileURLToPath(import.meta.resolve(specifier))
const reexport = (names: string[], path: string) =>
  `export { ${names.join(", ")} } from ${JSON.stringify(path)}\n`

async function graph(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "ewatrade-db-boundary-"))
  try {
    const entry = join(dir, "entry.ts")
    writeFileSync(entry, source)
    const result = await Bun.build({
      entrypoints: [entry],
      target: "bun",
      metafile: true,
      external: EXTERNAL,
    })
    expect(result.success).toBe(true)
    if (!result.metafile) throw new Error("Missing import graph")
    const meta: { inputs: Record<string, unknown> } =
      typeof result.metafile === "string"
        ? JSON.parse(result.metafile)
        : result.metafile
    const output = result.outputs.find((item) => item.kind === "entry-point")
    if (!output) throw new Error("Missing entry output")
    const files = Object.keys(meta.inputs).flatMap((path) => {
      const match = /packages\/db\/src\/queries\/(.+)$/.exec(path)
      return match?.[1] ? [match[1]] : []
    })
    return { files, text: await output.text() }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test("layout plan and launch-gate subpaths compile without the query barrel's unrelated domains", async () => {
  const subscriptions = resolved("@ewatrade/db/retail-ops-subscriptions")
  const gate = resolved("@ewatrade/db/website-domains-launch-gate")
  expect(subscriptions).toEndWith(
    "packages/db/src/queries/retail-ops-subscriptions.ts",
  )
  expect(gate).toEndWith(
    "packages/db/src/queries/website-domains-launch-gate.ts",
  )

  // Positive control: the same compiler and filter observe the barrel's domains.
  const barrel = await graph(
    reexport([...PLAN, ...GATE], resolved("@ewatrade/db/queries")),
  )
  expect(barrel.files).toContain("index.ts")
  expect(
    barrel.files.filter((file) => UNRELATED.test(file)).length,
  ).toBeGreaterThan(0)

  const narrow = await graph(
    reexport(PLAN, subscriptions) + reexport(GATE, gate),
  )
  expect(narrow.files).not.toContain("index.ts")
  expect(narrow.files.filter((file) => UNRELATED.test(file))).toEqual([])
  expect(narrow.files.filter((file) => !ALLOWED.has(file))).toEqual([])
  for (const file of [
    "retail-ops-subscriptions.ts",
    "retail-ops-subscription-plans.ts",
    "website-domains-launch-gate.ts",
  ])
    expect(narrow.files).toContain(file)
  for (const name of [...PLAN, ...GATE]) expect(narrow.text).toContain(name)
}, 60_000)
