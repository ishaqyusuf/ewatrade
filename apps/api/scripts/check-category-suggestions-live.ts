import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { prisma } from "@ewatrade/db/client"
import { CATALOG_CATEGORY_PRESETS } from "@ewatrade/utils/catalog-category-presets"
import {
  CATEGORY_SUGGESTION_CONFIG_KEY,
  readCategorySuggestionConfiguration,
} from "@ewatrade/utils/catalog-category-suggestions"
import { createCategorySuggestionProvider } from "../src/catalog/category-suggestion-provider"

// Operator smoke check: shared public vocabulary/synthetic titles only. No
// merchant Item/category writes, private business data, or credentials in evidence.
const evidencePath = resolve(
  import.meta.dir,
  "../../../.brain/artifacts/2026-10-02-catalog-category-suggestions-live.json",
)
const paths = CATALOG_CATEGORY_PRESETS.filter((root) =>
  root.itemKinds.includes("product"),
)
  .flatMap((root) => [
    { root: root.label, child: null },
    ...root.subcategories.map((child) => ({
      root: root.label,
      child: child.label,
    })),
  ])
  .map((path, index) => ({ id: `path-${index + 1}`, ...path }))

async function main() {
  if (
    process.env.DEV_PROFILE !== "local" ||
    process.env.DATABASE_PROFILE_VERIFIED !== "1"
  )
    throw new Error("Guarded local profile required")
  const row = await prisma.systemConfiguration.findUnique({
    where: { key: CATEGORY_SUGGESTION_CONFIG_KEY },
  })
  const configuration = readCategorySuggestionConfiguration(row?.value)
  if (!configuration?.enabled || configuration.provider !== "DEEPSEEK")
    throw new Error("Enabled DeepSeek config required")
  const provider = createCategorySuggestionProvider(configuration)
  if (!provider) throw new Error("DeepSeek credential unavailable")
  const cases = []
  for (const title of ["Free-range chicken eggs", "Chicken"]) {
    const started = performance.now()
    const output = await provider({
      title,
      business: {
        key: "animal-feed-agricultural-supplies",
        title: "Animal feed and agricultural supplies",
      },
      paths,
      signal: AbortSignal.timeout(12_000),
    })
    const suggestions = output.selections.map((id) =>
      paths.find((path) => path.id === id),
    )
    const valid =
      suggestions.length > 0 &&
      suggestions.length <= 3 &&
      suggestions.every((path) => path?.root === "Poultry") &&
      new Set(output.selections).size === output.selections.length
    const expected =
      title !== "Free-range chicken eggs" || suggestions[0]?.child === "Eggs"
    cases.push({
      title,
      elapsedMs: Math.round(performance.now() - started),
      suggestions,
      passed: valid && expected,
    })
  }
  const evidence = {
    checkedAt: new Date().toISOString(),
    provider: configuration.provider,
    model: configuration.model,
    configRevision: row?.revision,
    vocabularyPaths: paths.length,
    cases,
    passed: cases.every((entry) => entry.passed),
    scope:
      "Real SDK/provider and persisted config; synthetic public vocabulary. No authenticated mobile/API/save acceptance.",
  }
  await mkdir(resolve(evidencePath, ".."), { recursive: true })
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  console.info(JSON.stringify(evidence))
  if (!evidence.passed)
    throw new Error("Live category expectations were not met")
}
try {
  await main()
} catch (error) {
  console.error("Live category suggestion check failed", {
    kind: error instanceof Error ? error.name : "unknown",
  })
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
