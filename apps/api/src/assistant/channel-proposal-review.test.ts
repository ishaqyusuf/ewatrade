import { expect, test } from "bun:test"
import { renderWhatsAppActionReviewBody } from "@ewatrade/assistant/channels/action-review"
import {
  type GeneralAction,
  type GeneralReviewPresentation,
  generalActionSchema,
  generalMoney,
  simpleSaleAction,
} from "@ewatrade/assistant/general/contracts"
import { customerCreatePresentation } from "./catalog-review-presentations"
import {
  type ChannelProposalSource,
  projectChannelProposalReview,
} from "./channel-proposal-review"
import {
  type GeneralTransactionContext,
  generalActionAdapter,
} from "./general-actions"
import { serviceIntakeReviewLines } from "./general-service-intake"
import { serviceWorkReviewLines } from "./general-service-work"
import { simpleSaleRecord } from "./general-simple-sale"
import { proposalDigest } from "./proposal-security"
import { stockReceivePresentation } from "./review-presentations"
const now = Date.parse("2026-10-15T12:00:00.000Z")
const scope = {
  businessName: "Original business",
  storeName: "Original Store",
  currencyCode: "NGN",
}
function customer() {
  const payload = generalActionSchema.parse({
    action: "customer_create",
    name: "Amina",
    phone: "08030000000",
    email: "amina@example.test",
  })
  const row: ChannelProposalSource = {
    id: "proposal",
    revision: 3,
    payloadHash: proposalDigest(payload),
    status: "PENDING",
    action: payload.action,
    actionVersion: 1,
    expiresAt: new Date(now + 300000),
  }
  return {
    row,
    proposal: {
      id: row.id,
      revision: row.revision,
      payload,
      status: "PENDING",
      expiresAt: row.expiresAt.toISOString(),
      receipt: null,
      approvalToken: "server-only-approval",
      review: ["Amina · 08030000000 · amina@example.test"],
      presentation: customerCreatePresentation({
        name: "Amina",
        phone: "08030000000",
        email: "amina@example.test",
      }),
    },
  }
}

test("only exact pending canonical source review becomes a token-free channel projection", () => {
  const { row, proposal } = customer()
  const result = projectChannelProposalReview(row, proposal, scope, now)
  expect(result.kind).toBe("review")
  expect(JSON.stringify(result)).not.toContain("server-only-approval")
  if (result.kind !== "review") throw Error("Canonical customer review missing")
  expect(result.review.source).toEqual({
    proposalId: row.id,
    revision: 3,
    payloadHash: row.payloadHash,
  })
  expect(result.review.businessName).toBe("Original business")
  expect(result.review.reviewLines).toContain(
    "Amina · 08030000000 · amina@example.test",
  )
  for (const patch of [
    { revision: 4 },
    { id: "another-proposal" },
    { status: "COMPLETED" },
    { approvalToken: undefined },
    { question: "Which customer?" },
    { presentation: undefined },
  ])
    expect(
      projectChannelProposalReview(row, { ...proposal, ...patch }, scope, now)
        .kind,
    ).toBe("app_review")
  expect(
    projectChannelProposalReview(
      { ...row, payloadHash: "0".repeat(64) },
      proposal,
      scope,
      now,
    ).kind,
  ).toBe("app_review")
  expect(
    projectChannelProposalReview(row, proposal, scope, row.expiresAt.getTime())
      .kind,
  ).toBe("app_review")
})

test("material clipped contact or incomplete cash review never receives native confirm projection", () => {
  const { row, proposal } = customer()
  expect(
    projectChannelProposalReview(
      row,
      { ...proposal, review: ["Amina…"] },
      scope,
      now,
    ).kind,
  ).toBe("app_review")
  expect(
    projectChannelProposalReview(
      row,
      {
        ...proposal,
        presentation: customerCreatePresentation({
          name: "Different customer",
        }),
        review: ["Different customer"],
      },
      scope,
      now,
    ).kind,
  ).toBe("app_review")
  const payload = generalActionSchema.parse({
    action: "money_transfer_simple",
    amountMinor: 12500,
    fromMoneyAccountId: "from",
    toMoneyAccountId: "to",
    fromAccountName: "Shop bank",
    toAccountName: "Shop cash",
    bookId: "book",
    effectiveAt: "2026-10-15T11:00:00.000Z",
  })
  expect(
    projectChannelProposalReview(
      { ...row, action: payload.action, payloadHash: proposalDigest(payload) },
      {
        ...proposal,
        payload,
        presentation: undefined,
        review: ["₦125.00 from Shop bank to Shop cash", "Today · by you"],
      },
      scope,
      now,
    ).kind,
  ).toBe("app_review")
})

test("unsupported write stays app review even with a valid-looking generic presentation", () => {
  const { row, proposal } = customer()
  const payload = generalActionSchema.parse({
    action: "catalog_archive",
    catalogItemId: "product",
    targets: [{ kind: "offering", offeringId: "offering" }],
    reason: "Stopped selling",
  })
  expect(
    projectChannelProposalReview(
      { ...row, action: payload.action, payloadHash: proposalDigest(payload) },
      { ...proposal, payload },
      scope,
      now,
    ).kind,
  ).toBe("app_review")
})

test("canonical ready sale instruction permits exact review while clarification still requires app review", async () => {
  // Inert canonical review dependencies: no database client or domain command executes.
  const ctx = {
    session: { user: { id: "user" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        name: scope.businessName,
        dataClassification: "QA",
        currencyCode: "NGN",
        timezone: "Africa/Lagos",
        retailOpsPlanId: "pro",
      },
      membership: { id: "member", role: "OWNER" },
      activeStore: { id: "store", name: scope.storeName, currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        status: "ACTIVE",
        mode: "LEGACY",
        businessRole: "OWNER",
        assignments: [],
      },
    },
    db: {
      financeBook: {
        findUnique: async () => ({ id: "book", currencyCode: "NGN" }),
        findFirst: async () => ({ timezone: "Africa/Lagos" }),
      },
      financeAccount: {
        findMany: async () => [
          {
            id: "cash",
            name: "Shop cash",
            purpose: "CASH",
            paymentMethods: [],
            paymentsPausedAt: null,
          },
        ],
      },
      assistantAttachment: { findMany: async () => [] },
    },
  } as unknown as GeneralTransactionContext
  const payload = simpleSaleAction.parse({
    action: "sale_record",
    moneyAccountId: "cash",
    accountName: "Shop cash",
    method: "cash",
    receivedMinor: 12500,
    customerChoice: "walk_in",
    description: "Counter sale",
  })
  const { row: baseRow, proposal: baseProposal } = customer()
  const row = {
    ...baseRow,
    action: payload.action,
    payloadHash: proposalDigest(payload),
  }
  const oldKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "synthetic-review-key-".repeat(3)
  try {
    const canonical = await simpleSaleRecord.review(ctx, payload)
    const proposal = {
      ...baseProposal,
      payload,
      question: canonical.question,
      choices: canonical.choices,
      presentation: canonical.presentation,
      review: canonical.lines,
    }
    expect(canonical.question).toBe("Review the sale, then save it.")
    expect(projectChannelProposalReview(row, proposal, scope, now).kind).toBe(
      "review",
    )
    expect(
      projectChannelProposalReview(
        row,
        { ...proposal, question: "Which account?" },
        scope,
        now,
      ).kind,
    ).toBe("app_review")
    const partial = { ...payload, partial: true }
    const clarification = await simpleSaleRecord.review(ctx, partial)
    expect(clarification.question).toBe("What is the full sale total?")
    expect(
      projectChannelProposalReview(
        { ...row, payloadHash: proposalDigest(partial) },
        {
          ...baseProposal,
          payload: partial,
          question: clarification.question,
          choices: clarification.choices,
          presentation: clarification.presentation,
          review: clarification.lines,
        },
        scope,
        now,
      ).kind,
    ).toBe("app_review")
  } finally {
    if (oldKey === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = oldKey
  }
})

// Inert canonical review stubs: reads only, no domain command executes.
function reviewContext(db: Record<string, unknown>) {
  return {
    session: { user: { id: "user" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: {
        id: "tenant",
        name: scope.businessName,
        dataClassification: "QA",
        currencyCode: "NGN",
        timezone: "Africa/Lagos",
        retailOpsPlanId: "pro",
      },
      membership: { id: "member", role: "OWNER" },
      activeStore: { id: "store", name: scope.storeName, currencyCode: "NGN" },
      stores: [{ id: "store" }],
      staffAccess: {
        status: "ACTIVE",
        mode: "LEGACY",
        businessRole: "OWNER",
        assignments: [],
      },
    },
    db,
  } as unknown as GeneralTransactionContext
}
function projected(
  payload: GeneralAction,
  review: { lines: string[]; presentation?: GeneralReviewPresentation },
  patch: Record<string, unknown> = {},
) {
  const { row, proposal } = customer()
  return projectChannelProposalReview(
    { ...row, action: payload.action, payloadHash: proposalDigest(payload) },
    {
      ...proposal,
      payload,
      review: review.lines,
      presentation: review.presentation,
      ...patch,
    },
    scope,
    now,
  )
}
async function withSigningKey(run: () => Promise<void>) {
  const oldKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "synthetic-review-key-".repeat(3)
  try {
    await run()
  } finally {
    if (oldKey === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = oldKey
  }
}
function body(result: ReturnType<typeof projectChannelProposalReview>) {
  if (result.kind !== "review") throw Error("Expected a native review")
  const rendered = renderWhatsAppActionReviewBody(result.review, { now })
  if (rendered.kind !== "review") throw Error("Expected a rendered review")
  return rendered.body
}

test("payment_record shows order, amount, account and balance; anything less goes to app review", () =>
  withSigningKey(async () => {
    const ctx = reviewContext({
      financeBook: {
        findUnique: async () => ({ id: "book", currencyCode: "NGN" }),
      },
      financeAccount: {
        findMany: async () => [
          {
            id: "bank",
            name: "Main bank",
            purpose: "BANK",
            paymentMethods: ["bank_transfer"],
            paymentsPausedAt: null,
          },
        ],
      },
      commercialOrder: {
        findFirst: async () => ({
          id: "order",
          orderNumber: "S-1039",
          customerName: "Chidi Eze",
          updatedAt: new Date(now),
          amountPaidMinor: 500000,
          totalMinor: 2950000,
          status: "OPEN",
          paymentStatus: "PARTIALLY_PAID",
          _count: { payments: 1 },
        }),
      },
    })
    const payload = generalActionSchema.parse({
      action: "payment_record",
      orderId: "order",
      amountMinor: 2450000,
      moneyAccountId: "bank",
      method: "bank_transfer",
    })
    const review = await generalActionAdapter(payload).review?.(ctx, payload)
    if (!review) throw Error("Canonical payment review missing")
    expect(review.presentation).toBeUndefined()
    const result = projected(payload, review)
    const text = body(result)
    expect(text).toContain("🧾 Review payment already received")
    expect(text).toContain("Chidi Eze · S-1039")
    expect(text).toContain("₦24,500.00 · bank transfer")
    expect(text).toContain("Received into: Main bank")
    expect(text).toContain("Balance after: ₦0.00")
    expect(text).toContain("Records money already received")
    expect(text).not.toMatch(/\b(?:sent|moved)\b/i)
    for (const lines of [
      review.lines.filter((line) => !line.startsWith("Received into")),
      review.lines.filter((line) => !line.startsWith("Balance after")),
      review.lines.map((line) =>
        line.startsWith("Balance after") ? "Balance after: -₦5.00" : line,
      ),
      review.lines.map((line) => line.replace("₦24,500.00", "₦2,450.00")),
    ])
      expect(projected(payload, { lines }).kind).toBe("app_review")
    const noAccount = generalActionSchema.parse({
      ...payload,
      moneyAccountId: undefined,
    })
    expect(projected(noAccount, review).kind).toBe("app_review")
  }))

test("product_price_update shows old and new price with reason and all-Store scope", () =>
  withSigningKey(async () => {
    const ctx = reviewContext({
      sellableOffering: {
        findFirst: async () => ({
          id: "offering",
          catalogItemId: "item",
          name: "Tin",
          revision: 4,
          fixedPriceMinor: 65000,
          currencyCode: "NGN",
          updatedAt: new Date(now),
          catalogItem: { name: "Evaporated Milk", updatedAt: new Date(now) },
          variant: { name: "160g", updatedAt: new Date(now) },
        }),
      },
    })
    const payload = generalActionSchema.parse({
      action: "product_price_update",
      offeringId: "offering",
      priceMinor: 70000,
      reason: "Supplier price went up",
    })
    const review = await generalActionAdapter(payload).review?.(ctx, payload)
    if (!review) throw Error("Canonical price review missing")
    const text = body(projected(payload, review))
    expect(text).toContain("🧾 Review price change")
    expect(text).toContain("Price: ₦650.00 → ₦700.00")
    expect(text).toContain("Applies in every Store")
    expect(text).toContain("Past orders keep their saved prices")
    expect(
      projected(payload, {
        ...review,
        lines: review.lines.filter((line) => !line.startsWith("Price:")),
      }).kind,
    ).toBe("app_review")
    expect(
      projected(payload, { ...review, presentation: undefined }).kind,
    ).toBe("app_review")
    expect(
      projected(
        generalActionSchema.parse({ ...payload, priceMinor: 71000 }),
        review,
      ).kind,
    ).toBe("app_review")
  }))

test("order_attachment_add shows the order and the note or file, and that the order is unchanged", () =>
  withSigningKey(async () => {
    const order = {
      findFirst: async () => ({
        id: "order",
        orderNumber: "S-1039",
        customerName: "Chidi Eze",
      }),
    }
    const ctx = reviewContext({
      commercialOrder: order,
      assistantAttachment: {
        findMany: async () => [
          {
            id: "file",
            messageId: "message",
            status: "READY",
            storagePath: "path",
            retentionUntil: new Date(Date.now() + 3600000),
            contentType: "image/jpeg",
            contentDigest: "a".repeat(64),
            fileName: "receipt.jpg",
            sizeBytes: 100,
          },
        ],
      },
    })
    const note = generalActionSchema.parse({
      action: "order_attachment_add",
      orderId: "order",
      note: "Customer collected two cartons",
    })
    const noteReview = await generalActionAdapter(note).review?.(ctx, note)
    if (!noteReview) throw Error("Canonical note review missing")
    const noteText = body(projected(note, noteReview))
    expect(noteText).toContain("Add a note to S-1039 · Chidi Eze")
    expect(noteText).toContain("Note: Customer collected two cartons")
    expect(noteText).toContain("items, totals and payments do not change")
    const file = generalActionSchema.parse({
      action: "order_attachment_add",
      orderId: "order",
      attachmentId: "file",
    })
    const fileReview = await generalActionAdapter(file).review?.(ctx, file)
    if (!fileReview) throw Error("Canonical file review missing")
    expect(body(projected(file, fileReview))).toContain(
      "Attach this photo to S-1039 · Chidi Eze",
    )
    expect(projected(note, { lines: noteReview.lines.slice(0, 1) }).kind).toBe(
      "app_review",
    )
    expect(projected(file, noteReview).kind).toBe("app_review")
  }))

test("stock_receive shows quantity, unit, stock before → after and cost; clipped or missing facts go to app review", () => {
  const preview = {
    productName: "Long-grain Rice",
    variantName: "50kg",
    enteredQuantity: "20",
    enteredUnitName: "bag",
    factor: "1",
    canonicalQuantity: "20",
    before: "14",
    after: "34",
    balanceUnitName: "bag",
    reserved: "0",
    availableAfter: "34",
    currencyCode: "NGN",
  }
  const payload = generalActionSchema.parse({
    action: "stock_receive",
    balanceSourceId: "source",
    enteredInventoryUnitId: "unit",
    enteredQuantity: "20",
    reason: "Delivery DN-118",
    source: "supplier_delivery",
    supplierName: "Lagos Grains Ltd",
    effectiveAt: "2026-11-03T08:00:00.000Z",
    unitCostMinor: 7150000,
  })
  if (payload.action !== "stock_receive") throw Error("Expected stock receipt")
  // Mirrors the canonical stock receipt adapter lines (its preview needs a database).
  const lines = [
    `${preview.productName} · ${preview.variantName}`,
    `Receive ${preview.enteredQuantity} ${preview.enteredUnitName} · factor ${preview.factor} · canonical increase ${preview.canonicalQuantity}`,
    `On hand: ${preview.before} → ${preview.after} ${preview.balanceUnitName}`,
    `Reserved: ${preview.reserved}; available after: ${preview.availableAfter} ${preview.balanceUnitName}`,
    `Source: ${payload.source} · Reason: ${payload.reason}`,
    `Supplier name: ${payload.supplierName} (receipt note; no supplier account or payment entry)`,
    `Effective: ${payload.effectiveAt}`,
    "Reported unit cost: ₦71,500.00. This is a stock cost snapshot, not purchase recognition or payment.",
    "Receive into the current Store. Stock valuation follows the ordinary receipt rules; unknown cost remains unknown.",
  ]
  const presentation = stockReceivePresentation(preview, payload)
  const text = body(projected(payload, { lines, presentation }))
  expect(text).toContain("🧾 Review stock received")
  expect(text).toContain("received: +20 bag")
  expect(text).toContain("On hand: 14 → 34 bag")
  expect(text).toContain("Lagos Grains Ltd")
  expect(text).toContain("Adds stock only. No bill or payment is recorded.")
  for (const broken of [
    lines.filter((line) => !line.startsWith("On hand")),
    lines.filter((line) => !line.startsWith("Supplier name")),
    lines.filter((line) => !line.startsWith("Effective")),
    lines.filter((line) => !line.startsWith("Receive ")),
  ])
    expect(projected(payload, { lines: broken, presentation }).kind).toBe(
      "app_review",
    )
  expect(projected(payload, { lines }).kind).toBe("app_review")
  const unknownCost = { ...payload, unitCostMinor: undefined }
  expect(
    projected(unknownCost, {
      lines: [
        ...lines.slice(0, 7),
        "Unit cost unknown; no purchase payment recorded.",
        lines[8] ?? "",
      ],
      presentation: stockReceivePresentation(preview, unknownCost),
    }).kind,
  ).toBe("review")
  const longReason = { ...payload, reason: "r".repeat(450) }
  expect(
    projected(longReason, {
      lines: lines.map((line) =>
        line.startsWith("Source:")
          ? `Source: ${longReason.source} · Reason: ${longReason.reason}`
          : line,
      ),
      presentation: stockReceivePresentation(preview, longReason),
    }).kind,
  ).toBe("app_review")
})

test("service_intake shows the customer, every priced line, total, payment and balance", () => {
  const payload = generalActionSchema.parse({
    action: "service_intake",
    customerName: "Amina Bello",
    lines: [
      { offeringId: "jalabia-wash", quantity: "5" },
      { offeringId: "trousers-iron", quantity: "3" },
    ],
    dueCommitmentAt: "2026-11-12T15:00:00.000Z",
    initialPaymentMinor: 100000,
    initialPaymentMethod: "cash",
  })
  if (payload.action !== "service_intake") throw Error("Intake expected")
  const line = (
    itemName: string,
    variantName: string,
    quantity: string,
    unitPriceMinor: number,
  ) => ({
    itemName,
    variantName,
    offeringName: variantName,
    quantity,
    unitPriceMinor,
    totalMinor: unitPriceMinor * Number(quantity),
    workPolicy: "TRACKED",
    authorizationPolicy: "NOT_REQUIRED",
  })
  const lines = serviceIntakeReviewLines(
    {
      storeId: "store",
      currencyCode: "NGN",
      customer: { name: "Amina Bello", phone: null, email: null },
      lines: [
        line("Jalabia", "Wash & iron", "5", 40000),
        line("Trousers", "Iron only", "3", 25000),
      ],
      subtotalMinor: 275000,
      serviceChargeMinor: 0,
      totalMinor: 275000,
      initialPaymentMinor: 100000,
      balanceMinor: 175000,
      assignee: null,
      dueCommitmentAt: "2026-11-12T15:00:00.000Z",
      trackedLineCount: 2,
    } as unknown as Parameters<typeof serviceIntakeReviewLines>[0],
    payload,
  )
  const text = body(projected(payload, { lines }))
  expect(text).toContain("🧾 Review job")
  expect(text).toContain("Customer: Amina Bello.")
  expect(text).toContain("Jalabia · Wash & iron · Wash & iron: 5 × ₦400.00")
  expect(text).toContain("total ₦2,750.00")
  expect(text).toContain("Initial recorded payment ₦1,000.00 · cash")
  expect(text).toContain("balance ₦1,750.00")
  expect(text).toContain("Promised time: 2026-11-12T15:00:00.000Z.")
  expect(text).toContain("Nothing is sent to the customer.")
  for (const changed of [
    lines.filter((entry) => !entry.startsWith("Trousers")),
    lines.filter((entry) => !entry.startsWith("Subtotal")),
    lines.map((entry) => entry.replace("₦1,000.00", "₦0.00")),
    lines.map((entry) => entry.replace("Amina Bello", "Amina")),
    lines.slice(0, -1),
  ])
    expect(projected(payload, { lines: changed }).kind).toBe("app_review")
})

test("service work shows the exact line and next state, or the named assignee", () => {
  const review = {
    orderNumber: "J-318",
    customerName: "Amina Bello",
    line: {
      offeringName: "Jalabia",
      variantName: "Wash & iron",
      quantity: "5",
      status: "IN_PROGRESS",
      authorizationStatus: "NOT_REQUIRED",
    },
    nextStatus: "blocked",
    assignee: null,
    promisedAt: null,
    reason: "One jalabia has an ink stain",
    balanceDueMinor: 275000,
    currencyCode: "NGN",
  }
  const blocked = generalActionSchema.parse({
    action: "service_job_line_transition",
    jobId: "job",
    lineId: "line",
    toStatus: "blocked",
    reason: "One jalabia has an ink stain",
  })
  const lines = serviceWorkReviewLines(
    review as unknown as Parameters<typeof serviceWorkReviewLines>[0],
  )
  const text = body(projected(blocked, { lines }))
  expect(text).toContain("🧾 Review work update")
  expect(text).toContain("J-318 · Amina Bello")
  expect(text).toContain("Current work: IN_PROGRESS")
  expect(text).toContain("Next work state: blocked.")
  expect(text).toContain("Reason: One jalabia has an ink stain")
  for (const changed of [
    lines.map((entry) => entry.replace("blocked.", "ready_for_handoff.")),
    lines.filter((entry) => !entry.startsWith("Reason")),
    lines.filter((entry) => !entry.startsWith("Order balance")),
  ])
    expect(projected(blocked, { lines: changed }).kind).toBe("app_review")

  const assign = generalActionSchema.parse({
    action: "service_job_assign",
    jobId: "job",
    assigneeUserId: "musa",
  })
  const assigned = serviceWorkReviewLines({
    ...review,
    line: null,
    nextStatus: null,
    reason: null,
    assignee: { name: "Musa Garba" },
  } as unknown as Parameters<typeof serviceWorkReviewLines>[0])
  const assignText = body(projected(assign, { lines: assigned }))
  expect(assignText).toContain("🧾 Review work assignment")
  expect(assignText).toContain("Assign to Musa Garba.")
  // A transition line in an assignment review is not what was asked.
  expect(projected(assign, { lines }).kind).toBe("app_review")
})

test("native catalog sale projects all thirty exact lines; incomplete stock/payment facts never get approval", () => {
  const { row: base, proposal: original } = customer()
  const payload = generalActionSchema.parse({
    action: "order_create",
    customerChoice: "walk_in",
    paymentChoice: "unpaid",
    fulfillNow: false,
    lines: Array.from({ length: 30 }, (_, i) => ({
      offeringId: `offering-${i}`,
      quantity: "1",
      expectedFixedPriceMinor: 1000,
      expectedConfigurationVersionId: "config",
    })),
  })
  const review = [
    ...Array.from({ length: 30 }, (_, i) => [
      `${i + 1}. Synthetic rice · Piece`,
      `${1} × ${generalMoney(1000, "NGN")} = ${generalMoney(1000, "NGN")}`,
      `Stock: on hand 100 → 100; reserved 0 → ${i + 1}; available 100 → ${99 - i} Piece`,
    ]).flat(),
    "Customer: Walk-in",
    `Total: ${generalMoney(30000, "NGN")}`,
    `Received: ${generalMoney(0, "NGN")} · unpaid`,
    "Received into: none · no payment recorded",
    `Balance: ${generalMoney(30000, "NGN")}`,
    "Handover: collect later; on-hand stays unchanged and product stock is reserved",
    "Nothing is saved until you confirm.",
  ]
  const row = {
    ...base,
    action: payload.action,
    payloadHash: proposalDigest(payload),
  }
  const proposal = { ...original, payload, presentation: undefined, review }
  const projected = projectChannelProposalReview(row, proposal, scope, now)
  expect(projected.kind).toBe("review")
  if (projected.kind !== "review")
    throw Error("Expected complete native review")
  expect(projected.review.reviewLines).toHaveLength(97)
  expect(projected.pages?.join("\n")).toContain("30. Synthetic rice")
  expect(projected.pages?.at(-1)).toContain(
    `Balance: ${generalMoney(30000, "NGN")}`,
  )
  for (const changed of [
    review.filter((_, i) => i !== 2),
    review.map((line, i) => (i === 2 ? "Stock unchanged" : line)),
    review.map((line) =>
      line.startsWith("Handover:") ? "Handover: handed over now" : line,
    ),
  ])
    expect(
      projectChannelProposalReview(
        row,
        { ...proposal, review: changed },
        scope,
        now,
      ).kind,
    ).toBe("app_review")
  expect(
    projectChannelProposalReview(
      row,
      { ...proposal, question: "Which account?" },
      scope,
      now,
    ).kind,
  ).toBe("app_review")
})
