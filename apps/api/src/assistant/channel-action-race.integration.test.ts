import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  type GeneralAnswer,
  generalAnswerSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  WHATSAPP_ACTION_INVALID_REPLY,
  processAssistantWhatsAppAction,
} from "./channel-action-turn"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { decideGeneralProposal } from "./general-proposals"
import { createGeneralTools } from "./general-tools"
import { proposalApprovalToken } from "./proposal-security"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-action-race")
beforeAll(() => fixture.setup(), 90_000)
afterAll(() => fixture.cleanup(), 60_000)

/** Real branded context and fresh canonical checks; no synthetic linked brand or domain effect. */
async function verifyHandoffAuthority() {
  const answers: GeneralAnswer[] = []
  const tools = createGeneralTools(
    await fixture.context(`${fixture.marker}-handoff`),
    fixture.conversationId,
    () => {
      throw Error("Handoff must not create a proposal")
    },
    (answer) => answers.push(answer),
  )
  const execute = tools.handoffAction?.execute
  if (!execute)
    throw Error("Expected app destination handoffs for eligible Owner")
  const invoke = (action: string) =>
    execute(
      { action },
      { toolCallId: `${fixture.marker}-handoff-${action}`, messages: [] },
    )
  expect(await invoke("stock_receive")).toMatchObject({
    status: "available",
    data: { status: "app_review", action: "stock_receive" },
  })
  expect(answers).toHaveLength(1)
  expect(generalAnswerSchema.parse(answers[0]).handoff).toMatchObject({
    capabilityId: "inventory.stock.receive",
    action: "stock_receive",
    conversation: {
      conversationId: fixture.conversationId,
      origin: { tenantId: fixture.tenantId, storeId: fixture.storeId },
    },
  })
  try {
    // The same already-listed tool must recheck later role and plan changes before answering.
    await fixture.db.membership.update({
      where: { id: fixture.membershipId },
      data: { role: "CASHIER" },
    })
    expect(await invoke("stock_receive")).toMatchObject({
      status: "unavailable",
    })
    await fixture.db.membership.update({
      where: { id: fixture.membershipId },
      data: { role: "OWNER" },
    })
    await fixture.db.tenant.update({
      where: { id: fixture.tenantId },
      data: { metadata: { retailOps: { subscription: { planId: "free" } } } },
    })
    expect(await invoke("expense_record")).toMatchObject({
      status: "unavailable",
    })
    expect(await invoke("staff_access")).toMatchObject({
      status: "unavailable",
    })
    expect(answers).toHaveLength(1)
    expect(
      await fixture.db.assistantActionProposal.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(0)
    expect(
      await fixture.db.customer.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(0)
  } finally {
    await fixture.db.membership.update({
      where: { id: fixture.membershipId },
      data: { role: "OWNER" },
    })
    await fixture.db.tenant.update({
      where: { id: fixture.tenantId },
      data: { metadata: { retailOps: { subscription: { planId: "pro" } } } },
    })
  }
}

suite("actual browser and quoted WhatsApp action proof boundaries", () => {
  test("real browser Session confirmation races the claimed WhatsApp action with exactly one canonical effect", async () => {
    await verifyHandoffAuthority()
    const name = "Synthetic cross-channel race customer"
    const review = await fixture.stagedCustomer(name)
    const inbox = await fixture.incoming(
      `Confirm ${review.confirmCode}`,
      review.providerMessageId,
    )
    const claimed = await fixture.claim(inbox.id)
    const linked = await fixture.context(inbox.requestId, claimed.lease)
    const browser = await fixture.browserContext()
    expect(browser.session.session?.id).toBe(fixture.sessionId)
    expect(linked.session.session).toBeNull()
    const pending = await fixture.db.assistantActionProposal.findUniqueOrThrow({
      where: { id: review.source.proposalId },
    })
    const [browserResult, channelResult] = await Promise.all([
      decideGeneralProposal(browser, {
        proposalId: pending.id,
        revision: pending.revision,
        decision: "confirm",
        approvalToken: proposalApprovalToken(pending, fixture.signingKey),
      }),
      processAssistantWhatsAppAction(linked, claimed.lease),
    ])
    expect(browserResult.status).toBe("COMPLETED")
    expect(browserResult.receipt).toMatchObject({
      kind: "customer",
      detail: name,
    })
    expect(channelResult.status).toBe("completed")
    if (channelResult.status !== "completed")
      throw Error("Expected committed action result or safe refusal")
    const canonical =
      await fixture.db.assistantActionProposal.findUniqueOrThrow({
        where: { id: pending.id },
      })
    expect(canonical.status).toBe("COMPLETED")
    expect(canonical.executedResult).toEqual(browserResult.receipt)
    expect(
      await fixture.db.customer.count({
        where: { tenantId: fixture.tenantId, name },
      }),
    ).toBe(1)
    const actionInbox =
      await fixture.db.assistantWhatsAppInbox.findUniqueOrThrow({
        where: { id: inbox.id },
      })
    expect(actionInbox.state).toBe("COMPLETED")
    expect(actionInbox.runId).toBeNull()
    expect(
      await fixture.db.assistantWhatsAppOutbox.count({
        where: { inboxId: inbox.id },
      }),
    ).toBe(1)
    const output = await fixture.db.assistantWhatsAppOutbox.findUniqueOrThrow({
      where: { id: channelResult.outboxId },
    })
    const proof =
      await fixture.db.assistantWhatsAppActionReview.findUniqueOrThrow({
        where: { id: review.proof.id },
      })
    if (proof.state === "CONSUMED") {
      expect(proof.consumedByIngressId).toBe(inbox.id)
      expect(proof.completedAt).not.toBeNull()
      expect(actionInbox.content).toMatchObject({
        type: "action_result",
        resultRef: {
          proposalId: pending.id,
          status: "COMPLETED",
          decision: "confirm",
        },
      })
      expect(output.content).toContain(name)
    } else {
      expect(proof.state).toBe("PENDING")
      expect(actionInbox.content).toEqual({ type: "action_refusal" })
      expect(output.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
    }
    await fixture.fakeAcceptedDelivery(output.id)
    expect(
      await fixture.db.assistantRun.count({
        where: { conversationId: fixture.conversationId },
      }),
    ).toBe(1)
    await fixture.assertNoStoredDecisionCodes()
  }, 240_000)

  test("cancel has its own proof, duplicate cancellation recovers its result and cannot become confirmation", async () => {
    const count = await fixture.db.customer.count({
      where: { tenantId: fixture.tenantId },
    })
    const review = await fixture.stagedCustomer("Synthetic cancelled customer")
    const cancelled = await fixture.action(
      `Cancel ${review.cancelCode}`,
      review.providerMessageId,
    )
    expect(cancelled.inbox.content).toMatchObject({
      type: "action_result",
      resultRef: {
        proposalId: review.source.proposalId,
        status: "CANCELLED",
        decision: "cancel",
      },
    })
    expect(
      (
        await fixture.db.assistantActionProposal.findUniqueOrThrow({
          where: { id: review.source.proposalId },
        })
      ).status,
    ).toBe("CANCELLED")
    const duplicate = await fixture.action(
      `Cancel ${review.cancelCode}`,
      review.providerMessageId,
    )
    expect(duplicate.inbox.content).toEqual(cancelled.inbox.content)
    expect(duplicate.outbox.content).toBe(cancelled.outbox.content)
    const opposite = await fixture.action(
      `Confirm ${review.confirmCode}`,
      review.providerMessageId,
    )
    expect(opposite.outbox.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
    expect(
      await fixture.db.assistantWhatsAppActionReview.findUniqueOrThrow({
        where: { id: review.proof.id },
      }),
    ).toMatchObject({
      state: "CONSUMED",
      decision: "cancel",
      consumedByIngressId: cancelled.inbox.id,
    })
    expect(
      await fixture.db.customer.count({
        where: { tenantId: fixture.tenantId },
      }),
    ).toBe(count)
    await fixture.assertNoStoredDecisionCodes()
  }, 240_000)

  test("forwarded code in another binding and a fresh loss of action role both refuse without consuming proof", async () => {
    const count = await fixture.db.customer.count({
      where: { tenantId: fixture.tenantId },
    })
    const forwarded = await fixture.stagedCustomer(
      "Synthetic forwarded customer",
    )
    const originalBinding = fixture.principal.bindingId
    await fixture.switchConversation()
    expect(fixture.principal.bindingId).not.toBe(originalBinding)
    const refused = await fixture.action(
      `Confirm ${forwarded.confirmCode}`,
      forwarded.providerMessageId,
    )
    expect(refused.outbox.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
    expect(
      (
        await fixture.db.assistantWhatsAppActionReview.findUniqueOrThrow({
          where: { id: forwarded.proof.id },
        })
      ).state,
    ).toBe("CANCELLED")

    const lostRole = await fixture.stagedCustomer(
      "Synthetic role-refused customer",
    )
    await fixture.db.membership.update({
      where: { id: fixture.membershipId },
      data: { role: "CASHIER" },
    })
    try {
      const denied = await fixture.action(
        `Confirm ${lostRole.confirmCode}`,
        lostRole.providerMessageId,
      )
      expect(denied.outbox.content).toBe(WHATSAPP_ACTION_INVALID_REPLY)
      expect(
        (
          await fixture.db.assistantWhatsAppActionReview.findUniqueOrThrow({
            where: { id: lostRole.proof.id },
          })
        ).state,
      ).toBe("PENDING")
      expect(
        (
          await fixture.db.assistantActionProposal.findUniqueOrThrow({
            where: { id: lostRole.source.proposalId },
          })
        ).status,
      ).toBe("PENDING")
      expect(
        await fixture.db.customer.count({
          where: { tenantId: fixture.tenantId },
        }),
      ).toBe(count)
    } finally {
      await fixture.db.membership.update({
        where: { id: fixture.membershipId },
        data: { role: "OWNER" },
      })
    }
    await fixture.assertNoStoredDecisionCodes()
  }, 240_000)
})
