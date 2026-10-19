import { expect, test } from "bun:test"
import {
  type WhatsAppWorkflowReply,
  parseWhatsAppWorkflowRequest,
  renderWhatsAppWorkflowReply,
  whatsAppWorkflowEnabled,
  workflowConversationAppLink,
} from "./workflow"

const origin = { tenantId: "tenant", storeId: "store" }
const options = {
  actorUserId: "owner",
  currentScope: origin,
  scopeLabel: "Business · Main",
  trustedAppOrigin: "https://dash.example.test",
}
const entity = {
  key: "product:eggs",
  kind: "PRODUCT" as const,
  state: "NEEDS_INPUT" as const,
  payload: {
    kind: "product",
    name: "Eggs",
    unitName: "Piece",
    openingStock: "12.125",
    illustrationId: null,
  },
  openQuestions: [
    { field: "price", question: "What price per piece?", required: true },
  ],
  errorCode: null,
  committedRecordId: null,
}
const base: WhatsAppWorkflowReply = {
  purpose: "SETUP",
  conversationId: "saved-setup",
  ownerUserId: "owner",
  origin,
  currencyCode: "NGN",
  revision: 7,
  parts: [{ type: "text", text: "Tell me the missing price." }],
  requestText: "Draft list",
  requiresForm: false,
  entities: [entity],
}
const body = (input: unknown) =>
  renderWhatsAppWorkflowReply(input, options).chunks.join("\n")

test("workflow source gates are explicit, independently default off and forbidden in production", () => {
  expect(whatsAppWorkflowEnabled("SETUP", {})).toBe(false)
  const local = {
    APP_ENV: "local",
    NODE_ENV: "test",
    ASSISTANT_WHATSAPP_SETUP_ENABLED: "true",
  }
  expect(whatsAppWorkflowEnabled("SETUP", local)).toBe(true)
  expect(whatsAppWorkflowEnabled("PRODUCT_CREATE", local)).toBe(false)
  expect(
    whatsAppWorkflowEnabled("PRODUCT_CREATE", {
      ...local,
      ASSISTANT_WHATSAPP_PRODUCT_ENABLED: "true",
    }),
  ).toBe(true)
  expect(
    whatsAppWorkflowEnabled("SETUP", { ...local, APP_ENV: "production" }),
  ).toBe(false)
  expect(
    whatsAppWorkflowEnabled("SETUP", { ...local, NODE_ENV: "production" }),
  ).toBe(false)
  for (const purpose of ["GENERAL", "SUPPORT", "setup", "SETUP?execute=true"])
    expect(whatsAppWorkflowEnabled(purpose, local)).toBe(false)
})

test("workflow links use exact purpose-aware existing routes and original scope", () => {
  const setup = workflowConversationAppLink(base, options)
  expect(setup).toBe(
    "https://dash.example.test/assistant?setup=assistant&setupConversation=saved-setup",
  )
  const product = workflowConversationAppLink(
    { ...base, purpose: "PRODUCT_CREATE", conversationId: "saved-product" },
    options,
  )
  expect(product).toBe(
    "https://dash.example.test/catalog?catalogItem=create&catalogCreateKind=product&catalogCreateMode=chat&catalogConversation=saved-product",
  )
  expect(
    workflowConversationAppLink(
      { ...base, origin: { ...origin, storeId: "foreign" } },
      options,
    ),
  ).toBeUndefined()
  expect(
    workflowConversationAppLink(base, {
      ...options,
      trustedAppOrigin: "https://dash.example.test/redirect",
    }),
  ).toBeUndefined()
  expect(setup).not.toContain("approval")
  expect(product).not.toContain("token")
})

test("bounded draft listing preserves state/missing facts and ignores settled tool output authority", () => {
  const many = {
    ...base,
    parts: [
      ...base.parts,
      { type: "step-start" },
      {
        type: "tool-setup_get_context",
        state: "output-available",
        output: { approvalToken: "not-display-data", execute: true },
      },
    ],
    entities: Array.from({ length: 5 }, (_, index) => ({
      ...entity,
      key: `product:${index}`,
      payload: { ...entity.payload, name: `Product ${index}` },
    })),
  }
  const first = body(many)
  expect(first).toContain("Setup draft revision: 7")
  expect(first).toContain("Product 0 · PRODUCT · NEEDS_INPUT")
  expect(first).toContain("More saved drafts: Draft list page 2")
  expect(first).not.toContain("Product 4")
  expect(first).not.toContain("not-display-data")
  expect(first).toContain("If WhatsApp returns a complete confirmation review")
  expect(first).toContain("reply to that exact message")
  expect(first).toContain("If no confirmation review is issued")
  expect(first).toContain(
    "failed additions, retries and partial-success follow-up require app review",
  )
  expect(first).not.toContain("final confirmation stay in EwaTrade")
  const second = body({ ...many, requestText: "Draft list page 2" })
  expect(second).toContain("Product 4")
  expect(second).not.toContain("Product 0")
  expect(body({ ...many, requestText: "Draft list page 50" })).toContain(
    "That draft page is unavailable",
  )
  expect(parseWhatsAppWorkflowRequest("Confirm all")).toBeNull()
  expect(parseWhatsAppWorkflowRequest("Review draft product:eggs")).toEqual({
    kind: "review",
    key: "product:eggs",
  })
})

test("selected product review keeps exact saved units, variant stock and money without inferred zero", () => {
  const product = {
    ...entity,
    payload: {
      ...entity.payload,
      description: "D".repeat(500),
      priceMinor: 12501,
      sellingUnits: [
        { name: "Tray", containsQuantity: "30", priceMinor: 350000 },
      ],
      options: [{ name: "Size", values: ["Big", "Small"] }],
      variants: [
        {
          selections: [{ optionName: "Size", value: "Big" }],
          priceMinor: 12601,
          openingStock: "2.125",
          sellingUnitPrices: [{ unitName: "Tray", priceMinor: 360000 }],
          stockByUnit: [{ unitName: "Tray", quantity: "1.25" }],
        },
      ],
    },
  }
  const result = renderWhatsAppWorkflowReply(
    { ...base, requestText: "Review draft product:eggs", entities: [product] },
    options,
  )
  expect(result.kind).toBe("reply")
  const shown = result.chunks.join("\n")
  expect(shown).toContain("nothing added by this summary")
  expect(shown).toContain(
    "A draft summary, yes or proceed never confirms anything",
  )
  for (const fact of [
    "Opening stock: 12.125 Piece",
    "₦125.01",
    "30 Piece",
    "₦3,500.00",
    "Size=Big",
    "Opening stock: 2.125 Piece",
    "₦126.01",
    "₦3,600.00",
    "Entered stock: 1.25 Tray",
    "D".repeat(500),
    "Required: What price per piece?",
  ])
    expect(shown).toContain(fact)
  expect(body({ ...base, requestText: "Review draft product:eggs" })).toContain(
    "Price per Piece: Not supplied",
  )
  expect(body({ ...base, requestText: "Review draft missing" })).toContain(
    "That exact draft is unavailable",
  )
})

test("foreign owner/scope, mixed product drafts and unknown tool parts fail closed", () => {
  for (const patch of [
    { ownerUserId: "other" },
    { origin: { ...origin, tenantId: "other" } },
    { parts: [{ type: "tool-execute_all", state: "output-available" }] },
    { purpose: "GENERAL" },
    { purpose: "PRODUCT_CREATE", entities: [entity, entity] },
  ])
    expect(
      renderWhatsAppWorkflowReply({ ...base, ...patch }, options).kind,
    ).toBe("app_review")
  const product = {
    ...base,
    purpose: "PRODUCT_CREATE",
    entities: [{ ...entity, key: "product" }],
    requiresForm: true,
  }
  expect(body(product)).toContain("retains richer form details")
  expect(body(product)).toContain("catalogConversation=saved-setup")
  expect(
    body({
      ...base,
      parts: [
        { type: "text", text: "See https://untrusted.example/confirm?token=x" },
      ],
    }),
  ).not.toContain("https://untrusted.example")
})

test("oversize authorized saved drafts retain exact app continuation while unverified fallbacks have no URL", () => {
  const oversized = {
    ...base,
    parts: [{ type: "text", text: "Saved draft guidance. ".repeat(3000) }],
  }
  const result = renderWhatsAppWorkflowReply(oversized, options)
  expect(result.kind).toBe("app_review")
  expect(result.chunks).toHaveLength(1)
  expect(result.chunks[0]).toContain(
    "https://dash.example.test/assistant?setup=assistant&setupConversation=saved-setup",
  )
  expect(result.chunks[0]).toContain("Nothing was confirmed in WhatsApp.")
  expect(result.chunks[0]).not.toContain("Saved draft guidance.")
  for (const input of [
    { ...oversized, origin: { ...origin, storeId: "foreign" } },
    { ...oversized, ownerUserId: "another-owner" },
    { ...oversized, purpose: "GENERAL" },
    null,
  ]) {
    const refused = renderWhatsAppWorkflowReply(input, options)
    expect(refused.kind).toBe("app_review")
    expect(refused.chunks.join("\n")).not.toContain("https://")
    expect(refused.chunks.join("\n")).not.toContain("saved-setup")
  }
})
