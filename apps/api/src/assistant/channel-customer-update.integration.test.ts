import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  generalActionSchema,
  generalReceiptSchema,
} from "@ewatrade/assistant/general/contracts"
import { appendAssistantMessage } from "@ewatrade/db/assistant"
import {
  deriveAssistantWhatsAppActionReviewCode,
  settleAssistantWhatsAppInbox,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import {
  createCustomerInTransaction,
  customerRevision,
  updateCustomerInTransaction,
} from "@ewatrade/db/queries"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { WHATSAPP_ACTION_INVALID_REPLY } from "./channel-action-turn"
import {
  isLinkedAssistantIdentity,
  lockLinkedAssistantIdentity,
} from "./channel-principal"
import { prepareAssistantWhatsAppReview } from "./channel-review-staging"
import { generalProposalReferencePart } from "./general-persistence"
import {
  editGeneralProposal,
  generalProposalWithReview,
} from "./general-proposals"
import { proposalDigest } from "./proposal-security"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-customer-update")
let customerId = ""
let decoyId = ""
const originalName = `Synthetic same-name customer ${fixture.marker}`
const originalPhone = "+2348130000001"
const finalPhone = "+2348130000003"
const finalName = `Synthetic corrected customer ${fixture.marker}`
const externalEmail = `${fixture.marker}@changed.example.test`
const rawCodes: string[] = []

beforeAll(async () => {
  await fixture.setup()
  if (!enabled) return
  const { db, tenantId } = fixture
  customerId = (
    await createCustomerInTransaction(db, {
      tenantId,
      name: originalName,
      phone: originalPhone,
      email: `${fixture.marker}@original.example.test`,
    })
  ).id
  decoyId = (
    await createCustomerInTransaction(db, {
      tenantId,
      name: originalName,
      phone: "+2348130000002",
    })
  ).id
}, 90_000)

afterAll(async () => {
  if (enabled && fixture.db) {
    const { db, tenantId, userId, storeId } = fixture
    try {
      const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
      if (tenant) {
        expect(tenant).toMatchObject({
          slug: tenantId,
          dataClassification: "QA",
          qaSourceDomain: "assistant-action-confirmation.test",
        })
        for (const customer of await db.customer.findMany({
          where: { tenantId },
        }))
          expect([customerId, decoyId]).toContain(customer.id)
        for (const proposal of await db.assistantActionProposal.findMany({
          where: { tenantId },
        }))
          expect(proposal).toMatchObject({
            action: "customer_update",
            actorUserId: userId,
            storeId,
            conversationId: fixture.conversationId,
            targetRecordId: customerId,
          })
        expect(await db.financeBook.count({ where: { tenantId } })).toBe(0)
        expect(await db.commercialOrder.count({ where: { tenantId } })).toBe(0)
        expect(await db.catalogItem.count({ where: { tenantId } })).toBe(0)
        expect(
          await db.assistantAttachment.count({ where: { tenantId } }),
        ).toBe(0)
      }
    } catch (error) {
      await db.$disconnect()
      throw new Error(
        `Customer update cleanup unverified; retained fixture ${tenantId}`,
        { cause: error },
      )
    }
  }
  await fixture.cleanup()
}, 90_000)

/** The completed-model stand-in persists only the exact real canonical edit result, never an invented review. */
async function editAndReview(proposalId: string, revision: number) {
  const { db, tenantId, userId, conversationId } = fixture
  const inbox = await fixture.incoming(
    "Correct this saved customer draft to the final name and phone, keeping its exact target.",
  )
  const claimed = await fixture.claim(inbox.id)
  const ctx = await fixture.context(inbox.requestId, claimed.lease)
  const edited = await editGeneralProposal(ctx, {
    proposalId,
    revision,
    payload: generalActionSchema.parse({
      action: "customer_update",
      customerId,
      name: finalName,
      phone: finalPhone,
    }),
  })
  const source = {
    proposalId: edited.id,
    revision: edited.revision,
    payloadHash: proposalDigest(edited.payload),
  }
  const reference = generalProposalReferencePart(edited.id, source)
  if (!reference)
    throw Error("Exact canonical edited proposal source unavailable")
  await db.$transaction(async (tx) => {
    if (!isLinkedAssistantIdentity(ctx.session))
      throw Error("Real linked edit context required")
    const resolved = await lockLinkedAssistantIdentity(tx, ctx.session)
    await stampAssistantWhatsAppExecution(tx, claimed.lease, resolved)
    const messageId = randomUUID()
    expect(
      await appendAssistantMessage(tx, {
        conversationId,
        message: {
          id: messageId,
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "Review this exact corrected customer draft.",
            },
            reference,
          ],
        },
      }),
    ).toBe(true)
    const run = await tx.assistantRun.create({
      data: {
        conversationId,
        actorUserId: userId,
        requestId: inbox.requestId,
        provider: "ewatrade-rehearsal",
        model: "synthetic-no-model",
        promptVersion: "synthetic-exact-edited-proposal-source",
        status: "COMPLETED",
        completedAt: new Date(),
        assistantMessageId: messageId,
      },
    })
    await tx.assistantWhatsAppInbox.update({
      where: { id: inbox.id },
      data: { runId: run.id },
    })
  })
  const row = await db.assistantActionProposal.findUniqueOrThrow({
    where: { id: edited.id },
  })
  expect(row).toMatchObject({
    tenantId,
    actorUserId: userId,
    revision: revision + 1,
    targetRecordId: customerId,
    status: "PENDING",
  })
  const canonical = await generalProposalWithReview(ctx, row)
  expect(canonical.review).toContain(`Name: ${originalName} → ${finalName}`)
  expect(canonical.review).toContain(`Phone: ${originalPhone} → ${finalPhone}`)
  expect(canonical.presentation?.table?.rows).toHaveLength(2)
  const review = await prepareAssistantWhatsAppReview(db, claimed.lease)
  if (!review) throw Error("Expected exact complete edited customer review")
  expect(review.source).toEqual(source)
  expect(review.targetRevision).toBe(row.targetRevision)
  for (const fact of [originalName, finalName, originalPhone, finalPhone])
    expect(review.body).toContain(fact)
  expect(
    await settleAssistantWhatsAppInbox(db, claimed.lease, {
      permittedUserIds: [userId],
      review,
    }),
  ).toEqual({ state: "COMPLETED" })
  const outbox = await db.assistantWhatsAppOutbox.findFirstOrThrow({
    where: { inboxId: inbox.id, renderKind: "action_review" },
  })
  const proof = await db.assistantWhatsAppActionReview.findUniqueOrThrow({
    where: { reviewOutboxId: outbox.id },
  })
  expect(proof).toMatchObject({
    proposalId: edited.id,
    proposalRevision: edited.revision,
    payloadHash: source.payloadHash,
    targetRevision: row.targetRevision,
    state: "PENDING",
  })
  const material = {
    bindingId: proof.bindingId,
    proposalId: proof.proposalId,
    proposalRevision: proof.proposalRevision,
    payloadHash: proof.payloadHash,
    targetRevision: proof.targetRevision,
    reviewDigest: proof.reviewDigest,
    authorityDigest: proof.authorityDigest,
    identityGeneration: proof.identityGeneration,
    grantGeneration: proof.grantGeneration,
    selectionGeneration: proof.selectionGeneration,
    reviewOutboxId: proof.reviewOutboxId,
    nonce: proof.nonce,
    keyVersion: proof.keyVersion,
    expiresAt: proof.expiresAt,
  }
  const confirmCode = deriveAssistantWhatsAppActionReviewCode(
    material,
    "confirm",
    fixture.signingKey,
  )
  const cancelCode = deriveAssistantWhatsAppActionReviewCode(
    material,
    "cancel",
    fixture.signingKey,
  )
  rawCodes.push(confirmCode, cancelCode)
  const delivery = await fixture.fakeAcceptedDelivery(outbox.id)
  expect(delivery.body).toContain(`Confirm ${confirmCode}`)
  expect(delivery.body).toContain(`Cancel ${cancelCode}`)
  return { source, proof, row, confirmCode, ...delivery }
}

suite("native customer update exact edited review", () => {
  test("current-record change and old revision refuse; refreshed comparison confirms exact target once and replays receipt", async () => {
    const { db, tenantId, conversationId } = fixture
    const original = await db.customer.findUniqueOrThrow({
      where: { id: customerId },
    })
    const decoy = await db.customer.findUniqueOrThrow({
      where: { id: decoyId },
    })
    const initial = await fixture.stagedProposal({
      text: "Update the selected saved customer's name and phone.",
      payload: generalActionSchema.parse({
        action: "customer_update",
        customerId,
        name: "Synthetic interim correction",
        phone: finalPhone,
      }),
      reply: "Review this exact saved customer update.",
      expectedReviewText: originalName,
    })
    const pending = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: initial.source.proposalId },
    })
    expect(pending.targetRecordId).toBe(customerId)
    expect(pending.targetRevision).toBe(customerRevision(original))
    expect(initial.proof.targetRevision).toBe(pending.targetRevision)
    // A real independent canonical directory edit changes the target, without applying this proposal.
    await db.$transaction((tx) =>
      updateCustomerInTransaction(tx, {
        tenantId,
        customerId,
        expectedRevision: customerRevision(original),
        email: externalEmail,
      }),
    )
    const changed = await db.customer.findUniqueOrThrow({
      where: { id: customerId },
    })
    expect(changed).toMatchObject({
      name: originalName,
      phone: originalPhone,
      email: externalEmail,
    })
    expect(customerRevision(changed)).not.toBe(pending.targetRevision)
    const targetStale = await fixture.action(
      `Confirm ${initial.confirmCode}`,
      initial.providerMessageId,
    )
    expect(targetStale.outbox.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
    expect(
      await db.customer.findUniqueOrThrow({ where: { id: customerId } }),
    ).toEqual(changed)
    expect(
      await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: pending.id },
      }),
    ).toMatchObject({ status: "PENDING", revision: initial.source.revision })
    expect(
      await db.assistantWhatsAppActionReview.findUniqueOrThrow({
        where: { id: initial.proof.id },
      }),
    ).toMatchObject({
      state: "PENDING",
      consumedByIngressId: null,
      resultRef: null,
    })

    const fresh = await editAndReview(pending.id, pending.revision)
    expect(fresh.source.revision).toBe(initial.source.revision + 1)
    expect(fresh.proof.targetRevision).toBe(customerRevision(changed))
    expect(fresh.proof.targetRevision).not.toBe(initial.proof.targetRevision)
    expect(fresh.confirmCode).not.toBe(initial.confirmCode)
    const oldRevision = await fixture.action(
      `Confirm ${initial.confirmCode}`,
      initial.providerMessageId,
    )
    expect(oldRevision.outbox.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
    expect(
      await db.customer.findUniqueOrThrow({ where: { id: customerId } }),
    ).toEqual(changed)
    const confirmed = await fixture.action(
      `Confirm ${fresh.confirmCode}`,
      fresh.providerMessageId,
    )
    expect(confirmed.inbox.content).toMatchObject({
      type: "action_result",
      resultRef: {
        proposalId: pending.id,
        revision: fresh.source.revision,
        status: "COMPLETED",
        decision: "confirm",
      },
    })
    const completed = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: pending.id },
    })
    const receipt = generalReceiptSchema.parse(completed.executedResult)
    expect(receipt).toMatchObject({
      kind: "customer",
      recordId: customerId,
      title: "Customer updated",
    })
    expect(receipt.detail).toContain(finalName)
    expect(confirmed.outbox.content).toContain("Customer updated")
    const updated = await db.customer.findUniqueOrThrow({
      where: { id: customerId },
    })
    expect(updated).toMatchObject({
      name: finalName,
      phone: finalPhone,
      email: externalEmail,
    })
    expect(updated.updatedAt).not.toEqual(changed.updatedAt)
    expect(
      await db.customer.findUniqueOrThrow({ where: { id: decoyId } }),
    ).toEqual(decoy)
    expect(await db.customer.count({ where: { tenantId } })).toBe(2)
    const runsBeforeReplay = await db.assistantRun.count({
      where: { conversationId },
    })
    expect(runsBeforeReplay).toBe(2)
    const replay = await fixture.action(
      `Confirm ${fresh.confirmCode}`,
      fresh.providerMessageId,
    )
    expect(replay.inbox.id).not.toBe(confirmed.inbox.id)
    expect(replay.inbox.content).toEqual(confirmed.inbox.content)
    expect(replay.outbox.content).toBe(confirmed.outbox.content)
    expect(
      await db.customer.findUniqueOrThrow({ where: { id: customerId } }),
    ).toEqual(updated)
    expect(
      await db.customer.findUniqueOrThrow({ where: { id: decoyId } }),
    ).toEqual(decoy)
    expect(await db.customer.count({ where: { tenantId } })).toBe(2)
    expect(await db.assistantRun.count({ where: { conversationId } })).toBe(
      runsBeforeReplay,
    )
    expect(
      await db.assistantWhatsAppActionReview.findUniqueOrThrow({
        where: { id: fresh.proof.id },
      }),
    ).toMatchObject({
      state: "CONSUMED",
      decision: "confirm",
      consumedByIngressId: confirmed.inbox.id,
    })
    await fixture.assertNoStoredDecisionCodes()
    const saved = JSON.stringify({
      messages: await db.assistantMessage.findMany({
        where: { conversationId },
      }),
      inbox: await db.assistantWhatsAppInbox.findMany({
        where: { bindingId: fixture.principal.bindingId },
      }),
      outbox: await db.assistantWhatsAppOutbox.findMany({
        where: { inbox: { bindingId: fixture.principal.bindingId } },
      }),
      proofs: await db.assistantWhatsAppActionReview.findMany({
        where: { bindingId: fixture.principal.bindingId },
      }),
    })
    for (const code of rawCodes) expect(saved).not.toContain(code)
  }, 420_000)
})
