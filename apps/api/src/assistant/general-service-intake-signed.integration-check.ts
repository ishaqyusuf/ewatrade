import { randomUUID } from "node:crypto"
import { readServiceIntakeReceiptInTransaction } from "@ewatrade/db/service-intake-receipt"
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
  editGeneralProposal,
  generalProposalForApp,
} from "./general-proposals"
import { serviceIntake } from "./general-service-intake"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"
import { seedServiceIntakeRollbackFixture } from "./service-intake-rollback-fixture"
import {
  type ServiceIntakeSignedCase,
  type ServiceIntakeSignedCaseSelection,
  runServiceIntakeSignedCases,
  serviceIntakeSignedCases,
} from "./service-intake-signed-rollback-cases"
import {
  assertServiceIntakeSignedFactsUnchanged,
  assertServiceIntakeSignedNativeCreation,
  serviceIntakeSignedRollbackFacts,
  verifyServiceIntakeSignedFinanceInventory,
} from "./service-intake-signed-rollback-facts"
import {
  assertServiceIntakeSignedEnvironment,
  assertServiceIntakeSignedScope,
  signedIntakeCheck as check,
  serviceIntakeSignedScope,
  serviceIntakeSignedTransactionBridge,
} from "./service-intake-signed-rollback-guards"
export { ServiceIntakeSignedRollbackFailure } from "./service-intake-signed-rollback-cases"

// These are the canonical unpaid Intake/Order/ledger/work effects only. Finance,
// auth, chat, all budgets, payments and message intents must remain unchanged.
const nativeEffects = [
  "Tenant",
  "AssistantActionProposal",
  "D04:AssistantActionProposal",
  ...[
    "CommercialOrder",
    "CommercialOrderLine",
    "OfferingSnapshot",
    "CommercialServiceAuthorization",
    "ServiceIntake",
    "ServiceIntakeLine",
    "ServiceJob",
    "ServiceJobLine",
    "ServiceWorkAssignment",
    "ServiceDueCommitment",
    "ServiceWorkEvent",
    "CustomerLedgerAccount",
    "CustomerLedgerEntry",
    "CustomerLedgerCommand",
  ].map((table) => `D04:${table}`),
]

async function refused(run: () => Promise<unknown>, code: TRPCError["code"]) {
  try {
    await run()
  } catch (error) {
    if (error instanceof TRPCError && error.code === code) return
    throw error
  }
  throw Error(`Expected signed ${code} refusal`)
}

/** Source-only until coordinator assigns the exact reviewed chat/session and exclusive slot. */
export async function verifyServiceIntakeSignedRollback(
  ctx: GeneralContext,
  conversationId: string,
  selection: ServiceIntakeSignedCaseSelection = "full",
) {
  assertServiceIntakeSignedEnvironment(process.env)
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
  assertServiceIntakeSignedScope(
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
  await db.membership
    .findFirstOrThrow({
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
    .then((row) =>
      check(
        row.id === ctx.tenantContext.membership.id,
        "Exact current QA Owner membership required",
      ),
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
  await verifyServiceIntakeSignedFinanceInventory(db)
  const recoveryNonce = randomUUID()
  let faultProved = false
  const startedAt = new Date().toISOString()
  const facts = () => serviceIntakeSignedRollbackFacts(db, tenantId)
  type CaseReport = {
    checks: string[]
    budgetCalls: G02BudgetCall[]
    proposalId: string
    commandKey: string
    receipt?: unknown
  }
  const runCase = async (
    mode: ServiceIntakeSignedCase,
    tx: Prisma.TransactionClient,
    checks: string[],
  ): Promise<CaseReport> => {
    if (mode === "receipt-recovery-replay")
      check(
        faultProved,
        "Receipt recovery requires the preceding full-state rollback proof",
      )
    const nonce = mode.startsWith("receipt-") ? recoveryNonce : randomUUID()
    const fixture = await seedServiceIntakeRollbackFixture(tx, {
      tenantId,
      storeId,
      actorUserId,
      nonce,
    })
    const payload = {
      action: "service_intake" as const,
      customerId: fixture.customerId,
      lines: [
        { offeringId: fixture.trackedId, quantity: "2" },
        { offeringId: fixture.chargeId, quantity: "1" },
      ],
      requestedAssigneeId: actorUserId,
      instructions: "Original signed instructions",
      dueCommitmentAt: "2026-10-15T10:00:00.123Z",
    }
    const review = await serviceIntake.review({ ...ctx, db: tx }, payload)
    const binding = {
      id: nonce,
      tenantId,
      storeId,
      actorUserId,
      revision: 1,
      expiresAt: new Date(Date.now() + 900_000),
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
    const original = generalProposalForApp(row)
    check(
      original.approvalToken === token && original.status === "PENDING",
      "Canonical app proposal binding differs",
    )
    checks.push("canonical-reviewed-signed-proposal")
    if (mode === "stale-price")
      await tx.sellableOffering.update({
        where: { id: fixture.trackedId },
        data: { fixedPriceMinor: 2000 },
      })
    if (mode === "revoked")
      await tx.membership.update({
        where: { id: ctx.tenantContext.membership.id },
        data: { status: "SUSPENDED" },
      })
    if (mode === "expired-session")
      await tx.session.update({
        where: { id: ctx.session.session.id },
        data: { expiresAt: new Date(0) },
      })
    if (mode === "cross-tenant")
      await tx.assistantActionProposal.update({
        where: { id: nonce },
        data: { tenantId: `d04-foreign-${nonce}` },
      })
    if (mode === "cross-store")
      await tx.assistantActionProposal.update({
        where: { id: nonce },
        data: { storeId: `d04-foreign-${nonce}` },
      })
    const seeded = await serviceIntakeSignedRollbackFacts(tx, tenantId)
    const budgetCalls: G02BudgetCall[] = []
    const observedTx = observeG02BudgetCalls(tx, "transaction", (call) =>
      budgetCalls.push(call),
    )
    // This private verifier bridge is a root-shaped dispatcher argument only;
    // every callback gets the real transaction client and reruns fresh authority.
    const runContext = (
      client: Prisma.TransactionClient = observedTx,
    ): GeneralContext => ({
      ...ctx,
      db: serviceIntakeSignedTransactionBridge(
        client,
      ) as unknown as GeneralContext["db"],
    })
    const decision = {
      proposalId: nonce,
      revision: 1,
      decision: "confirm" as const,
      approvalToken: token,
    }
    const assertOriginal = async (
      receipt: { kind: string; recordId: string; orderId?: string },
      total: number,
      instructions: string,
    ) => {
      check(
        receipt.kind === "service_intake" && receipt.orderId,
        "Signed native receipt missing",
      )
      const owning = await readServiceIntakeReceiptInTransaction(tx, {
        tenantId,
        storeId,
        actorUserId,
        intakeId: receipt.recordId,
      })
      check(
        owning.orderId === receipt.orderId &&
          owning.totalMinor === total &&
          owning.initialPaymentMinor === 0 &&
          owning.initialBalanceMinor === total &&
          owning.instructions === instructions &&
          owning.promisedAt?.toISOString() === payload.dueCommitmentAt &&
          owning.assigneeUserId === actorUserId &&
          owning.lines.length === 2 &&
          owning.jobs.length === 1 &&
          owning.jobs[0]?.lines.length === 1 &&
          owning.jobs[0]?.lines[0]?.authorizationStatus === "PENDING_PAYMENT" &&
          owning.jobs[0]?.lines[0]?.status === "QUEUED",
        "Canonical owning Intake/Order/Job original facts differ",
      )
      const tracked = owning.lines.find(
        (line) => line.offeringId === fixture.trackedId,
      )
      const charge = owning.lines.find(
        (line) => line.offeringId === fixture.chargeId,
      )
      check(
        tracked?.unitPriceMinor === 1000 &&
          tracked.workPolicy === "TRACKED" &&
          tracked.quantity === (total === 3500 ? "3" : "2") &&
          charge?.unitPriceMinor === 500 &&
          charge.quantity === "1" &&
          charge.workPolicy === "CHARGE_ONLY" &&
          owning.jobs[0]?.lines[0]?.commercialOrderLineId ===
            tracked.orderLineId,
        "Signed receipt changed exact Offering/quantity/immutable policy identity",
      )
      const order = await tx.commercialOrder.findUniqueOrThrow({
        where: { id: owning.orderId },
      })
      check(
        order.customerId === fixture.customerId &&
          order.createdByUserId === actorUserId &&
          order.amountPaidMinor === 0,
        "Signed owning Order lost saved Customer/actor/unpaid identity",
      )
      const saved = await tx.assistantActionProposal.findUniqueOrThrow({
        where: { id: nonce },
      })
      check(
        saved.status === "COMPLETED" &&
          proposalDigest(saved.executedResult) === proposalDigest(receipt),
        "Original assistant receipt is not atomically completed",
      )
      check(
        (await tx.serviceIntake.count({
          where: { tenantId, clientIntakeId: key },
        })) === 1,
        "Signed command duplicated Intake",
      )
      checks.push(
        "genuine-original-intake-order-job-receipt",
        "exact-customer-total-tracked-only-unpaid-gate",
        "atomic-completed-receipt",
      )
      return owning
    }
    let receipt: unknown
    if (mode === "edit-confirm") {
      const changed = await editGeneralProposal(runContext(), {
        proposalId: nonce,
        revision: 1,
        payload: {
          ...payload,
          instructions: "Edited signed instructions",
          lines: [
            { offeringId: fixture.trackedId, quantity: "3" },
            { offeringId: fixture.chargeId, quantity: "1" },
          ],
        },
      })
      check(
        changed.revision === 2 &&
          changed.status === "PENDING" &&
          changed.approvalToken &&
          changed.approvalToken !== token &&
          changed.payload.action === "service_intake" &&
          changed.payload.instructions === "Edited signed instructions",
        "Edit did not issue the new canonical signed revision",
      )
      assertServiceIntakeSignedFactsUnchanged(
        seeded,
        await serviceIntakeSignedRollbackFacts(tx, tenantId),
        ["AssistantActionProposal", "D04:AssistantActionProposal"],
      )
      checks.push("real-edit-new-revision-and-token-no-native-effects")
      const app = await decideGeneralProposal(runContext(), {
        ...decision,
        revision: changed.revision,
        approvalToken: changed.approvalToken,
      })
      check(
        app.status === "COMPLETED" && app.receipt?.kind === "service_intake",
        "Edited signed confirmation failed",
      )
      receipt = await assertOriginal(
        app.receipt,
        3500,
        "Edited signed instructions",
      )
      const executed = await serviceIntakeSignedRollbackFacts(tx, tenantId)
      assertServiceIntakeSignedFactsUnchanged(seeded, executed, nativeEffects)
      assertServiceIntakeSignedNativeCreation(seeded, executed)
    } else if (
      mode === "completion-replay" ||
      mode === "completed-replay-revoked" ||
      mode === "receipt-recovery-replay"
    ) {
      const app = await decideGeneralProposal(runContext(), decision)
      check(
        app.status === "COMPLETED" && app.receipt?.kind === "service_intake",
        "Signed confirmation failed",
      )
      receipt = await assertOriginal(app.receipt, 2500, payload.instructions)
      const completed = await serviceIntakeSignedRollbackFacts(tx, tenantId)
      assertServiceIntakeSignedFactsUnchanged(seeded, completed, nativeEffects)
      assertServiceIntakeSignedNativeCreation(seeded, completed)
      if (mode === "completed-replay-revoked") {
        await tx.membership.update({
          where: { id: ctx.tenantContext.membership.id },
          data: { status: "SUSPENDED" },
        })
        const revoked = await serviceIntakeSignedRollbackFacts(tx, tenantId)
        await refused(
          () => decideGeneralProposal(runContext(), decision),
          "FORBIDDEN",
        )
        assertServiceIntakeSignedFactsUnchanged(
          revoked,
          await serviceIntakeSignedRollbackFacts(tx, tenantId),
        )
        checks.push(
          "completed-original-receipt-replay-still-requires-fresh-authority",
        )
      } else {
        const replay = await decideGeneralProposal(runContext(), decision)
        check(
          proposalDigest(app) === proposalDigest(replay),
          "Completed signed replay changed the original app receipt",
        )
        assertServiceIntakeSignedFactsUnchanged(
          completed,
          await serviceIntakeSignedRollbackFacts(tx, tenantId),
        )
        checks.push("fresh-authority-completed-replay-no-effects")
      }
      if (mode === "receipt-recovery-replay")
        checks.push("same-command-key-after-fault-rollback-no-duplicates")
    } else if (mode === "cancel-replay") {
      const cancelled = await decideGeneralProposal(runContext(), {
        ...decision,
        decision: "cancel",
      })
      check(
        cancelled.status === "CANCELLED" && cancelled.receipt === null,
        "Canonical cancel executed a command",
      )
      const settled = await serviceIntakeSignedRollbackFacts(tx, tenantId)
      assertServiceIntakeSignedFactsUnchanged(seeded, settled, [
        "AssistantActionProposal",
        "D04:AssistantActionProposal",
      ])
      const replay = await decideGeneralProposal(runContext(), {
        ...decision,
        decision: "cancel",
      })
      check(
        proposalDigest(cancelled) === proposalDigest(replay),
        "Cancellation replay changed",
      )
      assertServiceIntakeSignedFactsUnchanged(
        settled,
        await serviceIntakeSignedRollbackFacts(tx, tenantId),
      )
      checks.push(
        "real-cancel-no-native-effects",
        "fresh-authority-cancel-replay-no-write",
      )
    } else if (mode === "receipt-failure") {
      const fault = Error("D04 original receipt fault")
      let attempted: unknown
      const faulty = cashCountReceiptFault(
        observedTx,
        nonce,
        fault,
        (value) => {
          attempted = value
        },
      )
      try {
        await decideGeneralProposal(runContext(faulty), decision)
        throw Error("Receipt fault not reached")
      } catch (error) {
        if (error !== fault) throw error
      }
      check(
        attempted &&
          typeof attempted === "object" &&
          "kind" in attempted &&
          attempted.kind === "service_intake" &&
          "recordId" in attempted &&
          typeof attempted.recordId === "string",
        "Fault did not follow genuine canonical execution",
      )
      const owning = await readServiceIntakeReceiptInTransaction(tx, {
        tenantId,
        storeId,
        actorUserId,
        intakeId: attempted.recordId,
      })
      check(
        owning.totalMinor === 2500 && owning.jobs.length === 1,
        "Injected receipt used fabricated native effects",
      )
      const failed = await tx.assistantActionProposal.findUniqueOrThrow({
        where: { id: nonce },
      })
      check(
        failed.status === "EXECUTING" && failed.executedResult === null,
        "Receipt fault falsely completed",
      )
      const executed = await serviceIntakeSignedRollbackFacts(tx, tenantId)
      assertServiceIntakeSignedFactsUnchanged(seeded, executed, nativeEffects)
      assertServiceIntakeSignedNativeCreation(seeded, executed)
      checks.push(
        "identity-receipt-fault-after-real-native-effects",
        "completion-not-written-for-fault",
      )
      faultProved = true
    } else {
      const code =
        mode === "revoked"
          ? "FORBIDDEN"
          : mode === "expired-session"
            ? "UNAUTHORIZED"
            : mode.startsWith("cross-")
              ? "NOT_FOUND"
              : "CONFLICT"
      await refused(
        () =>
          decideGeneralProposal(runContext(), {
            ...decision,
            revision: mode === "stale-revision" ? 0 : 1,
            approvalToken:
              mode === "changed-token"
                ? `${token[0] === "a" ? "b" : "a"}${token.slice(1)}`
                : token,
          }),
        code,
      )
      assertServiceIntakeSignedFactsUnchanged(
        seeded,
        await serviceIntakeSignedRollbackFacts(tx, tenantId),
      )
      checks.push(
        `real-${mode}-${code}-refusal`,
        "proposal-and-native-financial-auth-chat-budget-facts-unchanged",
      )
    }
    return {
      checks,
      budgetCalls,
      proposalId: nonce,
      commandKey: key,
      ...(receipt ? { receipt } : {}),
    }
  }
  const cases = Object.fromEntries(
    serviceIntakeSignedCases.map((name) => [
      name,
      (tx: Prisma.TransactionClient, checks: string[]) =>
        runCase(name, tx, checks),
    ]),
  ) as Record<
    ServiceIntakeSignedCase,
    (tx: Prisma.TransactionClient, checks: string[]) => Promise<CaseReport>
  >
  const results = await runServiceIntakeSignedCases({
    selection,
    facts,
    transaction: (run, options) => db.$transaction(run, options),
    cases,
  })
  return {
    version: 3,
    selection,
    startedAt,
    results,
    savedStatePreserved: true,
    persistentAvailabilityChanged: false,
    providerCalls: 0,
    committedFixtures: false,
    acceptance: false,
  }
}
