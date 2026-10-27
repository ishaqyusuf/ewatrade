import { afterAll, beforeAll, expect, test } from "bun:test"
import { productCreateDraft } from "@ewatrade/assistant/general/product-create"
import {
  type GeneralTransactionContext,
  generalActionAdapter,
} from "./general-actions"
import { generalProposalForApp } from "./general-proposals"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"

const priorSigningKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "product-preparation-fixture-signing-key-32"
})
afterAll(() => {
  if (priorSigningKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = priorSigningKey
})

test("partial product drafts are editable but fail the confirmation boundary before any database access", async () => {
  const payload = productCreateDraft(
    { action: "product_create", name: "T-shirt", canonicalUnitName: "Piece" },
    "NGN",
  )
  const ctx = {
    db: new Proxy(
      {},
      {
        get() {
          throw Error("Unexpected database access")
        },
      },
    ),
  } as unknown as GeneralTransactionContext
  const adapter = generalActionAdapter(payload)
  expect(await adapter.validate(ctx, payload, false)).toBeNull()
  await expect(adapter.validate(ctx, payload, true)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  })
  await expect(
    adapter.validate(ctx, { ...payload, priceMinor: 150000 }, true),
  ).resolves.toBeNull()
})

test("even a signed pending partial product gets no app confirmation token; completing it enables its current revision", () => {
  const payload = productCreateDraft(
    { action: "product_create", name: "T-shirt", canonicalUnitName: "Piece" },
    "NGN",
  )
  const row = {
    id: "product-draft",
    revision: 1,
    payload,
    status: "PENDING",
    expiresAt: new Date(Date.now() + 60000),
    createdAt: new Date(),
    executedResult: null,
    tenantId: "business",
    storeId: "store",
    actorUserId: "owner",
    sessionId: "session",
    payloadHash: "a".repeat(64),
    approvalTokenHash: "",
  } as unknown as Parameters<typeof generalProposalForApp>[0]
  row.approvalTokenHash = proposalDigest(
    proposalApprovalToken(
      row,
      process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
    ),
  )
  expect(generalProposalForApp(row).approvalToken).toBeUndefined()
  const completed = { ...payload, priceMinor: 150000 }
  row.payload = completed
  row.revision += 1
  row.payloadHash = proposalDigest(completed)
  row.approvalTokenHash = proposalDigest(
    proposalApprovalToken(
      row,
      process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
    ),
  )
  expect(generalProposalForApp(row).approvalToken).toBeDefined()
})
