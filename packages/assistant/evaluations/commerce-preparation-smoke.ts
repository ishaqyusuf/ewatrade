/** Explicit bounded extraction evaluation, synthetic data, in-memory tools only.
 * Exercises actual General instructions, draft tool schema and shared resolvers.
 * No database, channel send, provider setting or business command is invoked.
 */
import assert from "node:assert/strict"
import { createAssistantLanguageModel } from "@ewatrade/ai/provider"
import { resolveAssistantRuntimeConfiguration } from "@ewatrade/ai/runtime-config"
import { findProductTaxonomyCategory } from "@ewatrade/utils/product-taxonomy"
import { generateText, stepCountIs, tool } from "ai"
import { z } from "zod"
import { draftToolSchema } from "../../../apps/api/src/assistant/general-tools"
import {
  prepareProductCategory,
  searchProductCategories,
} from "../../../apps/api/src/assistant/product-category"
import {
  type OrderPreparationRequest,
  orderPreparationRequestSchema,
  resolveOrderPreparation,
} from "../src/general/order-preparation"
import {
  productCreateAction,
  productCreateDraft,
  productCreatePayload,
} from "../src/general/product-create"
import {
  GENERAL_PROMPT_VERSION,
  generalInstructions,
} from "../src/general/prompt"
import {
  type ServiceJobRequest,
  resolveServiceJobLines,
  serviceJobRequestSchema,
} from "../src/general/service-job-draft"
import { canonicalStatedMoneyDraft } from "../src/general/stated-money"
const config = resolveAssistantRuntimeConfiguration(null)
const model = config && createAssistantLanguageModel(config)
if (!model) throw Error("Configured model unavailable; no model calls made")
const cases = [
  {
    id: "rice",
    text: "Add MamaGold rice 50kg bags, 75000 naira per bag. We have 12 bags in stock.",
  },
  {
    id: "fan",
    text: "Add Atlas rechargeable standing fan, 35000 naira each, four in stock.",
  },
  {
    id: "paid-delivered",
    text: "New order, already paid and delivered: 10 crates of big eggs, plus a 1500 naira delivery charge.",
  },
  {
    id: "missing-shirts",
    text: "New order: 20 small blue T-shirts and 5 large red T-shirts. Packing charge 500 naira.",
  },
  {
    id: "partial-laundry",
    text: "Laundry job: 40 shirts, 10 trousers, 5 socks, all wash and iron except 5 trousers. Customer Ishaq Yusuf.",
  },
  {
    id: "generic-quote",
    text: "Prepare a haircut job for Bola: two haircuts, quote price 500 naira each.",
  },
  {
    id: "pidgin-apparel",
    text: "Abeg add polo shirts. I get 20 blue and 5 red, 3500 naira each.",
  },
  {
    id: "phone",
    text: "Add Samsung S24 Ultra, 256 gig storage and 16 gig RAM.",
  },
]
cases.push(
  {
    id: "partial-delivery",
    text: "New order: 10 crates of Big eggs. Only 3 crates have been delivered. Paid 5000 naira by bank transfer.",
  },
  {
    id: "sealed-stock",
    text: "Add eggs sold only as sealed crates of 30. We have 10 sealed crates, 6000 naira per crate. Do not open the crates or pool their stock.",
  },
)
const selectedCases = process.argv.slice(2)
const evidence: unknown[] = []
for (const scenario of cases.filter(
  (value) => !selectedCases.length || selectedCases.includes(value.id),
)) {
  let product: ReturnType<typeof productCreatePayload> | undefined
  let order: OrderPreparationRequest | undefined
  let service: ServiceJobRequest | undefined
  let firstDraftMs: number | undefined
  const started = Date.now()
  const result = await generateText({
    ...model,
    system: generalInstructions({
      businessName: "Synthetic commerce evaluation",
      storeName: "Main",
      currencyCode: "NGN",
      role: "OWNER",
      now: "Sun 25 Oct 2026, 20:00",
      timeZone: "Africa/Lagos",
    }),
    prompt: scenario.text,
    maxOutputTokens: 2600,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(60000),
    stopWhen: stepCountIs(5),
    tools: {
      searchProductCategories: tool({
        description:
          "Search full pinned product taxonomy; retrieve valid category keys and attributes.",
        inputSchema: z.object({ query: z.string() }),
        execute: ({ query }) => ({
          categories: searchProductCategories(query),
        }),
      }),
      draftAction: tool({
        description:
          "Prepare an editable product. Money the owner states uses major-unit strings; server converts. No catalog write.",
        inputSchema: draftToolSchema(productCreateAction, "Africa/Lagos"),
        execute: (input) => {
          firstDraftMs ??= Date.now() - started
          product = prepareProductCategory(
            productCreatePayload(
              productCreateDraft(
                productCreateAction.parse(canonicalStatedMoneyDraft(input)),
                "NGN",
              ),
            ),
          )
          return {
            proposalId: "synthetic-product-draft",
            revision: 1,
            status: "needs_user_confirmation",
            payload: product,
          }
        },
      }),
      prepareOrder: tool({
        description:
          "Prepare a persistent product order draft. Separate item name (Eggs/T-shirts), customer choices (Size Big/Small, Colour), selling unit and quantity. Saved facts are resolved by the server. Never guess a missing payment method. No business write.",
        inputSchema: z.object({
          request: orderPreparationRequestSchema,
          updateCurrent: z.boolean().default(false),
        }),
        execute: ({ request }) => {
          firstDraftMs ??= Date.now() - started
          order = request
          return {
            status: "card_ready",
            instruction:
              "One editable draft is shown. Reply only Ready to review and stop. No order, payment, job or stock movement is saved.",
          }
        },
      }),
      prepareServiceJob: tool({
        description:
          "Prepare an editable service job; garment/treatment, quantities, optional customer and explicitly supplied unit price. Missing price stays blank in the form. Saved prices come from the server. No writes.",
        inputSchema: serviceJobRequestSchema,
        execute: (request) => {
          firstDraftMs ??= Date.now() - started
          service = request
          return {
            status: "card_ready",
            instruction:
              "One editable draft is shown. Reply only Ready to review and stop. No order, payment, job or stock movement is saved.",
          }
        },
      }),
    },
  })
  const row = {
    case: scenario.id,
    promptVersion: GENERAL_PROMPT_VERSION,
    model: model.modelId,
    provider: model.provider,
    firstDraftMs,
    totalMs: Date.now() - started,
    text: result.text,
    product,
    order,
    service,
    usage: result.totalUsage,
  }
  evidence.push(row)
  await Bun.write(
    new URL(
      "./runs/2026-10-25-commerce-preparation-model-v6.json",
      import.meta.url,
    ),
    JSON.stringify(evidence, null, 2),
  )
  assert(
    firstDraftMs !== undefined,
    "A useful draft must be produced in the first turn",
  )
  if (["rice", "fan", "pidgin-apparel"].includes(scenario.id)) {
    assert(product, "Product expected")
    assert(product.categoryKey, "A valid category must be selected")
    assert(
      !product.categoryKey.startsWith("shopify:") ||
        findProductTaxonomyCategory(product.categoryKey),
      "Use a real taxonomy identity",
    )
    if (scenario.id === "rice")
      assert(JSON.stringify(product).includes("12"), "Keep 12 bags")
    if (scenario.id === "fan")
      assert.equal(
        product.priceMinor ?? product.variants?.[0]?.priceMinor,
        3500000,
      )
    if (scenario.id === "pidgin-apparel") {
      assert.equal(product.options?.length, 1)
      assert.deepEqual(
        product.variants
          ?.map((line) => Number(line.openingStock))
          .sort((a, b) => a - b),
        [5, 20],
      )
    }
  } else if (scenario.id === "sealed-stock") {
    assert(product)
    assert(product.reviewRequirements?.includes("sealed_stock"))
    assert.equal(product.openingStock, undefined)
    assert(
      product.variants?.every((line) => line.openingStock === undefined) ??
        true,
    )
    assert(
      product.variants?.some((line) =>
        line.stockByUnit?.some(
          (stock) => /crate/i.test(stock.unitName) && stock.quantity === "10",
        ),
      ),
      "Retain the actual sealed package count",
    )
  } else if (scenario.id === "partial-delivery") {
    assert(order)
    assert.equal(order.partialDelivery, true)
    assert.equal(order.lines[0]?.deliveredQuantity, "3")
    assert.equal(order.payment?.amount, "5000")
    assert.equal(order.payment?.method, "bank_transfer")
    assert(!order.delivered)
  } else if (scenario.id === "phone") {
    assert(product)
    assert.equal(product.options?.length, 2)
    assert.equal(product.priceMinor, undefined)
    assert.equal(product.openingStock, undefined)
  } else if (scenario.id === "paid-delivered") {
    assert(order)
    assert.equal(order.lines[0]?.quantity, "10")
    assert.equal(order.payment?.paid, true)
    assert.equal(order.payment?.method, undefined)
    assert.equal(order.delivered, true)
    assert.equal(order.extraCharges?.[0]?.amount, "1500")
    assert(order.lines[0]?.choices.some((choice) => /big/i.test(choice.value)))
  } else if (scenario.id === "missing-shirts") {
    assert(order)
    assert.deepEqual(
      order.lines.map((line) => Number(line.quantity)).sort((a, b) => a - b),
      [5, 20],
    )
    const draft = resolveOrderPreparation(
      order,
      [...new Set(order.lines.map((line) => line.name))].map((name) => ({
        name,
        complete: true,
        candidates: [],
      })),
    )
    assert(draft.lines.every((line) => line.status === "missing_item"))
    assert(order.lines.every((line) => line.disposition !== "order_only"))
  } else if (scenario.id === "partial-laundry") {
    assert(service)
    assert.equal(service.lines.length, 4)
    assert.equal(service.customerName, "Ishaq Yusuf")
    assert(
      service.lines.some(
        (line) => line.treatment === "iron_only" && line.quantity === "5",
      ),
    )
    assert(service.lines.every((line) => line.unitPrice === undefined))
    const draft = resolveServiceJobLines(service, [])
    assert.equal(draft.lines.length, 4)
    assert(draft.lines.every((line) => line.totalMinor === undefined))
  } else if (scenario.id === "generic-quote") {
    assert(service)
    assert.equal(service.lines[0]?.quantity, "2")
    assert.equal(service.lines[0]?.unitPrice, "500")
    assert.equal(service.customerName, "Bola")
  }
  assert(
    !/\?/.test(result.text),
    "The prepared examples do not need another question",
  )
  console.log(
    JSON.stringify({
      case: scenario.id,
      pass: true,
      firstDraftMs,
      totalMs: Date.now() - started,
    }),
  )
}
