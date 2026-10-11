import { expect, test } from "bun:test"
import { prisma as db } from "@ewatrade/db"
import { getActiveTenantForUser } from "@ewatrade/db/queries"
import { startGeneralConversation } from "@ewatrade/db/assistant-general"
import { assistantRouter } from "../trpc/routers/assistant"

const enabled =
  process.env.RUN_GENERAL_CORRECTION_HISTORY === "1" &&
  process.env.DATABASE_PROFILE_VERIFIED === "1"
// Synthetic completed DTOs only: no financial command runs in this read regression.
test.skipIf(!enabled)(
  "protected correction history reads completed DTOs without approval tokens",
  async () => {
    const [{ database }] = await db.$queryRaw<
      Array<{ database: string }>
    >`SELECT current_database() AS database`
    if (database !== "ewatrade_qa_v1") throw Error("Local QA only")
    const user = await db.user.findUniqueOrThrow({
      where: { email: "video.20261008-video-v1.web.bakery@ishaq.qa.test" },
    })
    const tenantId = "cmuzedcda000hbw9kd6e50z8u",
      storeId = "cmuzedcow000jbw9kluarpxfs"
    const tenantContext = await getActiveTenantForUser(db, {
      userId: user.id,
      storeId,
    })
    if (
      tenantContext?.tenant.id !== tenantId ||
      tenantContext.tenant.dataClassification !== "QA"
    )
      throw Error("QA scope mismatch")
    const session = await db.session.findFirstOrThrow({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
    })
    const conversation = await startGeneralConversation(db, {
      tenantId,
      storeId,
      userId: user.id,
    })
    console.log("Owned synthetic read fixture", conversation.id)
    try {
      for (const action of ["expense_void", "bill_payment_reverse"] as const) {
        const payload = {
          action,
          bookId: "qa-synthetic-book",
          effectiveAt: "2026-10-04T12:00:00.123Z",
          reason: "Synthetic DTO read test only",
          bookkeepingOnly: true,
          ...(action === "expense_void"
            ? { billId: "qa-synthetic-bill" }
            : { paymentId: "qa-synthetic-payment" }),
        }
        await db.assistantActionProposal.create({
          data: {
            conversationId: conversation.id,
            tenantId,
            storeId,
            actorUserId: user.id,
            action,
            payload,
            payloadHash: "synthetic-not-executable",
            roleSnapshot: "OWNER",
            approvalTokenHash: "synthetic-not-executable",
            expiresAt: new Date(),
            idempotencyKey: crypto.randomUUID(),
            status: "COMPLETED",
            executedResult: {
              kind: "finance_bill",
              recordId: "qa-synthetic-bill",
              bookId: "qa-synthetic-book",
              title: "Synthetic read fixture",
              detail: "No financial command executed",
            },
          },
        })
      }
      const ctx = {
        db,
        tenantContext,
        session: { session, user },
        requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
        requestId: crypto.randomUUID(),
        isInternalRequest: false,
      }
      const caller = assistantRouter.createCaller(
        ctx as Parameters<typeof assistantRouter.createCaller>[0],
      )
      const result = await caller.conversation({
        conversationId: conversation.id,
      })
      expect(result.proposals).toHaveLength(2)
      expect(result.proposals.map((p) => p.payload.action).sort()).toEqual([
        "bill_payment_reverse",
        "expense_void",
      ])
      expect(
        result.proposals.every(
          (p) => p.status === "COMPLETED" && !p.approvalToken,
        ),
      ).toBe(true)
      console.log(
        "Protected router including middleware passed with two completed correction DTOs",
      )
    } finally {
      await db.assistantConversation.delete({ where: { id: conversation.id } })
      expect(
        await db.assistantConversation.count({
          where: { id: conversation.id },
        }),
      ).toBe(0)
      await db.$disconnect()
    }
  },
  60000,
)
