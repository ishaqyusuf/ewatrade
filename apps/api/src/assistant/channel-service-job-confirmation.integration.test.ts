import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  generalActionSchema,
  generalReceiptSchema,
} from "@ewatrade/assistant/general/contracts"
import { createSimpleCatalogItem } from "@ewatrade/db/queries"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"

// Root alone selects this guarded QA suite. No import-time connection or live provider/model.
const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-service-job")
const released = process.env.ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS
let jalabiaId = ""
let trousersId = ""

beforeAll(async () => {
  if (!enabled) return
  process.env.ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS =
    "service_intake,service_job_line_transition,service_job_assign"
  await fixture.setup()
  const { db, tenantId, storeId, userId } = fixture
  const service = async (name: string, priceMinor: number) => {
    const item = await createSimpleCatalogItem(db, {
      tenantId,
      storeId,
      actorUserId: userId,
      clientOperationId: `${fixture.marker}-${name}`,
      kind: "service",
      name,
      priceMinor,
      workPolicy: "tracked",
      authorizationPolicy: "on_order_confirmation",
    })
    return (
      await db.sellableOffering.findFirstOrThrow({
        where: { catalogItemId: item.id },
      })
    ).id
  }
  jalabiaId = await service(`Jalabia wash ${fixture.marker}`, 40000)
  trousersId = await service(`Trousers iron ${fixture.marker}`, 25000)
}, 120_000)
afterAll(async () => {
  if (released === undefined)
    Reflect.deleteProperty(
      process.env,
      "ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS",
    )
  else process.env.ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS = released
  await fixture.cleanup()
}, 90_000)

suite("native WhatsApp laundry intake and job work", () => {
  test("quoted Confirm creates one open job, a reviewed line moves once, and a job changed after review is refused", async () => {
    const { db, tenantId } = fixture
    const intake = await fixture.stagedProposal({
      text: "Amina Bello: 5 jalabia wash and iron, 3 trousers iron only. Paid 1000 cash",
      payload: generalActionSchema.parse({
        action: "service_intake",
        customerName: "Amina Bello",
        lines: [
          { offeringId: jalabiaId, quantity: "5" },
          { offeringId: trousersId, quantity: "3" },
        ],
        initialPaymentMinor: 100000,
        initialPaymentMethod: "cash",
      }),
      reply: "Review this laundry job.",
      expectedReviewText: "Customer: Amina Bello.",
    })
    expect(intake.body).toContain("🧾 Review job")
    expect(intake.body).toContain("total ₦2,750.00")
    expect(intake.body).toContain("Initial recorded payment ₦1,000.00 · cash")
    expect(intake.body).toContain("balance ₦1,750.00")
    expect(intake.body).toContain("Nothing is sent to the customer.")
    expect(await db.serviceJob.count({ where: { tenantId } })).toBe(0)

    const created = await fixture.action(
      `Confirm ${intake.confirmCode}`,
      intake.providerMessageId,
    )
    const intakeProposal = await db.assistantActionProposal.findUniqueOrThrow({
      where: { id: intake.source.proposalId },
    })
    expect(intakeProposal.status).toBe("COMPLETED")
    const receipt = generalReceiptSchema.parse(intakeProposal.executedResult)
    expect(receipt.kind).toBe("service_intake")
    expect(created.outbox.content).toContain("Service intake confirmed")
    const jobs = await db.serviceJob.findMany({
      where: { tenantId },
      include: { lines: true },
    })
    expect(jobs).toHaveLength(1)
    const job = jobs[0]
    const jalabia = job?.lines.find(
      (line) => line.allocatedQuantity.toString() === "5",
    )
    if (!job || !jalabia) throw Error("Expected the tracked Jalabia line")
    expect(job.lines).toHaveLength(2)
    expect(jalabia.status).toBe("QUEUED")

    const started = await fixture.stagedProposal({
      text: "Jalabia started",
      payload: generalActionSchema.parse({
        action: "service_job_line_transition",
        jobId: job.id,
        lineId: jalabia.id,
        toStatus: "in_progress",
      }),
      reply: "Review this work update.",
      expectedReviewText: "Next work state: in_progress.",
    })
    expect(started.body).toContain("🧾 Review work update")
    expect(started.body).toContain("Current work: QUEUED")
    await fixture.action(
      `Confirm ${started.confirmCode}`,
      started.providerMessageId,
    )
    expect(
      (
        await db.serviceJobLine.findUniqueOrThrow({
          where: { id: jalabia.id },
        })
      ).status,
    ).toBe("IN_PROGRESS")

    // Reviewed as ready, then the same line is blocked elsewhere before Confirm.
    const ready = await fixture.stagedProposal({
      text: "Jalabia ready",
      payload: generalActionSchema.parse({
        action: "service_job_line_transition",
        jobId: job.id,
        lineId: jalabia.id,
        toStatus: "ready_for_handoff",
      }),
      reply: "Review this work update.",
      expectedReviewText: "Next work state: ready_for_handoff.",
    })
    const blocked = await fixture.stagedProposal({
      text: "Jalabia blocked, ink stain",
      payload: generalActionSchema.parse({
        action: "service_job_line_transition",
        jobId: job.id,
        lineId: jalabia.id,
        toStatus: "blocked",
        reason: "One jalabia has an ink stain",
      }),
      reply: "Review this work update.",
      expectedReviewText: "Reason: One jalabia has an ink stain",
    })
    await fixture.action(
      `Confirm ${blocked.confirmCode}`,
      blocked.providerMessageId,
    )
    await fixture.action(
      `Confirm ${ready.confirmCode}`,
      ready.providerMessageId,
    )
    expect(
      (
        await db.assistantActionProposal.findUniqueOrThrow({
          where: { id: ready.source.proposalId },
        })
      ).status,
    ).not.toBe("COMPLETED")
    expect(
      (
        await db.serviceJobLine.findUniqueOrThrow({
          where: { id: jalabia.id },
        })
      ).status,
    ).toBe("BLOCKED")
    expect(await db.serviceJob.count({ where: { tenantId } })).toBe(1)
  }, 1_200_000)
})
