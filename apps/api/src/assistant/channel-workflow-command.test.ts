import { expect, test } from "bun:test"
import type { WhatsAppWorkflowActionSource } from "@ewatrade/assistant/channels/workflow-action-review"
import type { ProductFormSnapshot } from "@ewatrade/assistant/product/contracts"
import { setupEntityPayloadSchema } from "@ewatrade/assistant/setup/contracts"
import { assistantWhatsAppActionPayloadDigest } from "@ewatrade/db/assistant-whatsapp"
import {
  type WorkflowCommandProjectionInput,
  assertReviewedWorkflowProductHasNoMatches,
  prepareReviewedWorkflowCommand,
  prepareReviewedWorkflowSelection,
} from "./channel-workflow-command"
import { catalogCommandForProductConversation } from "./product-command"
import { catalogCommandForSetupEntity } from "./setup-commit"

const scope = { tenantId: "tenant", storeId: "store", userId: "owner" }
const at = new Date("2026-10-15T12:00:00Z")
const digest = assistantWhatsAppActionPayloadDigest
type Entity = WorkflowCommandProjectionInput["entity"]
function entity(
  payload: Entity["payload"],
  kind: Entity["kind"],
  key = "product",
): Entity {
  return {
    id: `${key}-entity`,
    key,
    kind,
    state: "PROPOSED",
    payload,
    source: null,
    openQuestions: [],
    sortOrder: 0,
    committedRecordId: null,
    errorCode: null,
    updatedAt: at,
  }
}
const product = entity(
  {
    kind: "product",
    name: "Eggs",
    unitName: "Piece",
    priceMinor: 12501,
    openingStock: "12.12",
    usage: "FOR_SALE",
  },
  "PRODUCT",
)
const customer = entity(
  {
    kind: "customer",
    name: "Amina",
    phone: "08030000000",
    email: "amina@example.test",
  },
  "CUSTOMER",
  "customer:amina",
)
const snapshot: ProductFormSnapshot = {
  form: {
    kind: "product",
    name: "Eggs",
    description: "",
    unitName: "Piece",
    price: "125.01",
    openingStockQuantity: "12.12",
    usage: "FOR_SALE",
  },
  storeId: "store",
  category: "Original category",
  illustrationId: null,
  photoAssetIds: [],
  sku: "",
  barcode: "",
  showAdvanced: false,
  showUnits: false,
  showDescription: false,
  showOpeningStock: true,
  selectedHelperKey: null,
  canonicalTransactionScale: 2,
  optionGroups: [],
  variantDrafts: {},
  additionalUnits: [],
}
const workflowContext = { snapshot, handoffDigest: "f".repeat(64) }
function sourceFor(
  selected: Entity,
  mode: "SETUP" | "PRODUCT_CREATE" = "SETUP",
  context: Parameters<
    typeof prepareReviewedWorkflowSelection
  >[0]["conversation"]["workflowContext"] = null,
): WhatsAppWorkflowActionSource {
  const selection = {
    entityId: selected.id,
    key: selected.key,
    state: "PROPOSED" as const,
    payloadHash: digest(setupEntityPayloadSchema.parse(selected.payload)),
    commandHash: "0".repeat(64),
  }
  const common = {
    version: "workflow-action-v1" as const,
    conversationId: "conversation",
    draftId: "draft",
    origin: { tenantId: "tenant", storeId: "store" },
    draftRevision: 7,
    selection: [selection],
  }
  const source: WhatsAppWorkflowActionSource =
    mode === "SETUP"
      ? { ...common, purpose: "SETUP", workflowContextHash: null }
      : {
          ...common,
          purpose: "PRODUCT_CREATE",
          workflowContextHash: digest(context),
        }
  selection.commandHash = digest(
    prepareReviewedWorkflowCommand({
      source,
      entity: selected,
      workflowContext: context,
      scope,
    }).command,
  )
  return source
}
function current(
  source: WhatsAppWorkflowActionSource,
  selected: Entity,
  context: Parameters<
    typeof prepareReviewedWorkflowSelection
  >[0]["conversation"]["workflowContext"] = null,
) {
  const conversation: Parameters<
    typeof prepareReviewedWorkflowSelection
  >[0]["conversation"] = {
    id: source.conversationId,
    purpose: source.purpose,
    status: "ACTIVE",
    ownerUserId: scope.userId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    title: "Draft",
    workflowContext: context,
    setupDraft: { id: source.draftId, revision: source.draftRevision },
  }
  const draft: Parameters<typeof prepareReviewedWorkflowSelection>[0]["draft"] =
    {
      id: source.draftId,
      revision: source.draftRevision,
      areas: {},
      entities: [selected],
    }
  return { source, scope, conversation, draft }
}

test("Setup projection is the actual canonical catalog command, and directory customers carry no opening effect", () => {
  const source = sourceFor(product)
  const prepared = prepareReviewedWorkflowCommand({
    source,
    entity: product,
    workflowContext: null,
    scope,
  })
  const payload = setupEntityPayloadSchema.parse(product.payload)
  if (
    payload.kind !== "product" ||
    prepared.kind !== "catalog" ||
    prepared.command.kind !== "product"
  )
    throw Error("Expected a product command")
  const expected = catalogCommandForSetupEntity(product.id, payload, {
    actorUserId: scope.userId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
  })
  if (expected.kind !== "product") throw Error("Expected a product command")
  expect(prepared.command).toEqual(expected)
  expect(prepared.command.openingStockQuantity).toBe("12.12")
  const selected = source.selection[0]
  if (!selected) throw Error("Expected exact selected product")
  expect(digest(prepared.command)).toBe(selected.commandHash)
  const directory = prepareReviewedWorkflowCommand({
    source: sourceFor(customer),
    entity: customer,
    workflowContext: null,
    scope,
  })
  expect(directory).toEqual({
    kind: "customer",
    command: {
      tenantId: "tenant",
      name: "Amina",
      phone: "08030000000",
      email: "amina@example.test",
    },
  })
})

test("Product binds the full canonical snapshot and effective product-conversation operation identity", () => {
  const source = sourceFor(product, "PRODUCT_CREATE", workflowContext)
  const prepared = prepareReviewedWorkflowCommand({
    source,
    entity: product,
    workflowContext,
    scope,
  })
  if (prepared.kind !== "catalog") throw Error("Expected product")
  const canonical = catalogCommandForProductConversation(
    scope,
    product,
    workflowContext,
  )
  expect(prepared.command).toEqual({
    ...canonical,
    clientOperationId: "product-conversation",
  })
  expect(prepared.categoryLabel).toBe("Original category")
  expect(digest(prepared.command)).not.toBe(digest(canonical))
  expect(
    prepareReviewedWorkflowSelection(current(source, product, workflowContext)),
  ).toHaveLength(1)
  const changed = current(source, product, workflowContext)
  changed.conversation.workflowContext = {
    ...workflowContext,
    snapshot: { ...snapshot, category: "Changed category" },
  }
  expect(() => prepareReviewedWorkflowSelection(changed)).toThrow("changed")
})

test("native Product repeats the app's current possible-match policy and never synthesizes separate-product consent", async () => {
  const source = sourceFor(product, "PRODUCT_CREATE", workflowContext)
  const prepared = prepareReviewedWorkflowCommand({
    source,
    entity: product,
    workflowContext,
    scope,
  })
  const queries: Parameters<
    Parameters<typeof assertReviewedWorkflowProductHasNoMatches>[2]
  >[0][] = []
  let matches = 0
  const count = async (query: (typeof queries)[number]) => {
    queries.push(query)
    return matches
  }
  await assertReviewedWorkflowProductHasNoMatches(source, prepared, count)
  // A match appearing after review must be checked again before the fresh commit.
  matches = 1
  await expect(
    assertReviewedWorkflowProductHasNoMatches(source, prepared, count),
  ).rejects.toMatchObject({
    code: "WORKFLOW_APP_REVIEW_REQUIRED",
  })
  expect(queries).toEqual(
    Array.from({ length: 2 }, () => ({
      where: {
        tenantId: "tenant",
        kind: "PRODUCT",
        status: "ACTIVE",
        systemRole: null,
        name: { contains: "Eggs", mode: "insensitive" },
      },
    })),
  )
  expect(JSON.stringify(prepared)).not.toContain("createSeparateProduct")
  const before = queries.length
  await assertReviewedWorkflowProductHasNoMatches(
    sourceFor(product),
    prepared,
    count,
  )
  expect(queries).toHaveLength(before)
  for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])
    await expect(
      assertReviewedWorkflowProductHasNoMatches(
        source,
        prepared,
        async () => invalid,
      ),
    ).rejects.toMatchObject({
      code: "WORKFLOW_REVIEW_CHANGED",
    })
  const unavailable = new Error("Possible matches unavailable")
  await expect(
    assertReviewedWorkflowProductHasNoMatches(source, prepared, async () => {
      throw unavailable
    }),
  ).rejects.toBe(unavailable)
})

test("selected draft comparison rejects stale revision, payload, command, state, original Store and record identity", () => {
  const source = sourceFor(customer)
  const valid = current(source, customer)
  const other = entity(
    { kind: "customer", name: "Unselected" },
    "CUSTOMER",
    "customer:other",
  )
  valid.draft.entities.push(other)
  expect(
    prepareReviewedWorkflowSelection(valid).map((row) => row.entity.key),
  ).toEqual([customer.key])
  for (const draft of [
    { ...valid.draft, revision: 8 },
    {
      ...valid.draft,
      entities: [
        { ...customer, payload: { kind: "customer", name: "Changed" } },
      ],
    },
    {
      ...valid.draft,
      entities: [{ ...customer, state: "CONFIRMED" as const }],
    },
    { ...valid.draft, entities: [{ ...customer, id: "different-entity" }] },
  ])
    expect(() => prepareReviewedWorkflowSelection({ ...valid, draft })).toThrow(
      "changed",
    )
  expect(() =>
    prepareReviewedWorkflowSelection({
      ...valid,
      source: {
        ...source,
        selection: source.selection.map((row) => ({
          ...row,
          commandHash: "e".repeat(64),
        })),
      },
    }),
  ).toThrow("changed")
  expect(() =>
    prepareReviewedWorkflowSelection({
      ...valid,
      scope: { ...scope, storeId: "other" },
    }),
  ).toThrow("changed")
  expect(() =>
    prepareReviewedWorkflowSelection({
      ...valid,
      conversation: { ...valid.conversation, ownerUserId: "other" },
    }),
  ).toThrow("changed")
})

test("money accounts, customer openings, rich/media products and incomplete service facts never become executable projections", () => {
  const base = sourceFor(product)
  const cases = [
    entity(
      { kind: "money_account", name: "Cash", purpose: "CASH" },
      "MONEY_ACCOUNT",
    ),
    entity(
      {
        kind: "customer",
        name: "Amina",
        opening: { direction: "owes_business", amountMinor: 500 },
      },
      "CUSTOMER",
    ),
    entity(
      {
        kind: "product",
        name: "Eggs",
        unitName: "Piece",
        priceMinor: 100,
        photoAttachmentId: "private-photo",
      },
      "PRODUCT",
    ),
    entity(
      {
        kind: "product",
        name: "Eggs",
        unitName: "Piece",
        priceMinor: 100,
        sellingUnits: [
          { name: "Box", containsQuantity: "12", priceMinor: 1200 },
        ],
      },
      "PRODUCT",
    ),
    entity(
      {
        kind: "product",
        name: "Eggs",
        unitName: "Piece",
        priceMinor: 100,
        openingStock: "0.001",
      },
      "PRODUCT",
    ),
    entity({ kind: "service", name: "Haircut", pricing: "fixed" }, "SERVICE"),
    entity(
      { kind: "service", name: "Haircut", pricing: "quote", priceMinor: 100 },
      "SERVICE",
    ),
    { ...product, committedRecordId: "already-added" },
    { ...product, errorCode: "FAILED_PRIOR" },
    {
      ...product,
      openQuestions: [
        { field: "other", question: "Which item?", required: true },
      ],
    },
  ]
  for (const value of cases)
    expect(() =>
      prepareReviewedWorkflowCommand({
        source: base,
        entity: value,
        workflowContext: null,
        scope,
      }),
    ).toThrow("needs review")
  const productSource = sourceFor(product, "PRODUCT_CREATE", workflowContext)
  for (const next of [
    { ...snapshot, sku: "RICH-SKU" },
    { ...snapshot, photoAssetIds: ["photo"] },
    { ...snapshot, storeId: "other" },
  ])
    expect(() =>
      prepareReviewedWorkflowCommand({
        source: productSource,
        entity: product,
        workflowContext: { ...workflowContext, snapshot: next },
        scope,
      }),
    ).toThrow("needs review")
})
