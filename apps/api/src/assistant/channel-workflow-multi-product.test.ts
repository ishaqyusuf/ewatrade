import { expect, test } from "bun:test"
import type { WhatsAppWorkflowActionSource } from "@ewatrade/assistant/channels/workflow-action-review"
import type { ProductFormSnapshot } from "@ewatrade/assistant/product/contracts"
import { setupEntityPayloadSchema } from "@ewatrade/assistant/setup/contracts"
import { productClientOperationId } from "@ewatrade/db/assistant"
import { assistantWhatsAppActionPayloadDigest } from "@ewatrade/db/assistant-whatsapp"
import {
  type WorkflowCommandProjectionInput,
  prepareReviewedWorkflowCommand,
  prepareReviewedWorkflowSelection,
} from "./channel-workflow-command"

const scope = { tenantId: "tenant", storeId: "store", userId: "owner" }
const at = new Date("2026-11-03T19:00:00Z")
const digest = assistantWhatsAppActionPayloadDigest
type Entity = WorkflowCommandProjectionInput["entity"]
const product = (key: string, name: string, sortOrder: number): Entity => ({
  id: `${key}-entity`,
  key,
  kind: "PRODUCT",
  state: "PROPOSED",
  payload: {
    kind: "product",
    name,
    unitName: "bag",
    priceMinor: 1100000,
    openingStock: "8",
    usage: "FOR_SALE",
  },
  source: null,
  openQuestions: [],
  sortOrder,
  committedRecordId: null,
  errorCode: null,
  updatedAt: at,
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
const workflowContext = { snapshot, handoffDigest: "f".repeat(64) }
const entities = [
  product("product", "Groundnut Oil 3L", 0),
  product("product-2", "Brown Beans", 1),
  product("product-3", "Ofada Rice 5kg", 2),
]
function sourceFor(selected: Entity[]): WhatsAppWorkflowActionSource {
  const source: WhatsAppWorkflowActionSource = {
    version: "workflow-action-v1",
    purpose: "PRODUCT_CREATE",
    conversationId: "conversation",
    draftId: "draft",
    origin: { tenantId: "tenant", storeId: "store" },
    draftRevision: 4,
    workflowContextHash: digest(workflowContext),
    selection: selected.map((entity) => ({
      entityId: entity.id,
      key: entity.key,
      state: "PROPOSED" as const,
      payloadHash: digest(setupEntityPayloadSchema.parse(entity.payload)),
      commandHash: "0".repeat(64),
    })),
  }
  for (const [index, entity] of selected.entries()) {
    const row = source.selection[index]
    if (!row) throw Error("fixture")
    row.commandHash = digest(
      prepareReviewedWorkflowCommand({
        source,
        entity,
        workflowContext,
        scope,
      }).command,
    )
  }
  return source
}
function current(source: WhatsAppWorkflowActionSource, rows: Entity[]) {
  return {
    source,
    scope,
    conversation: {
      id: source.conversationId,
      purpose: source.purpose,
      status: "ACTIVE",
      ownerUserId: scope.userId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      title: "Add product",
      workflowContext,
      setupDraft: { id: source.draftId, revision: source.draftRevision },
    },
    draft: {
      id: source.draftId,
      revision: source.draftRevision,
      areas: {},
      entities: rows,
    },
  } as Parameters<typeof prepareReviewedWorkflowSelection>[0]
}

test("each WhatsApp product keeps its own stable canonical operation identity", () => {
  const source = sourceFor(entities)
  const ids = entities.map((entity) => {
    const prepared = prepareReviewedWorkflowCommand({
      source,
      entity,
      workflowContext,
      scope,
    })
    if (prepared.kind !== "catalog") throw Error("product expected")
    return prepared.command.clientOperationId
  })
  // The first product keeps the app's original identity, so app replays are unchanged.
  expect(ids).toEqual([
    "product-conversation",
    "product-conversation-product-2",
    "product-conversation-product-3",
  ])
  expect(productClientOperationId("c", "product")).toBe("product-c")
})

test("one Product review selects up to three exact drafts, and anything else is refused", () => {
  const source = sourceFor(entities)
  expect(
    prepareReviewedWorkflowSelection(current(source, entities)).map(
      (row) => row.entity.key,
    ),
  ).toEqual(["product", "product-2", "product-3"])
  for (const rows of [
    [...entities, product("product-4", "Extra", 3)],
    [...entities.slice(0, 2), product("product:rice", "Rice", 2)],
  ])
    expect(() =>
      prepareReviewedWorkflowSelection(current(source, rows)),
    ).toThrow("changed")
  const otherKey = product("product:oil", "Oil", 0)
  expect(() =>
    prepareReviewedWorkflowCommand({
      source,
      entity: otherKey,
      workflowContext,
      scope,
    }),
  ).toThrow("changed")
})
