import { expect, test } from "bun:test"
import type { ProductFormSnapshot } from "../product/contracts"
import { productAssistantInstructions } from "../product/contracts"
import { whatsAppReplyChoiceButtons } from "./reply-choices"
import {
  type WhatsAppWorkflowReply,
  renderWhatsAppWorkflowReply,
  whatsAppWorkflowReviewSuggestion,
} from "./workflow"
import {
  type WhatsAppWorkflowActionReview,
  parseWhatsAppWorkflowReviewSelection,
  renderWhatsAppWorkflowActionReviewBody,
  whatsAppProductPhotoCards,
  whatsAppWorkflowActionButtonTitles,
  whatsAppWorkflowActionSourceSchema,
  whatsAppWorkflowReviewAppOnly,
} from "./workflow-action-review"

const origin = { tenantId: "tenant", storeId: "store" }
const options = {
  actorUserId: "owner",
  currentScope: origin,
  scopeLabel: "Mama Ada Provisions · Yaba Main",
  trustedAppOrigin: "https://dash.example.test",
}
const product = (key: string, name: string, priceMinor = 890000) => ({
  key,
  kind: "PRODUCT" as const,
  state: "PROPOSED" as const,
  payload: {
    kind: "product",
    name,
    unitName: "bottle",
    priceMinor,
    openingStock: "12",
    illustrationId: null,
  },
  openQuestions: [],
  errorCode: null,
  committedRecordId: null,
})
const account = (key: string, name: string) => ({
  key,
  kind: "MONEY_ACCOUNT" as const,
  state: "PROPOSED" as const,
  payload: { kind: "money_account", name, purpose: "CASH" },
  openQuestions: [],
  errorCode: null,
  committedRecordId: null,
})
const setup: WhatsAppWorkflowReply = {
  purpose: "SETUP",
  conversationId: "saved-setup",
  ownerUserId: "owner",
  origin,
  currencyCode: "NGN",
  revision: 3,
  parts: [{ type: "text", text: "Here is your setup list." }],
  requestText: "add these",
  requiresForm: false,
  entities: [
    account("money:cash-till", "Cash till"),
    product("product:groundnut-oil", "Groundnut Oil 3L"),
    product("product:brown-beans", "Brown Beans", 190000),
    product("product:ofada-rice", "Ofada Rice 5kg", 1100000),
  ],
}

test("a Setup reply suggests, never starts: one button equal to the typed Review drafts command", () => {
  const rendered = renderWhatsAppWorkflowReply(setup, options)
  expect(rendered.version).toBe("whatsapp-workflow-v3")
  expect(rendered.choices).toEqual([
    {
      title: "Review 3 drafts",
      text: "Review drafts product:groundnut-oil, product:brown-beans, product:ofada-rice",
    },
  ])
  const shown = rendered.chunks.join("\n")
  expect(shown).toContain(
    "Ready to review: Groundnut Oil 3L, Brown Beans, Ofada Rice 5kg.",
  )
  expect(shown).toContain(
    "Tap Review 3 drafts, or send: Review drafts product:groundnut-oil, product:brown-beans, product:ofada-rice",
  )
  expect(shown).toContain("Money accounts are confirmed in EwaTrade.")
  expect(shown).not.toContain("Assistant draft guidance:")
  // The button text is exactly the typed command for exactly those keys.
  expect(
    parseWhatsAppWorkflowReviewSelection(rendered.choices?.[0]?.text),
  ).toEqual({
    kind: "review_selection",
    keys: [
      "product:groundnut-oil",
      "product:brown-beans",
      "product:ofada-rice",
    ],
  })
  const buttons = whatsAppReplyChoiceButtons("outbox_1", rendered.choices ?? [])
  expect(buttons).toEqual([
    { id: "wa-reply:outbox_1:1", title: "Review 3 drafts" },
  ])
  // Money accounts are never part of a chat review selection.
  expect(rendered.choices?.[0]?.text).not.toContain("money:")
})

test("more than three ready drafts name the first three and say how to choose others", () => {
  const rendered = renderWhatsAppWorkflowReply(
    {
      ...setup,
      entities: [
        ...setup.entities,
        product("product:palm-oil", "Palm Oil 1L", 250000),
      ],
    },
    options,
  )
  expect(rendered.choices?.[0]?.title).toBe("Review 3 drafts")
  expect(rendered.choices?.[0]?.text).not.toContain("palm-oil")
  expect(rendered.chunks.join("\n")).toContain(
    "1 more ready. To choose others, send Review drafts with up to 3 draft keys.",
  )
})

test("no button when nothing is ready, for an exact single review, or for an older renderer", () => {
  const incomplete = {
    ...product("product:eggs", "Eggs"),
    state: "NEEDS_INPUT" as const,
    openQuestions: [
      { field: "price", question: "What price per piece?", required: true },
    ],
  }
  const none = renderWhatsAppWorkflowReply(
    { ...setup, entities: [account("money:till", "Till"), incomplete] },
    options,
  )
  expect(none.kind).toBe("reply")
  expect(none.choices).toBeUndefined()
  expect(none.chunks.join("\n")).toContain(
    "To review, send Review drafts with up to 3 draft keys.",
  )
  expect(
    renderWhatsAppWorkflowReply(
      { ...setup, requestText: "Review draft product:brown-beans" },
      options,
    ).choices,
  ).toBeUndefined()
  expect(
    renderWhatsAppWorkflowReply(setup, {
      ...options,
      rendererVersion: "whatsapp-workflow-v2",
    }).choices,
  ).toBeUndefined()
  expect(
    whatsAppWorkflowReviewSuggestion(
      [{ ...product("product:a", "A"), committedRecordId: "saved" }],
      "SETUP",
    ),
  ).toBeUndefined()
})

test("one ready draft uses a singular title", () => {
  const rendered = renderWhatsAppWorkflowReply(
    {
      ...setup,
      entities: [product("product:groundnut-oil", "Groundnut Oil 3L")],
    },
    options,
  )
  expect(rendered.choices).toEqual([
    { title: "Review draft", text: "Review drafts product:groundnut-oil" },
  ])
})

test("a Product reply suggests reviewing up to three drafts together", () => {
  const productReply: WhatsAppWorkflowReply = {
    ...setup,
    purpose: "PRODUCT_CREATE",
    conversationId: "saved-product",
    entities: [
      product("product", "Groundnut Oil 3L"),
      product("product-2", "Brown Beans", 190000),
      product("product-3", "Ofada Rice 5kg", 1100000),
    ],
  }
  const rendered = renderWhatsAppWorkflowReply(productReply, options)
  expect(rendered.kind).toBe("reply")
  expect(rendered.choices).toEqual([
    {
      title: "Review 3 drafts",
      text: "Review drafts product, product-2, product-3",
    },
  ])
  expect(rendered.chunks.join("\n")).not.toContain("Money accounts")
  for (const entities of [
    [...productReply.entities, product("product-51", "Extra")],
    [product("product:other", "Other")],
  ])
    expect(
      renderWhatsAppWorkflowReply({ ...productReply, entities }, options).kind,
    ).toBe("app_review")
})

const snapshot: ProductFormSnapshot = {
  form: {
    kind: "product",
    name: "",
    description: "",
    unitName: "",
    price: "",
    openingStockQuantity: "",
    usage: "FOR_SALE",
  },
  storeId: "store",
  category: "",
  illustrationId: null,
  photoAssetIds: [],
  sku: "",
  barcode: "",
  showAdvanced: false,
  showUnits: false,
  showDescription: false,
  showOpeningStock: false,
  selectedHelperKey: null,
  canonicalTransactionScale: 2,
  optionGroups: [],
  variantDrafts: {},
  additionalUnits: [],
}
const selected = (index: number, key: string) => ({
  entityId: `entity-${index}`,
  key,
  state: "PROPOSED" as const,
  payloadHash: String(index).repeat(64),
  commandHash: "d".repeat(64),
})
function productReview(count: number): WhatsAppWorkflowActionReview {
  const names = ["Groundnut Oil 3L", "Brown Beans", "Ofada Rice 5kg"]
  const keys = ["product", "product-2", "product-3"]
  const selection = keys
    .slice(0, count)
    .map((key, index) => selected(index, key))
  return {
    source: {
      version: "workflow-action-v1",
      purpose: "PRODUCT_CREATE",
      conversationId: "saved-product",
      draftId: "saved-draft",
      draftRevision: 4,
      origin,
      workflowContextHash: "e".repeat(64),
      selection,
    },
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
    currencyCode: "NGN",
    expiresAt: "2026-11-03T19:24:00.000Z",
    productSnapshot: snapshot,
    records: selection.map((source, index) => ({
      ...source,
      payload: {
        kind: "product" as const,
        name: names[index] ?? "",
        unitName: "bag",
        priceMinor: [890000, 190000, 1100000][index],
        openingStock: ["12", "50", "8"][index],
        illustrationId: null,
      },
      openQuestions: [],
      errorCode: null,
      committedRecordId: null,
    })),
  }
}
const now = Date.parse("2026-11-03T19:19:00.000Z")

test("Product mode reviews up to three products in one Save all 3 review", () => {
  const review = productReview(3)
  const rendered = renderWhatsAppWorkflowActionReviewBody(review, { now })
  expect(rendered.kind).toBe("review")
  expect(rendered.body).toContain("🧾 *3 product drafts*")
  expect(rendered.body).toContain(
    "3. *Ofada Rice 5kg* · ₦11,000 per bag · 8 in stock",
  )
  expect(rendered.body).toContain("_To change one, send the fix by name.")
  expect(whatsAppWorkflowActionButtonTitles(review.source)).toEqual({
    confirm: "Save all 3",
    cancel: "Cancel",
  })
  expect(
    whatsAppWorkflowActionButtonTitles(productReview(1).source).confirm,
  ).toBe("Save product")
  expect(
    whatsAppWorkflowActionSourceSchema.safeParse({
      ...review.source,
      selection: [selected(0, "product:oil")],
    }).success,
  ).toBe(false)
  expect(
    whatsAppWorkflowActionSourceSchema.safeParse({
      ...review.source,
      selection: [...review.source.selection, selected(4, "product-4")],
    }).success,
  ).toBe(false)
  // A product that needs the richer form keeps the whole review in the app.
  const rich = productReview(2)
  const second = rich.records[1]
  if (!second || second.payload.kind !== "product") throw Error("fixture")
  rich.records[1] = {
    ...second,
    payload: { ...second.payload, options: [{ name: "Size", values: ["S"] }] },
  }
  expect(renderWhatsAppWorkflowActionReviewBody(rich, { now }).kind).toBe(
    "app_review",
  )
})

test("Setup review lists money accounts on their own line with the app link, never as a choice", () => {
  const appOnly = whatsAppWorkflowReviewAppOnly(
    {
      purpose: "SETUP",
      conversationId: "saved-setup",
      origin,
      entities: [
        account("money:cash-till", "Cash till"),
        { ...account("money:gtbank", "GTBank"), kind: "MONEY_ACCOUNT" },
        {
          ...account("money:old", "Old"),
          committedRecordId: "already-saved",
        },
      ],
    },
    { trustedAppOrigin: "https://dash.example.test", currentScope: origin },
  )
  expect(appOnly).toEqual({
    moneyAccounts: ["Cash till", "GTBank"],
    link: "https://dash.example.test/assistant?setup=assistant&setupConversation=saved-setup",
  })
  const customer = {
    entityId: "entity",
    key: "customer:amina",
    state: "PROPOSED" as const,
    payloadHash: "c".repeat(64),
    commandHash: "d".repeat(64),
  }
  const review: WhatsAppWorkflowActionReview = {
    source: {
      version: "workflow-action-v1",
      purpose: "SETUP",
      conversationId: "saved-setup",
      draftId: "saved-draft",
      draftRevision: 7,
      origin,
      workflowContextHash: null,
      selection: [customer],
    },
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
    currencyCode: "NGN",
    expiresAt: "2026-11-03T19:24:00.000Z",
    records: [
      {
        ...customer,
        payload: { kind: "customer", name: "Amina" },
        openQuestions: [],
        errorCode: null,
        committedRecordId: null,
      },
    ],
    ...(appOnly ? { appOnly } : {}),
  }
  const rendered = renderWhatsAppWorkflowActionReviewBody(review, { now })
  expect(rendered.kind).toBe("review")
  expect(rendered.body).toEndWith(
    "\n\nMoney accounts: Cash till, GTBank — confirm these in EwaTrade\nhttps://dash.example.test/assistant?setup=assistant&setupConversation=saved-setup",
  )
  // Without accounts, the review is exactly as before.
  const { appOnly: _, ...plain } = review
  expect(
    renderWhatsAppWorkflowActionReviewBody(plain, { now }).body,
  ).not.toContain("Money accounts")
  expect(
    whatsAppWorkflowReviewAppOnly(
      { purpose: "PRODUCT_CREATE", conversationId: "p", origin, entities: [] },
      { trustedAppOrigin: "https://dash.example.test", currentScope: origin },
    ),
  ).toBeUndefined()
})

test("the app's Product prompt is unchanged; WhatsApp may hold up to 50", () => {
  const app = productAssistantInstructions({ currencyCode: "NGN" })
  expect(app).toStartWith("You help the owner add exactly one product.")
  expect(
    productAssistantInstructions({ currencyCode: "NGN" }, { maxProducts: 1 }),
  ).toBe(app)
  const channel = productAssistantInstructions(
    { currencyCode: "NGN" },
    { maxProducts: 50 },
  )
  expect(channel).toContain("up to 50 products")
  expect(channel).toContain("up to product-50")
  expect(channel).toContain("Saved products are final")
  expect(channel).toContain("originals that nobody reads")
})

test("a Product chat lists only open drafts after its saved count", () => {
  const entities = [
    { ...product("product", "Groundnut Oil 3L"), state: "COMMITTED" },
    product("product-2", "Brown Beans", 190000),
  ]
  const rendered = renderWhatsAppWorkflowReply(
    {
      ...setup,
      purpose: "PRODUCT_CREATE",
      conversationId: "saved-product",
      entities,
    },
    options,
  )
  const body = rendered.chunks.join("\n")
  expect(body).toContain("1 of 50 products saved in this chat.")
  expect(body).toContain("Brown Beans")
  expect(body).not.toContain("Groundnut Oil 3L")
})

function richReview(
  payload: WhatsAppWorkflowActionReview["records"][number]["payload"],
  photo?: "added" | "skipped",
): WhatsAppWorkflowActionReview {
  const review = productReview(1)
  const [record] = review.records
  if (!record) throw Error("missing record")
  return {
    ...review,
    records: [{ ...record, payload, ...(photo ? { photo } : {}) }],
  }
}

test("Product mode reviews options, packs and the sent photo row by row", () => {
  const rendered = renderWhatsAppWorkflowActionReviewBody(
    richReview(
      {
        kind: "product",
        name: "Oud Royal",
        unitName: "bottle",
        illustrationId: null,
        photoAttachmentId: "photo-1",
        options: [{ name: "Volume", values: ["50ml", "100ml"] }],
        variants: [
          {
            selections: [{ optionName: "Volume", value: "50ml" }],
            priceMinor: 4500000,
            openingStock: "6",
          },
          {
            selections: [{ optionName: "Volume", value: "100ml" }],
            priceMinor: 8000000,
            openingStock: "4",
          },
        ],
      },
      "added",
    ),
    { now },
  )
  expect(rendered.kind).toBe("review")
  expect(rendered.body).toContain("*Oud Royal* · with your photo")
  expect(rendered.body).toContain("- 50ml · ₦45,000 per bottle · 6 in stock")
  expect(rendered.body).toContain("- 100ml · ₦80,000 per bottle · 4 in stock")
})

test("Product mode shows pack prices and a photo that cannot be added", () => {
  const rendered = renderWhatsAppWorkflowActionReviewBody(
    richReview(
      {
        kind: "product",
        name: "Oraimo 20W Charger",
        unitName: "piece",
        priceMinor: 650000,
        openingStock: "40",
        illustrationId: null,
        photoAttachmentId: "photo-2",
        sellingUnits: [
          { name: "carton", containsQuantity: "20", priceMinor: 12000000 },
        ],
      },
      "skipped",
    ),
    { now },
  )
  expect(rendered.kind).toBe("review")
  expect(rendered.body).toContain(
    "*Oraimo 20W Charger* · ₦6,500 per piece · ₦120,000 per carton of 20 · 40 in stock · photo can't be added here",
  )
})

test("Product mode refuses an unbound photo and more than 10 option rows", () => {
  const photo = richReview({
    kind: "product",
    name: "Silver Ring",
    unitName: "piece",
    priceMinor: 1500000,
    illustrationId: null,
    photoAttachmentId: "photo-3",
  })
  expect(renderWhatsAppWorkflowActionReviewBody(photo, { now }).kind).toBe(
    "app_review",
  )
  const big = richReview({
    kind: "product",
    name: "Classic Watch",
    unitName: "piece",
    priceMinor: 2500000,
    illustrationId: null,
    options: [
      {
        name: "Colour",
        values: ["Black", "Gold", "Silver", "Rose", "Blue", "Green"],
      },
      { name: "Strap", values: ["S", "M", "L"] },
    ],
  })
  expect(renderWhatsAppWorkflowActionReviewBody(big, { now }).kind).toBe(
    "app_review",
  )
})

test("photo cards caption each product whose photo will be saved, in review order", () => {
  const review = richReview(
    {
      kind: "product",
      name: "Silver Ring",
      unitName: "piece",
      priceMinor: 1500000,
      openingStock: "5",
      illustrationId: null,
      photoAttachmentId: "photo-ring",
    },
    "added",
  )
  expect(whatsAppProductPhotoCards(review)).toEqual([
    {
      attachmentId: "photo-ring",
      caption:
        "*Silver Ring* · ₦15,000 per piece · 5 in stock · with your photo",
    },
  ])
  const [record] = review.records
  if (!record) throw Error("missing record")
  expect(
    whatsAppProductPhotoCards({
      ...review,
      records: [{ ...record, photo: "skipped" }],
    }),
  ).toEqual([])
})
