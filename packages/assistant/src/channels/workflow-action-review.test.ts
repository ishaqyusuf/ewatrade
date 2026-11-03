import { expect, test } from "bun:test"
import type { ProductFormSnapshot } from "../product/contracts"
import {
  type WhatsAppWorkflowActionReview,
  appendWhatsAppWorkflowActionInstructions,
  parseWhatsAppTypedWorkflowAction,
  parseWhatsAppWorkflowActionButton,
  parseWhatsAppWorkflowReviewSelection,
  renderWhatsAppWorkflowActionReviewBody,
  whatsAppWorkflowActionButtonId,
  whatsAppWorkflowActionButtonTitles,
  whatsAppWorkflowActionSourceSchema,
} from "./workflow-action-review"

const now = Date.parse("2026-10-15T12:00:00.000Z")
const codes = { confirmCode: "a".repeat(43), cancelCode: "b".repeat(43) }
const selected = {
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
    origin: { tenantId: "tenant", storeId: "store" },
    workflowContextHash: null,
    selection: [selected],
  },
  businessName: "Original business",
  storeName: "Original Store",
  currencyCode: "NGN",
  expiresAt: "2026-10-15T12:05:00.000Z",
  records: [
    {
      ...selected,
      payload: {
        kind: "customer",
        name: "Amina",
        phone: "08030000000",
        email: "amina@example.test",
      },
      openQuestions: [],
      errorCode: null,
      committedRecordId: null,
    },
  ],
}
const render = (input: unknown) =>
  renderWhatsAppWorkflowActionReviewBody(input, { now })

test("review selection names only exact bounded keys, never an implicit all-record batch", () => {
  expect(
    parseWhatsAppWorkflowReviewSelection("Review draft customer:amina"),
  ).toEqual({ kind: "review_selection", keys: ["customer:amina"] })
  expect(
    parseWhatsAppWorkflowReviewSelection(
      "Review drafts product:eggs, customer:amina",
    ),
  ).toEqual({
    kind: "review_selection",
    keys: ["product:eggs", "customer:amina"],
  })
  for (const value of [
    "Review draft all",
    "Review drafts *",
    "Review draft a,b",
    "Review drafts a,a",
    "Review drafts a,b,c,d",
    "Review drafts a,",
    "Review draft",
    "Review draft a then confirm",
  ])
    expect(parseWhatsAppWorkflowReviewSelection(value)).toEqual({
      kind: "invalid_workflow_selection",
    })
  expect(parseWhatsAppWorkflowReviewSelection("Add everything")).toBeNull()
})
const productSnapshot: ProductFormSnapshot = {
  form: {
    kind: "product",
    name: "Eggs",
    description: "Large",
    unitName: "Piece",
    price: "125.01",
    openingStockQuantity: "12.12",
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
  showDescription: true,
  showOpeningStock: true,
  selectedHelperKey: null,
  canonicalTransactionScale: 2,
  optionGroups: [],
  variantDrafts: {},
  additionalUnits: [],
}
function productReview(): WhatsAppWorkflowActionReview {
  const product = { ...selected, key: "product" }
  return {
    ...review,
    source: {
      ...review.source,
      purpose: "PRODUCT_CREATE",
      workflowContextHash: "e".repeat(64),
      selection: [product],
    },
    productSnapshot,
    records: [
      {
        ...product,
        payload: {
          kind: "product",
          name: "Eggs",
          description: "Large",
          unitName: "Piece",
          priceMinor: 12501,
          openingStock: "12.12",
          illustrationId: null,
        },
        openQuestions: [],
        errorCode: null,
        committedRecordId: null,
      },
    ],
  }
}

test("canonical exact selected review body has no raw code and dispatch instructions are ephemeral", () => {
  const body = render(review)
  expect(body.kind).toBe("review")
  for (const value of [
    "🧾 *Customer draft*",
    "*Amina* · customer · 08030000000 · amina@example.test",
    "Original business · Original Store",
    "Only this one will be saved; other drafts stay as drafts.",
    "Nothing is saved until you confirm.",
    "This review expires 12:05 UTC.",
  ])
    expect(body.body).toContain(value)
  expect(body.body).not.toContain(codes.confirmCode)
  expect(body.body).not.toContain(codes.cancelCode)
  const saved = JSON.stringify(body)
  const dispatch = appendWhatsAppWorkflowActionInstructions(body, codes)
  expect(dispatch.kind).toBe("review")
  expect(dispatch.body).toContain(`\`Confirm setup ${codes.confirmCode}\``)
  expect(dispatch.body).toContain(`\`Cancel setup ${codes.cancelCode}\``)
  expect(JSON.stringify(body)).toBe(saved)
  expect(
    appendWhatsAppWorkflowActionInstructions(body, {
      ...codes,
      cancelCode: codes.confirmCode,
    }).kind,
  ).toBe("app_review")
  expect(
    whatsAppWorkflowActionSourceSchema.safeParse({
      ...review.source,
      approvalToken: "forbidden",
    }).success,
  ).toBe(false)
})

test("source binds exact entities/keys/current states/payloads/commands without bulk or duplicate selection", () => {
  for (const source of [
    { ...review.source, selection: [] },
    { ...review.source, selection: [selected, selected] },
    {
      ...review.source,
      selection: Array.from({ length: 4 }, (_, index) => ({
        ...selected,
        entityId: `e${index}`,
        key: `key${index}`,
      })),
    },
    { ...review.source, selection: [{ ...selected, entityId: "other" }] },
    {
      ...review.source,
      selection: [{ ...selected, payloadHash: "f".repeat(64) }],
    },
    {
      ...review.source,
      selection: [{ ...selected, commandHash: "f".repeat(64) }],
    },
    { ...review.source, selection: [{ ...selected, state: "CONFIRMED" }] },
  ])
    expect(render({ ...review, source }).kind).toBe("app_review")
  expect(
    render({
      ...review,
      records: [{ ...review.records[0], errorCode: "COMMIT_FAILED" }],
    }).kind,
  ).toBe("app_review")
  expect(
    render({
      ...review,
      records: [{ ...review.records[0], committedRecordId: "already-saved" }],
    }).kind,
  ).toBe("app_review")
})

test("simple Product review preserves canonical price/unit/stock and exact form scope", () => {
  const product = productReview()
  const body = render(product)
  expect(body.kind).toBe("review")
  expect(body.body).toContain("🧾 *Product draft*")
  expect(body.body).toContain("*Eggs* · ₦125.01 per Piece · 12.12 in stock")
  expect(body.body).toContain("\n- Description: Large\n")
  expect(body.body).toContain(
    "_Stock goes to Original Store. Nothing is saved until you confirm._",
  )
  expect(body.body).not.toContain("other drafts")
  expect(appendWhatsAppWorkflowActionInstructions(body, codes).body).toContain(
    `Confirm product ${codes.confirmCode}`,
  )
  expect(
    render({
      ...product,
      productSnapshot: { ...productSnapshot, storeId: "foreign" },
    }).kind,
  ).toBe("app_review")
  expect(render({ ...product, productSnapshot: undefined }).kind).toBe(
    "app_review",
  )
  expect(
    render({ ...product, productSnapshot: { ...productSnapshot, sku: "RICH" } })
      .kind,
  ).toBe("app_review")
  expect(
    render({
      ...product,
      productSnapshot: { ...productSnapshot, photoAssetIds: ["private-photo"] },
    }).kind,
  ).toBe("app_review")
  const record = product.records[0]
  if (!record || record.payload.kind !== "product")
    throw Error("Product fixture missing")
  expect(
    render({
      ...product,
      records: [
        { ...record, payload: { ...record.payload, openingStock: "12.125" } },
      ],
    }).kind,
  ).toBe("app_review")
  expect(
    render({
      ...product,
      records: [
        { ...record, payload: { ...record.payload, openingStock: undefined } },
      ],
    }).body,
  ).toContain("*Eggs* · ₦125.01 per Piece · no opening stock")
})

test("incomplete, rich, media, opening balance and finance selections remain app review", () => {
  const first = review.records[0]
  for (const payload of [
    {
      kind: "customer",
      name: "Amina",
      opening: { direction: "owes_business", amountMinor: 5000 },
    },
    {
      kind: "money_account",
      name: "Cash",
      purpose: "CASH",
      openingBalanceMinor: 0,
    },
    { kind: "product", name: "Eggs", unitName: "Piece", illustrationId: null },
    {
      kind: "product",
      name: "Eggs",
      unitName: "Piece",
      priceMinor: 100,
      photoAttachmentId: "photo",
    },
    {
      kind: "product",
      name: "Eggs",
      unitName: "Piece",
      priceMinor: 100,
      sellingUnits: [
        { name: "Tray", containsQuantity: "30", priceMinor: 2500 },
      ],
    },
    { kind: "service", name: "Laundry", pricing: "quote", priceMinor: 100 },
    {
      kind: "service",
      name: "Laundry",
      pricing: "fixed",
      priceMinor: 100,
      categoryKey: "unresolved",
    },
  ])
    expect(render({ ...review, records: [{ ...first, payload }] }).kind).toBe(
      "app_review",
    )
  expect(
    render({
      ...review,
      records: [
        {
          ...first,
          openQuestions: [
            { field: "other", question: "Missing fact?", required: true },
          ],
        },
      ],
    }).kind,
  ).toBe("app_review")
  expect(render({ ...review, businessName: "Original…" }).kind).toBe(
    "app_review",
  )
  expect(
    renderWhatsAppWorkflowActionReviewBody(review, { now, maxUnits: 600 }).kind,
  ).toBe("app_review")
  expect(
    renderWhatsAppWorkflowActionReviewBody(review, {
      now: Date.parse(review.expiresAt),
    }).kind,
  ).toBe("app_review")
  expect(
    render({
      ...review,
      records: [
        {
          ...first,
          payload: {
            kind: "service",
            name: "Laundry",
            pricing: "quote",
            illustrationId: null,
          },
        },
      ],
    }).body,
  ).toContain("*Laundry* · service · priced per job")
})

test("workflow typed confirmations require explicit purpose, exact opaque code and quoted provider reply", () => {
  expect(
    parseWhatsAppTypedWorkflowAction(
      `Confirm setup ${codes.confirmCode}`,
      "wamid.review",
    ),
  ).toEqual({
    kind: "workflow_action",
    purpose: "SETUP",
    decision: "confirm",
    code: codes.confirmCode,
    replyToMessageId: "wamid.review",
  })
  expect(
    parseWhatsAppTypedWorkflowAction(
      `Cancel product ${codes.cancelCode}`,
      "wamid.product",
    ),
  ).toEqual({
    kind: "workflow_action",
    purpose: "PRODUCT_CREATE",
    decision: "cancel",
    code: codes.cancelCode,
    replyToMessageId: "wamid.product",
  })
  for (const text of [
    `Confirm setup ${codes.confirmCode}!`,
    "Confirm setup all",
    "Cancel product",
    `Confirm  setup ${codes.confirmCode}`,
    `/Confirm setup ${codes.confirmCode}`,
  ])
    expect(parseWhatsAppTypedWorkflowAction(text, "wamid.review")).toEqual({
      kind: "invalid_workflow_action",
    })
  expect(
    parseWhatsAppTypedWorkflowAction(`Confirm setup ${codes.confirmCode}`),
  ).toEqual({ kind: "invalid_workflow_action" })
  expect(
    parseWhatsAppTypedWorkflowAction(
      `Confirm product ${codes.confirmCode}`,
      "bad quoted id",
    ),
  ).toEqual({ kind: "invalid_workflow_action" })
  for (const text of [
    "yes",
    "proceed",
    "add everything",
    `Confirm ${codes.confirmCode}`,
    "I need a setup item",
  ])
    expect(parseWhatsAppTypedWorkflowAction(text, "wamid.review")).toBeNull()
})

test("descriptive workflow draft cancellation reaches canonical tools while proof-like cancellation stays reserved", () => {
  for (const text of [
    "Cancel product draft",
    "Cancel setup draft Amina customer",
    "Cancel setup draft customer:amina",
    "Cancel setup draft Maïs blanc",
  ])
    expect(parseWhatsAppTypedWorkflowAction(text, "wamid.review")).toBeNull()
  for (const text of [
    "Cancel setup",
    "Cancel product it",
    "Cancel setup this please",
    "Confirm setup draft Amina customer",
    "Confirm product draft",
    `Cancel product draft ${codes.cancelCode}`,
    `Cancel setup draft Amina ${codes.cancelCode} please`,
    `Cancel product ${codes.cancelCode} draft`,
    "Cancel setup draft abcdefghijklmnopqrst",
    "Cancel setup draft 123456",
    "Cancel setup draft ewa-wa-workflow-v1:bad:cancel",
    "Cancel setup draft ewa-wa-action-v1:bad:cancel",
    "Cancel setup draft ewa-wa-voice-v1:bad:cancel",
    "Cancel product draft Amina\ncustomer",
    "Cancel product draft Amina\u202ecustomer",
  ])
    expect(parseWhatsAppTypedWorkflowAction(text, "wamid.review")).toEqual({
      kind: "invalid_workflow_action",
    })
  expect(
    parseWhatsAppTypedWorkflowAction(`Cancel product ${codes.cancelCode}`),
  ).toEqual({
    kind: "invalid_workflow_action",
  })
})

test("workflow button namespace is purpose-bound and never accepts generic or unquoted actions", () => {
  const button = whatsAppWorkflowActionButtonId(
    "PRODUCT_CREATE",
    codes.confirmCode,
    "confirm",
  )
  expect(button.length).toBeLessThan(200)
  expect(parseWhatsAppWorkflowActionButton(button, "wamid.product")).toEqual({
    kind: "workflow_action",
    purpose: "PRODUCT_CREATE",
    decision: "confirm",
    code: codes.confirmCode,
    replyToMessageId: "wamid.product",
  })
  expect(parseWhatsAppWorkflowActionButton(button)).toEqual({
    kind: "invalid_workflow_action",
  })
  expect(
    parseWhatsAppWorkflowActionButton(`${button}:extra`, "wamid.product"),
  ).toEqual({ kind: "invalid_workflow_action" })
  expect(
    parseWhatsAppWorkflowActionButton(
      `ewa-wa-action-v1:${codes.confirmCode}:confirm`,
      "wamid.product",
    ),
  ).toBeNull()
})

function setupProduct(index: number, name: string, unitName: string) {
  const source = {
    ...selected,
    entityId: `entity-${index}`,
    key: `product:${index}`,
  }
  return {
    source,
    record: {
      ...source,
      payload: {
        kind: "product" as const,
        name,
        unitName,
        priceMinor: [890000, 190000, 1100000][index] ?? 100,
        openingStock: ["12", "50", "8"][index] ?? "1",
        illustrationId: null,
      },
      openQuestions: [],
      errorCode: null,
      committedRecordId: null,
    },
  }
}

test("several Setup products render as one numbered review that fits reply buttons", () => {
  const items = [
    setupProduct(0, "Groundnut Oil 3L", "bottle"),
    setupProduct(1, "Brown Beans", "kg"),
    setupProduct(2, "Ofada Rice 5kg", "bag"),
  ]
  const several: WhatsAppWorkflowActionReview = {
    ...review,
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
    source: { ...review.source, selection: items.map((item) => item.source) },
    records: items.map((item) => item.record),
  }
  const body = render(several)
  expect(body.kind).toBe("review")
  expect(body.body).toBe(
    [
      "🧾 *3 product drafts*",
      "1. *Groundnut Oil 3L* · ₦8,900 per bottle · 12 in stock",
      "2. *Brown Beans* · ₦1,900 per kg · 50 in stock",
      "3. *Ofada Rice 5kg* · ₦11,000 per bag · 8 in stock",
      "",
      "Mama Ada Provisions · Yaba Main",
      "_Stock goes to Yaba Main. Only these 3 will be saved; other drafts stay as drafts. Nothing is saved until you confirm._",
      "_To change one, send the fix by name. This review expires 12:05 UTC._",
    ].join("\n"),
  )
  const dispatch = appendWhatsAppWorkflowActionInstructions(body, codes)
  expect(dispatch.body.length).toBeLessThanOrEqual(1024)
  if (body.kind !== "review") throw Error("review expected")
  expect(whatsAppWorkflowActionButtonTitles(body.source)).toEqual({
    confirm: "Save all 3",
    cancel: "Cancel",
  })
  expect(whatsAppWorkflowActionButtonTitles(review.source).confirm).toBe("Save")
  expect(
    whatsAppWorkflowActionButtonTitles(productReview().source).confirm,
  ).toBe("Save product")
  const mixed = render({
    ...several,
    source: {
      ...several.source,
      selection: [items[0]?.source, selected],
    },
    records: [items[0]?.record, review.records[0]],
  })
  expect(mixed.body).toContain("🧾 *2 setup drafts*")
  expect(mixed.body).toContain("2. *Amina* · customer")
})

test("record names with WhatsApp markers are shown plain, never re-formatted", () => {
  const first = review.records[0]
  if (!first || first.payload.kind !== "customer")
    throw Error("Customer fixture missing")
  const body = render({
    ...review,
    storeName: "Main_Store",
    records: [{ ...first, payload: { ...first.payload, name: "A*mina_" } }],
  })
  expect(body.kind).toBe("review")
  expect(body.body).toContain("\nA*mina_ · customer")
  expect(body.body).toContain("\nOriginal business · Main_Store\n")
})

test("shop-use products without a price name their counting unit on the stock", () => {
  const item = setupProduct(0, "Nylon bags", "pack")
  const body = render({
    ...review,
    source: { ...review.source, selection: [item.source] },
    records: [
      {
        ...item.record,
        payload: {
          ...item.record.payload,
          priceMinor: undefined,
          openingStock: "5",
          usage: "INTERNAL_USE",
        },
      },
    ],
  })
  expect(body.kind).toBe("review")
  expect(body.body).toContain(
    "*Nylon bags* · no selling price · 5 pack in stock\n- Shop use only, not for sale",
  )
})
