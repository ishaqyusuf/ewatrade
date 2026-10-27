/** Explicit bounded live-model check. Synthetic facts; draft tools write only to memory.
 * Run with the normal workspace env loader; no DB, catalog, channel or provider setting writes.
 */
import assert from "node:assert/strict"
import { createAssistantLanguageModel } from "@ewatrade/ai/provider"
import { resolveAssistantRuntimeConfiguration } from "@ewatrade/ai/runtime-config"
import { generateText, stepCountIs } from "ai"
import { productAssistantInstructions } from "../src/product/contracts"
import { setupProductPayloadSchema } from "../src/setup/contracts"
import { buildSetupAssistantInstructions } from "../src/setup/prompt"
import {
  type SetupDraftEntityWrite,
  createSetupAssistantTools,
} from "../src/setup/tools"
import { setupProductVariants } from "../src/setup/variants"
const config = resolveAssistantRuntimeConfiguration(null)
const model = config && createAssistantLanguageModel(config)
if (!model) throw Error("Assistant model unavailable; no calls made")
const context = {
  businessName: "Product preparation fixture",
  storeName: "Main",
  businessProfile: null,
  operatingModel: "products",
  currencyCode: "NGN",
  countryCode: "NG",
  existing: { catalogItems: 0, customers: 0 },
}
const cases = [
  {
    id: "eggs",
    prompt:
      "Add eggs to my goods. We sell big and small eggs individually, in crates and cartons. Big eggs cost 200 naira each; small eggs 100 each. A crate of big eggs costs 6000; a crate of small eggs 5500. A carton contains 12 crates. We have 200 cartons of big eggs and 100 cartons of small eggs, plus 10 crates of big and 10 crates of small eggs.",
  },
  {
    id: "phone",
    prompt: "Add Samsung S24 Ultra, 256 gig storage and 16 gig RAM.",
  },
  {
    id: "shirts",
    prompt: "Add T-shirts. We have 30 blue and 50 red available.",
  },
]
const results: unknown[] = []
for (const mode of ["focused", "setup"] as const) {
  for (const scenario of cases) {
    let rows: SetupDraftEntityWrite[] = []
    let firstDraftMs: number | undefined
    const start = Date.now()
    const tools = createSetupAssistantTools({
      productOnly: mode === "focused",
      context,
      sourceMessageId: "fixture",
      readDraft: async () => rows,
      writeEntities: async (next) => {
        firstDraftMs ??= Date.now() - start
        rows = next
        return {
          revision: 1,
          changed: rows.map((row) => row.key),
          rejected: [],
        }
      },
      removeEntities: async () => {
        throw Error("Unexpected removal")
      },
    })
    const result = await generateText({
      ...model,
      system:
        mode === "focused"
          ? productAssistantInstructions(context)
          : buildSetupAssistantInstructions(context),
      prompt: scenario.prompt,
      tools,
      stopWhen: stepCountIs(5),
      maxOutputTokens: 2600,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60000),
    })
    assert.equal(
      rows.length,
      1,
      "One useful draft must be staged in the first turn",
    )
    const payload = setupProductPayloadSchema.parse(rows[0]?.payload)
    const variants = setupProductVariants(payload)
    const evidence = {
      mode,
      case: scenario.id,
      provider: model.provider,
      model: model.modelId,
      firstDraftMs,
      totalMs: Date.now() - start,
      toolSteps: result.steps.length,
      text: result.text,
      payload,
      usage: result.totalUsage,
    }
    results.push(evidence)
    await Bun.write(
      new URL(
        "./runs/2026-10-25-product-preparation-model-v2.json",
        import.meta.url,
      ),
      JSON.stringify(results, null, 2),
    )
    if (scenario.id === "eggs") {
      assert.deepEqual(
        variants.map((row) => Number(row.openingStock)).sort((a, b) => a - b),
        [36300, 72300],
      )
      assert.deepEqual(
        variants
          .map(
            (row) =>
              row.sellingUnits.find((unit) => /crate/i.test(unit.name))
                ?.priceMinor,
          )
          .sort(),
        [550000, 600000],
      )
      assert.equal(payload.categoryKey, "poultry:eggs")
      assert(
        !/\?/.test(result.text),
        "No clarification question is needed for the complete egg description",
      )
    } else if (scenario.id === "phone") {
      assert.equal(variants.length, 1)
      assert.equal(payload.options?.length, 2)
      assert(
        payload.options?.some((group) =>
          group.values.some((value) => /256/.test(value)),
        ),
      )
      assert(
        payload.options?.some((group) =>
          group.values.some((value) => /16/.test(value)),
        ),
      )
      assert.equal(variants[0]?.openingStock, undefined)
      assert.equal(variants[0]?.priceMinor, undefined)
      assert.equal(payload.categoryKey, "electronics:phones")
    } else {
      assert.equal(payload.options?.length, 1)
      assert.deepEqual(
        variants.map((row) => Number(row.openingStock)).sort((a, b) => a - b),
        [30, 50],
      )
      assert(variants.every((row) => row.priceMinor === undefined))
      assert.equal(payload.categoryKey, "clothing:t-shirts")
    }
    console.log(
      JSON.stringify({
        mode,
        case: scenario.id,
        firstDraftMs,
        totalMs: Date.now() - start,
        pass: true,
      }),
    )
  }
}
