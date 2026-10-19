import { randomUUID } from "node:crypto"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import {
  type ServiceWorkCompletionReceipt,
  serviceWorkCompletionReceipt,
} from "@ewatrade/assistant/general/service-work-completion"
import { listOrderPaymentAccounts } from "@ewatrade/db/queries"
import { getServiceWorkOriginalInTransaction } from "@ewatrade/db/service-work-original"
import type { Prisma } from "@ewatrade/db/types"
import { TRPCError } from "@trpc/server"
import {
  type G02BudgetCall,
  observeG02BudgetCalls,
} from "./general-cash-count-budget-trace"
import { cashCountReceiptFault } from "./general-cash-count-receipt-fault"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  generalProposalForApp,
} from "./general-proposals"
import { serviceWorkCompletion } from "./general-service-work-completion"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"
import {
  assertServiceIntakeSignedFactsUnchanged,
  serviceIntakeSignedRollbackFacts,
  verifyServiceIntakeSignedFinanceInventory,
} from "./service-intake-signed-rollback-facts"
import {
  signedIntakeCheck as check,
  serviceIntakeSignedScope,
  serviceIntakeSignedTransactionBridge,
} from "./service-intake-signed-rollback-guards"
import { runCompletionSignedCases } from "./service-work-completion-signed-rollback-cases"
import { seedCompletionSignedFixture } from "./service-work-completion-signed-rollback-fixture"
import {
  assertCompletionSignedAvailability,
  assertCompletionSignedEnvironment,
  assertCompletionSignedScope,
  completionSignedFeatureConfiguration,
} from "./service-work-completion-signed-rollback-guards"
export { CompletionSignedRollbackFailure } from "./service-work-completion-signed-rollback-cases"

async function conflict(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    if (error instanceof TRPCError && error.code === "CONFLICT") return
    throw error
  }
  throw Error("Expected exact signed CONFLICT refusal")
}

// Native rows include Date/Decimal objects; canonical proposal JSON alone omits
// Date contents. Compare their serialized stored values, including all times.
const nativeRowDigest = (value: unknown) =>
  proposalDigest(JSON.parse(JSON.stringify(value)))

/** SOURCE ONLY. No entry point, schedule, rollout override, durable fixture or provider call. */
export async function verifyServiceWorkCompletionSignedRollback(
  ctx: GeneralContext,
  conversationId: string,
  repositoryRoot: string,
) {
  if (!ctx.session.session)
    throw new Error("A real browser Session is required for this verifier.")
  assertCompletionSignedEnvironment(process.env)
  const featureConfiguration =
    completionSignedFeatureConfiguration(repositoryRoot)
  // Stop before DB access/fixture writes while the real dispatcher capabilities are planned.
  assertCompletionSignedAvailability(capabilityManifest)
  const db = ctx.db
  const {
    tenantId,
    storeId,
    userId: actorUserId,
    email,
  } = serviceIntakeSignedScope
  const [identity] = await db.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`
  assertCompletionSignedScope(
    {
      database: identity?.database ?? "",
      tenantId: ctx.tenantContext.tenant.id,
      storeId: ctx.tenantContext.activeStore?.id ?? "",
      userId: ctx.session.user.id,
      conversationId,
      sessionId: ctx.session.session.id,
    },
    process.env,
  )
  const member = await db.membership.findFirstOrThrow({
    where: {
      tenantId,
      userId: actorUserId,
      role: "OWNER",
      status: "ACTIVE",
      tenant: { dataClassification: "QA", isActive: true },
      user: { email },
    },
    select: { id: true },
  })
  check(
    member.id === ctx.tenantContext.membership.id,
    "Exact existing QA Owner membership required",
  )
  await db.store.findFirstOrThrow({
    where: { id: storeId, tenantId, status: "ACTIVE" },
    select: { id: true },
  })
  await db.session.findFirstOrThrow({
    where: {
      id: ctx.session.session.id,
      userId: actorUserId,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  })
  await db.assistantConversation.findFirstOrThrow({
    where: {
      id: conversationId,
      tenantId,
      storeId,
      ownerUserId: actorUserId,
      purpose: "GENERAL",
      status: "ACTIVE",
    },
    select: { id: true },
  })
  const store = await db.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { currencyCode: true },
  })
  const accounts = await listOrderPaymentAccounts(
    db as unknown as Prisma.TransactionClient,
    {
      tenantId,
      currencyCode: store.currencyCode,
    },
  )
  const account = accounts.accounts.find(
    (row) => row.id === process.env.D05_QA_RECEIVING_ACCOUNT_ID,
  )
  check(
    accounts.book &&
      account &&
      !account.paused &&
      account.paymentMethods.includes("cash"),
    "Coordinator must pin an existing active cash-capable account; no Finance setup/account workaround permitted",
  )
  const receivingAccountId = account.id
  await verifyServiceIntakeSignedFinanceInventory(db)
  const recovery = { rework: randomUUID(), handoff: randomUUID() }
  const startedAt = new Date().toISOString()
  const completed = await runCompletionSignedCases({
    facts: () => serviceIntakeSignedRollbackFacts(db, tenantId),
    transaction: (
      run: (tx: Prisma.TransactionClient) => Promise<never>,
      options,
    ) => db.$transaction(run, options),
    runCase: async (name, tx: Prisma.TransactionClient, checks) => {
      const rework = name.startsWith("rework-")
      const paired =
        name.includes("receipt-failure") || name.includes("recovery-replay")
      // Stable proposal/command key across separately rolled-back failure/recovery fixtures.
      const nonce = paired
        ? recovery[rework ? "rework" : "handoff"]
        : randomUUID()
      const fixture = await seedCompletionSignedFixture(tx, {
        tenantId,
        storeId,
        actorUserId,
        nonce,
        receivingAccountId,
        settled: name !== "handoff-unpaid-refusal",
        stage:
          name === "handoff-unready-refusal" ||
          name === "rework-incomplete-refusal"
            ? "queued"
            : rework
              ? "completed"
              : "ready",
      })
      checks.push(
        "genuine-native-positive-price-intake-payment-and-work-fixture",
      )
      const payload = rework
        ? {
            action: "service_work_rework" as const,
            jobId: fixture.job.id,
            lineId: fixture.line.id,
            quantity: "1.25",
            reason: "Redo the exact original completed allocation",
          }
        : {
            action: "service_work_handoff" as const,
            jobId: fixture.job.id,
            note: "Collected by customer",
          }
      const budgetCalls: G02BudgetCall[] = []
      const observed = observeG02BudgetCalls(tx, "transaction", (call) =>
        budgetCalls.push(call),
      )
      const runContext = (
        client: Prisma.TransactionClient = observed,
      ): GeneralContext => ({
        ...ctx,
        db: serviceIntakeSignedTransactionBridge(
          client,
        ) as unknown as GeneralContext["db"],
      })
      const facts = () => serviceIntakeSignedRollbackFacts(tx, tenantId)
      if (name.endsWith("-refusal")) {
        const seeded = await facts()
        // A nonreviewable native target cannot obtain a signed proposal at all.
        await conflict(() =>
          draftGeneralProposal(runContext(), conversationId, payload),
        )
        assertServiceIntakeSignedFactsUnchanged(seeded, await facts())
        check(budgetCalls.length === 0, "Refusal called saved budget methods")
        checks.push(
          "real-general-draft-refusal-before-proposal-or-native-writes",
          "full-seeded-state-and-budget-preserved",
        )
        return {
          proposalId: null,
          commandKey: null,
          budgetCalls,
          receipt: null,
        }
      }
      const review = await serviceWorkCompletion.review(
        { ...ctx, db: tx },
        payload,
      )
      const binding = {
        id: nonce,
        tenantId,
        storeId,
        actorUserId,
        revision: 1,
        expiresAt: new Date(Date.now() + 900000),
        payloadHash: proposalDigest(payload),
      }
      const token = proposalApprovalToken(
        binding,
        process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
      )
      const key = `assistant_${nonce}`
      const row = await tx.assistantActionProposal.create({
        data: {
          ...binding,
          conversationId,
          action: payload.action,
          payload,
          roleSnapshot: "OWNER",
          approvalTokenHash: proposalDigest(token),
          idempotencyKey: key,
          targetRecordId: review.target.id,
          targetRevision: review.target.revision,
        },
      })
      check(
        generalProposalForApp(row).approvalToken === token,
        "Canonical signed app binding differs",
      )
      checks.push("canonical-reviewed-signed-proposal")
      // Explicit fixture perturbations test stale saved targets. No payment/event/receipt is fabricated.
      if (name === "rework-stale-source")
        await tx.serviceJobLine.update({
          where: { id: fixture.line.id },
          data: { allocatedQuantity: "1", revision: { increment: 1 } },
        })
      if (name === "handoff-stale-paid")
        await tx.commercialOrder.update({
          where: { id: fixture.order.id },
          data: { totalMinor: { increment: 1 } },
        })
      if (name === "handoff-stale-ready")
        await tx.serviceJobLine.update({
          where: { id: fixture.line.id },
          data: { status: "QUEUED", revision: { increment: 1 } },
        })
      const seeded = await facts()
      const decision = {
        proposalId: nonce,
        revision: 1,
        decision: "confirm" as const,
        approvalToken: token,
      }
      if (name.includes("-stale-") || name === "rework-changed-token") {
        await conflict(() =>
          decideGeneralProposal(runContext(), {
            ...decision,
            approvalToken:
              name === "rework-changed-token"
                ? `${token[0] === "a" ? "b" : "a"}${token.slice(1)}`
                : token,
          }),
        )
        assertServiceIntakeSignedFactsUnchanged(seeded, await facts())
        check(budgetCalls.length === 0, "Refusal called saved budget methods")
        checks.push(
          "real-general-stale-or-token-conflict",
          "full-seeded-state-and-budget-preserved",
        )
        return {
          proposalId: nonce,
          commandKey: key,
          budgetCalls,
          receipt: null,
        }
      }
      const nativeEffects = [
        "AssistantActionProposal",
        "D04:AssistantActionProposal",
        ...[
          "ServiceJob",
          "ServiceJobLine",
          "ServiceWorkEvent",
          ...(rework ? [] : ["CommercialOrder", "ServiceNotificationIntent"]),
        ].map((table) => `D04:${table}`),
      ]
      const assertOriginal = async (receipt: ServiceWorkCompletionReceipt) => {
        check(
          receipt.sourceJobId === fixture.job.id &&
            receipt.sourceLineId === (rework ? fixture.line.id : null) &&
            receipt.eventType === (rework ? "REWORK" : "REMOTE_HANDOFF") &&
            (rework
              ? receipt.recordId !== fixture.job.id
              : receipt.recordId === fixture.job.id),
          "Signed receipt lost original owning Job/source linkage",
        )
        const event = await tx.serviceWorkEvent.findUniqueOrThrow({
          where: {
            tenantId_clientCommandId: { tenantId, clientCommandId: key },
          },
        })
        check(
          event.id === receipt.eventId &&
            event.serviceJobId === receipt.recordId &&
            event.type === receipt.eventType &&
            event.actorUserId === actorUserId &&
            event.reason ===
              (payload.action === "service_work_rework"
                ? payload.reason
                : payload.note) &&
            event.createdAt.toISOString() === receipt.recordedAt &&
            event.effectiveAt.toISOString() === receipt.effectiveAt,
          "Receipt differs from actual original command event/stored times",
        )
        const owning = await getServiceWorkOriginalInTransaction(tx, {
          kind: "service_work",
          jobId: receipt.recordId,
          eventId: receipt.eventId,
          tenantId,
          storeId,
          actorUserId,
        })
        check(
          owning.kind === "service_work" &&
            owning.source === "ServiceWorkEvent" &&
            owning.original.eventId === receipt.eventId &&
            owning.original.jobId === receipt.recordId &&
            owning.original.type === receipt.eventType &&
            owning.original.createdAt === receipt.recordedAt &&
            owning.original.effectiveAt === receipt.effectiveAt &&
            owning.original.details.coverage === "recorded",
          "Original reader did not return exact owning receipt and saved provenance",
        )
        const source = await tx.serviceJobLine.findUniqueOrThrow({
          where: { id: fixture.line.id },
        })
        const job = await tx.serviceJob.findUniqueOrThrow({
          where: { id: receipt.recordId },
          include: { lines: true },
        })
        const order = await tx.commercialOrder.findUniqueOrThrow({
          where: { id: fixture.order.id },
        })
        check(
          order.amountPaidMinor === 2000 &&
            order.totalMinor === 2000 &&
            (await tx.commercialOrderPayment.count({
              where: { orderId: order.id },
            })) === 1 &&
            (await tx.serviceJob.count({
              where: { tenantId, commercialOrderId: order.id },
            })) === (rework ? 2 : 1) &&
            (await tx.commercialOrderLine.count({
              where: { orderId: order.id },
            })) === 1,
          "Completion changed canonical payment identity/count or balance",
        )
        if (rework) {
          const originalJob = await tx.serviceJob.findUniqueOrThrow({
            where: { id: fixture.job.id },
          })
          check(
            nativeRowDigest(source) === nativeRowDigest(fixture.line) &&
              job.reworkOfJobId === fixture.job.id &&
              nativeRowDigest(originalJob) === nativeRowDigest(fixture.job) &&
              nativeRowDigest(order) === nativeRowDigest(fixture.order) &&
              job.commercialOrderId === fixture.order.id &&
              job.lines.length === 1 &&
              job.lines[0]?.reworkOfLineId === fixture.line.id &&
              job.lines[0].commercialOrderLineId ===
                fixture.line.commercialOrderLineId &&
              job.lines[0].allocatedQuantity.toString() === "1.25" &&
              job.lines[0].status === "QUEUED" &&
              job.lines[0].authorizationStatus === "AUTHORIZED",
            "Linked rework changed original source or duplicated sold allocation",
          )
          check(
            "rework" in owning.original.details &&
              owning.original.details.rework?.sourceLineId ===
                fixture.line.id &&
              owning.original.details.rework.quantity === "1.25",
            "Original reader lost exact recorded rework source and quantity",
          )
        } else {
          check(
            source.status === "COMPLETED" &&
              job.handedOffAt &&
              order.status === "COMPLETED" &&
              event.serviceJobLineId === null &&
              job.handedOffByUserId === actorUserId,
            "Handoff did not settle original ready line/Order with distinct owning Job event",
          )
          check(
            "handoff" in owning.original.details &&
              owning.original.details.handoff?.paymentStatus === "PAID",
            "Original reader lost native recorded settled handoff state",
          )
        }
        check(
          (await tx.serviceWorkEvent.count({
            where: { tenantId, clientCommandId: key },
          })) === 1,
          "Native command created duplicate original events",
        )
        checks.push(
          "original-owning-event-and-reader-stored-times",
          "exact-source-links-native-work-and-paid-order",
        )
      }
      let receipt: ServiceWorkCompletionReceipt
      if (name.endsWith("-receipt-failure")) {
        const fault = Error(`D05 original receipt write fault:${name}`)
        let attempted: unknown
        const faulty = cashCountReceiptFault(
          observed,
          nonce,
          fault,
          (value) => {
            attempted = value
          },
        )
        let caught = false
        try {
          await decideGeneralProposal(runContext(faulty), decision)
        } catch (error) {
          if (error !== fault) throw error
          caught = true
        }
        check(caught, "Receipt write fault was not thrown by identity")
        receipt = serviceWorkCompletionReceipt.parse(attempted)
        await assertOriginal(receipt)
        const failed = await tx.assistantActionProposal.findUniqueOrThrow({
          where: { id: nonce },
        })
        check(
          failed.status === "EXECUTING" && failed.executedResult === null,
          "Forced receipt fault falsely completed the proposal",
        )
        assertServiceIntakeSignedFactsUnchanged(
          seeded,
          await facts(),
          nativeEffects,
        )
        checks.push(
          "identity-receipt-write-fault-after-genuine-native-effects",
          "original-receipt-not-persisted",
        )
      } else {
        const app = await decideGeneralProposal(runContext(), decision)
        check(
          app.status === "COMPLETED",
          "Signed native completion did not complete",
        )
        receipt = serviceWorkCompletionReceipt.parse(app.receipt)
        await assertOriginal(receipt)
        const saved = await tx.assistantActionProposal.findUniqueOrThrow({
          where: { id: nonce },
        })
        check(
          saved.status === "COMPLETED" &&
            proposalDigest(saved.executedResult) === proposalDigest(receipt),
          "Original completed receipt not saved atomically",
        )
        const executed = await facts()
        assertServiceIntakeSignedFactsUnchanged(seeded, executed, nativeEffects)
        const replay = await decideGeneralProposal(runContext(), decision)
        check(
          proposalDigest(replay) === proposalDigest(app),
          "Completed replay changed original receipt DTO",
        )
        assertServiceIntakeSignedFactsUnchanged(executed, await facts())
        checks.push(
          "atomic-original-completed-receipt",
          "same-key-completed-replay-no-native-duplicate-or-saved-state-change",
        )
      }
      check(
        budgetCalls.length === 0,
        "Signed source confirmation called saved budget methods",
      )
      checks.push(
        "all-auth-chat-budget-finance-facts-preserved-around-native-completion",
      )
      return { proposalId: nonce, commandKey: key, budgetCalls, receipt }
    },
  })
  return {
    startedAt,
    featureConfiguration,
    completed,
    proof: "rollback_fixture_replay_only" as const,
    persistedProof: false,
    concurrentProof: false,
    savedWebProof: false,
  }
}
