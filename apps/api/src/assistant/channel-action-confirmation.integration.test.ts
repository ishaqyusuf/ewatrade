import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { WHATSAPP_ACTION_INVALID_REPLY } from "./channel-action-turn"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { editGeneralProposal } from "./general-proposals"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-confirm")
const {
  marker,
  tenantId,
  conversationId,
  stagedCustomer,
  action,
  assertNoStoredDecisionCodes,
  context,
} = fixture
let db: typeof fixture.db
beforeAll(async () => {
  await fixture.setup()
  db = fixture.db
}, 90_000)
afterAll(() => fixture.cleanup(), 60_000)

suite("actual quoted WhatsApp canonical confirmation", () => {
  test("wrong quote/decision cannot consume; valid confirmation and distinct-ingress duplicate create one customer and return the same receipt", async () => {
    const name = "Synthetic exact confirmed customer"
    const review = await stagedCustomer(name)
    const wrongQuote = await action(
      `Confirm ${review.confirmCode}`,
      "wamid.unrelated-review",
    )
    expect(wrongQuote.outbox.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
    const wrongDecision = await action(
      `Cancel ${review.confirmCode}`,
      review.providerMessageId,
    )
    expect(wrongDecision.outbox.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
    expect(await db.customer.count({ where: { tenantId } })).toBe(0)
    expect(
      (
        await db.assistantWhatsAppActionReview.findUniqueOrThrow({
          where: { id: review.proof.id },
        })
      ).state,
    ).toBe("PENDING")

    const confirmed = await action(
      `Confirm ${review.confirmCode}`,
      review.providerMessageId,
    )
    expect(confirmed.inbox.content).toMatchObject({
      type: "action_result",
      resultRef: {
        proposalId: review.source.proposalId,
        revision: review.source.revision,
        status: "COMPLETED",
        decision: "confirm",
      },
    })
    expect(confirmed.outbox.content).toContain("Customer added")
    expect(confirmed.outbox.content).toContain(name)
    const proposal = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: review.source.proposalId },
    })
    expect(proposal.status).toBe("COMPLETED")
    expect(proposal.executedResult).toMatchObject({
      kind: "customer",
      title: "Customer added",
      detail: name,
    })
    expect(await db.customer.count({ where: { tenantId, name } })).toBe(1)
    const consumed = await db.assistantWhatsAppActionReview.findUniqueOrThrow({
      where: { id: review.proof.id },
    })
    expect(consumed).toMatchObject({
      state: "CONSUMED",
      decision: "confirm",
      consumedByIngressId: confirmed.inbox.id,
    })
    expect(consumed.completedAt).not.toBeNull()

    const duplicate = await action(
      `Confirm ${review.confirmCode}`,
      review.providerMessageId,
    )
    expect(duplicate.inbox.id).not.toBe(confirmed.inbox.id)
    expect(duplicate.inbox.content).toEqual(confirmed.inbox.content)
    expect(duplicate.outbox.content).toBe(confirmed.outbox.content)
    expect(await db.customer.count({ where: { tenantId } })).toBe(1)
    expect(
      (
        await db.assistantWhatsAppActionReview.findUniqueOrThrow({
          where: { id: review.proof.id },
        })
      ).consumedByIngressId,
    ).toBe(confirmed.inbox.id)
    expect(await db.assistantRun.count({ where: { conversationId } })).toBe(1)
    await assertNoStoredDecisionCodes()
  }, 240_000)

  test("a canonical edit or expired exact proof prevents stale confirmation without creating a customer", async () => {
    const customerCount = await db.customer.count({ where: { tenantId } })
    const name = "Synthetic stale customer"
    const review = await stagedCustomer(name)
    await editGeneralProposal(await context(`${marker}-edit`), {
      proposalId: review.source.proposalId,
      revision: review.source.revision,
      payload: {
        action: "customer_create",
        name: "Synthetic corrected customer",
      },
    })
    const stale = await action(
      `Confirm ${review.confirmCode}`,
      review.providerMessageId,
    )
    expect(stale.outbox.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
    expect(await db.customer.count({ where: { tenantId } })).toBe(customerCount)
    expect(
      await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: review.source.proposalId },
      }),
    ).toMatchObject({ status: "PENDING", revision: review.source.revision + 1 })
    expect(
      (
        await db.assistantWhatsAppActionReview.findUniqueOrThrow({
          where: { id: review.proof.id },
        })
      ).state,
    ).toBe("PENDING")

    const expired = await stagedCustomer("Synthetic expired customer")
    // Fixture clock boundary: proof was actually staged and accepted before it expires.
    await db.assistantWhatsAppActionReview.update({
      where: { id: expired.proof.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const refused = await action(
      `Confirm ${expired.confirmCode}`,
      expired.providerMessageId,
    )
    expect(refused.outbox.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
    expect(await db.customer.count({ where: { tenantId } })).toBe(customerCount)
    expect(
      (
        await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: expired.source.proposalId },
        })
      ).status,
    ).toBe("PENDING")
    expect(
      (
        await db.assistantWhatsAppActionReview.findUniqueOrThrow({
          where: { id: expired.proof.id },
        })
      ).state,
    ).toBe("PENDING")
    await assertNoStoredDecisionCodes()
  }, 240_000)
})
