import { expect, test } from "bun:test"
import { workflowConversationAppLink } from "@ewatrade/assistant/channels/workflow"
import {
  type ProductFormSnapshot,
  productFormSnapshotSchema,
} from "@ewatrade/assistant/product/contracts"
import { createLoader } from "nuqs/server"
import { catalogItemParamParsers } from "../../hooks/use-catalog-item-params"
import {
  type ProductFormResumeState,
  productFormExpectedRevision,
  productFormStateIsFresh,
  resumeProductForm,
} from "./product-form-resume"

function savedRichProduct(): ProductFormResumeState {
  const snapshot: ProductFormSnapshot = {
    form: {
      kind: "product",
      name: "Rice",
      description: "Owner description",
      unitName: "Kg",
      price: "120.50",
      openingStockQuantity: "0",
      usage: "BOTH",
    },
    storeId: "original-store",
    category: "Staples",
    illustrationId: "static-rice",
    photoAssetIds: ["owned-original-photo"],
    sku: "RICE-EXACT",
    barcode: "0000123456",
    showAdvanced: true,
    showUnits: true,
    showDescription: true,
    showOpeningStock: true,
    selectedHelperKey: "owner-selected-helper",
    canonicalTransactionScale: 3,
    optionGroups: [
      { id: "quality", name: "Quality", values: "Premium, Standard" },
    ],
    variantDrafts: {
      premium: {
        barcode: "0000001",
        enabled: true,
        price: "130.75",
        quantity: "2.125",
        quoteRequired: false,
        sku: "PREMIUM",
        storeIds: ["original-store"],
        unitPrices: { sack: "6500" },
      },
    },
    additionalUnits: [
      {
        id: "sack",
        name: "Sack",
        price: "6000",
        referenceId: "canonical",
        relationCount: "50",
        relationDirection: "canonical_per_unit",
        stockBehavior: "packaged_stock",
        transactionScale: 0,
      },
      {
        id: "pallet",
        name: "Pallet",
        price: "120000",
        referenceId: "sack",
        relationCount: "20",
        relationDirection: "canonical_per_unit",
        stockBehavior: "packaged_stock",
        transactionScale: 0,
      },
    ],
  }
  return {
    conversation: { id: "saved-rich-chat", status: "ACTIVE" },
    snapshot: productFormSnapshotSchema.parse(snapshot),
    running: false,
    receipt: null,
    draft: {
      revision: 7,
      entities: [
        {
          key: "product",
          payload: {
            kind: "product",
            name: "Corrected rice",
            unitName: "Kg",
            priceMinor: 12575,
            openingStock: "0",
            sellingUnits: [
              { name: "Wrong flattened unit", containsQuantity: "10" },
            ],
          },
        },
      ],
    },
  }
}

test("the actual WhatsApp route consumer resumes the exact rich snapshot plus supported corrections without approval or flattening owner facts", () => {
  const saved = savedRichProduct()
  const scope = { tenantId: "business", storeId: saved.snapshot.storeId }
  const link = workflowConversationAppLink(
    {
      purpose: "PRODUCT_CREATE",
      conversationId: saved.conversation.id,
      origin: scope,
    },
    { trustedAppOrigin: "https://dashboard.example.test", currentScope: scope },
  )
  if (!link) throw Error("Expected the owned saved Product route")
  const params = createLoader(catalogItemParamParsers)(new URL(link))
  if (!params.catalogConversation)
    throw Error("Expected actual consumer's exact conversation")
  const resumed = resumeProductForm(
    saved,
    params.catalogConversation,
    scope.storeId,
  )
  expect(params.catalogCreateMode).toBe("chat")
  expect(resumed.version).toEqual({
    conversationId: saved.conversation.id,
    revision: 7,
  })
  expect(resumed.snapshot.form).toEqual({
    ...saved.snapshot.form,
    name: "Corrected rice",
    price: "125.75",
  })
  for (const key of [
    "photoAssetIds",
    "illustrationId",
    "sku",
    "barcode",
    "category",
    "selectedHelperKey",
    "canonicalTransactionScale",
    "optionGroups",
    "variantDrafts",
    "additionalUnits",
    "storeId",
    "showAdvanced",
  ] as const)
    expect(resumed.snapshot[key]).toEqual(saved.snapshot[key])
  expect(productFormSnapshotSchema.safeParse(resumed.snapshot).success).toBe(
    true,
  )
  expect(new URL(link).searchParams.has("approvalToken")).toBe(false)
  expect(saved.draft.entities[0]?.payload).not.toHaveProperty("approved")
  expect(() => resumeProductForm(saved, "other-chat", scope.storeId)).toThrow()
  expect(() =>
    resumeProductForm(saved, saved.conversation.id, "other-store"),
  ).toThrow()
})

test("a newer polled revision cannot authorize locally edited older fields or fall back to ordinary catalog creation", () => {
  const saved = savedRichProduct()
  const { version, snapshot } = resumeProductForm(
    saved,
    saved.conversation.id,
    saved.snapshot.storeId,
  )
  const local = structuredClone(snapshot)
  local.form.name = "Unsaved local name"
  const premium = local.variantDrafts.premium
  if (!premium) throw Error("Expected the saved premium variant")
  local.variantDrafts.premium = {
    ...premium,
    quantity: "3.125",
  }
  const exactLocal = structuredClone(local)
  expect(
    productFormExpectedRevision(
      version,
      saved,
      version.conversationId,
      saved.snapshot.storeId,
    ),
  ).toBe(7)
  const changed = { ...saved, draft: { ...saved.draft, revision: 8 } }
  expect(() =>
    productFormExpectedRevision(
      version,
      changed,
      version.conversationId,
      saved.snapshot.storeId,
    ),
  ).toThrow("draft changed")
  expect(local).toEqual(exactLocal)
  expect(version.revision).toBe(7)
  for (const state of [
    undefined,
    { ...saved, running: true },
    { ...saved, receipt: "already-created" },
    {
      ...saved,
      conversation: { ...saved.conversation, status: "ARCHIVED" as const },
    },
  ])
    expect(() =>
      productFormExpectedRevision(
        version,
        state,
        version.conversationId,
        saved.snapshot.storeId,
      ),
    ).toThrow()
  expect(() =>
    productFormExpectedRevision(
      null,
      saved,
      version.conversationId,
      saved.snapshot.storeId,
    ),
  ).toThrow()
  // Only an explicit reload adopts the changed draft version; it still grants no approval.
  expect(
    resumeProductForm(changed, version.conversationId, saved.snapshot.storeId)
      .version.revision,
  ).toBe(8)
  const fresh = {
    isSuccess: true,
    isError: false,
    isFetching: false,
    isPaused: false,
    isFetchedAfterMount: true,
  }
  expect(productFormStateIsFresh(fresh, 1, 1)).toBe(true)
  expect(productFormStateIsFresh(fresh, 1, 2)).toBe(false)
  for (const patch of [
    { isFetchedAfterMount: false },
    { isFetching: true },
    { isError: true },
    { isPaused: true },
  ])
    expect(productFormStateIsFresh({ ...fresh, ...patch }, 1, 1)).toBe(false)
})
