import { randomUUID } from "node:crypto"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import type { Prisma } from "@ewatrade/db"
import {
  RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID,
  assertRetailOpsPlanIdFeature,
  getCommercialOrderReminderSettings,
  getOrderReceiptSettings,
  getStoreOrderVisibility,
  saveOrderReceiptSettings,
  updateStoreOrderVisibility,
} from "@ewatrade/db/queries"
import {
  assertG02RollbackTransactionOptions,
  rollbackCheck as check,
  g02RollbackScope,
} from "./general-cash-count-signed-rollback-guards"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal } from "./general-proposals"
import { storeSettingsUpdate } from "./general-store-settings-change"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"

/**
 * G05 signed rollback verifier. Every case runs the real signed
 * `decideGeneralProposal` inside one caller-owned transaction on the saved QA
 * scope and is forcibly rolled back. Successes exercise every canonical
 * setter with a completed replay; refusals are staged by changing the real
 * target or authority rows inside that same transaction. Not scheduled by
 * default. `settings.store.change` is `planned`, so the runner must make it
 * visible only inside its own process (see the G05 packet report).
 */
type Confirmation = Awaited<ReturnType<typeof decideGeneralProposal>>
type Action = Extract<GeneralAction, { action: "store_settings_update" }>
type Db = Prisma.TransactionClient | GeneralContext["db"]
type Scope = {
  tenantId: string
  storeId: string
  userId: string
  membershipId: string
}

const successModes = [
  "visibility-success",
  "receipts-business-success",
  "receipts-store-success",
  "receipts-store-removal-success",
  "reminders-success",
] as const
const refusalModes = [
  "changed-target",
  "changed-token",
  "role-revoked",
  "plan-without-feature",
  "privacy-blocked",
] as const
type SuccessMode = (typeof successModes)[number]
type RefusalMode = (typeof refusalModes)[number]
type Mode = SuccessMode | RefusalMode
export const g05RollbackModes: readonly Mode[] = [
  ...successModes,
  ...refusalModes,
]
const isSuccess = (mode: Mode): mode is SuccessMode =>
  (successModes as readonly string[]).includes(mode)

export function assertG05RollbackEnvironment(env: NodeJS.ProcessEnv) {
  check(
    env.RUN_G05_SIGNED_PROPOSAL_ROLLBACK === "1" &&
      env.APP_ENV === "local" &&
      env.NODE_ENV === "development" &&
      (env.ASSISTANT_APPROVAL_SIGNING_KEY?.length ?? 0) >= 32,
    "Explicit scheduled local rollback and process-only signing key required",
  )
}

/** Fingerprint of every fact a settings proposal or its refusal could touch. */
async function g05Facts(db: Db, scope: Scope) {
  const [tenant, stores, reminders, membership, privacy, proposals] =
    await Promise.all([
      db.tenant.findUniqueOrThrow({
        where: { id: scope.tenantId },
        select: {
          metadata: true,
          updatedAt: true,
          subscription: { select: { planId: true, status: true } },
        },
      }),
      db.store.findMany({
        where: { tenantId: scope.tenantId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          metadata: true,
          salesRepOrderVisibility: true,
          salesRepOrderVisibilityReviewedAt: true,
          salesRepOrderVisibilityUpdatedAt: true,
          salesRepOrderVisibilityUpdatedByUserId: true,
          updatedAt: true,
        },
      }),
      db.commercialOrderReminderSettings.findMany({
        where: { tenantId: scope.tenantId },
        orderBy: { storeId: "asc" },
      }),
      db.membership.findUniqueOrThrow({
        where: { id: scope.membershipId },
        select: { role: true, status: true },
      }),
      db.accountPrivacyRequest.findUnique({
        where: { requestKey: `account-deletion:${scope.userId}` },
        select: { status: true, updatedAt: true },
      }),
      db.assistantActionProposal.findMany({
        where: { tenantId: scope.tenantId, storeId: scope.storeId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          revision: true,
          action: true,
          actionVersion: true,
          payload: true,
          payloadHash: true,
          targetRecordId: true,
          targetRevision: true,
          approvalTokenHash: true,
          idempotencyKey: true,
          executedResult: true,
          decidedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ])
  return proposalDigest({
    tenant,
    stores,
    reminders,
    membership,
    privacy,
    proposals,
  })
}

const reason = "QA G05 signed rollback"
const parse = (value: unknown) => generalActionSchema.parse(value) as Action

/** Drafted from the saved values the transaction reads again. */
async function payloadFor(db: Db, mode: Mode, scope: Scope): Promise<Action> {
  const input = { tenantId: scope.tenantId, storeId: scope.storeId }
  if (mode === "reminders-success" || mode === "plan-without-feature") {
    const current = await getCommercialOrderReminderSettings(db, input)
    check(current, "Saved QA Store reminder settings unavailable")
    return parse({
      action: "store_settings_update",
      change: {
        section: "reminders",
        enabled: !current.enabled,
        dayBeforeEnabled: current.dayBeforeEnabled,
        sameDayEnabled: current.sameDayEnabled,
      },
      reason,
    })
  }
  if (mode.startsWith("receipts-")) {
    const current = await getOrderReceiptSettings(db, input)
    if (mode === "receipts-store-removal-success")
      return parse({
        action: "store_settings_update",
        change: { section: "receipts", scope: "store", settings: null },
        reason,
      })
    const base =
      mode === "receipts-business-success"
        ? current.business
        : (current.override ?? current.business)
    return parse({
      action: "store_settings_update",
      change: {
        section: "receipts",
        scope: mode === "receipts-business-success" ? "business" : "store",
        settings:
          mode === "receipts-business-success"
            ? { ...base, showPaymentBreakdown: !base.showPaymentBreakdown }
            : { ...base, showCustomerName: !base.showCustomerName },
      },
      reason,
    })
  }
  const visibility = await getStoreOrderVisibility(db, input)
  check(visibility, "Saved QA Store visibility unavailable")
  return parse({
    action: "store_settings_update",
    change: {
      section: "order_visibility",
      visibility:
        visibility.salesRepOrderVisibility === "ALL_STORE_ORDERS"
          ? "OWN_SALES"
          : "ALL_STORE_ORDERS",
    },
    reason,
  })
}

/** Setup inside the transaction before the review is bound. */
async function beforeReview(
  tx: Prisma.TransactionClient,
  mode: Mode,
  scope: Scope,
) {
  if (mode !== "receipts-store-removal-success") return
  // Removal needs a Store override; create one only inside the rollback.
  const current = await getOrderReceiptSettings(tx, scope)
  if (!current.override)
    await saveOrderReceiptSettings(tx, {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      scope: "store",
      settings: {
        ...current.business,
        thankYouNote: `${current.business.thankYouNote} (QA override)`.slice(
          0,
          300,
        ),
      },
    })
}

/** Changes the real target or authority after the review is bound. */
async function stageRefusal(
  tx: Prisma.TransactionClient,
  mode: RefusalMode,
  scope: Scope,
) {
  if (mode === "changed-target")
    // "Keep as it is" acknowledgement changes the reviewed row's revision only.
    await updateStoreOrderVisibility(tx, {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      userId: scope.userId,
    })
  if (mode === "role-revoked")
    await tx.membership.update({
      where: { id: scope.membershipId },
      data: { role: "CASHIER" },
    })
  if (mode === "plan-without-feature") {
    // The plan resolves from the subscription plan key, else retail metadata.
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: scope.tenantId },
      select: { metadata: true, subscription: { select: { id: true } } },
    })
    if (tenant.subscription) {
      const free = await tx.subscriptionPlan.findUnique({
        where: { key: "free" },
        select: { id: true },
      })
      check(free, "Free plan row required for the plan refusal case")
      await tx.tenantSubscription.update({
        where: { id: tenant.subscription.id },
        data: { planId: free.id },
      })
    } else {
      const metadata =
        tenant.metadata && typeof tenant.metadata === "object"
          ? (tenant.metadata as Record<string, unknown>)
          : {}
      const retailOps =
        metadata.retailOps && typeof metadata.retailOps === "object"
          ? (metadata.retailOps as Record<string, unknown>)
          : {}
      await tx.tenant.update({
        where: { id: scope.tenantId },
        data: {
          metadata: {
            ...metadata,
            retailOps: { ...retailOps, subscription: { planId: "free" } },
          },
        },
      })
    }
  }
  if (mode === "privacy-blocked")
    await tx.accountPrivacyRequest.upsert({
      where: { requestKey: `account-deletion:${scope.userId}` },
      create: {
        requestKey: `account-deletion:${scope.userId}`,
        userId: scope.userId,
        status: "PROCESSING",
        verifiedAt: new Date(),
      },
      update: { status: "PROCESSING" },
    })
}

const expectedRefusal: Record<RefusalMode, string> = {
  "changed-target": "CONFLICT",
  "changed-token": "CONFLICT",
  "role-revoked": "FORBIDDEN",
  "plan-without-feature": "FORBIDDEN",
  "privacy-blocked": "FORBIDDEN",
}
const receiptKind = {
  receipts: "store_receipt_settings",
  reminders: "store_reminder_settings",
  order_visibility: "store_order_visibility",
} as const

/** The canonical setter saved exactly the reviewed value. */
async function assertSaved(
  tx: Prisma.TransactionClient,
  payload: Action,
  scope: Scope,
) {
  const input = { tenantId: scope.tenantId, storeId: scope.storeId }
  const { change } = payload
  if (change.section === "receipts") {
    const saved = await getOrderReceiptSettings(tx, input)
    const value = change.scope === "business" ? saved.business : saved.override
    check(
      proposalDigest(value) === proposalDigest(change.settings),
      "Canonical receipt setter did not save the reviewed value",
    )
    return
  }
  if (change.section === "reminders") {
    const saved = await getCommercialOrderReminderSettings(tx, input)
    check(
      saved?.enabled === change.enabled &&
        saved.dayBeforeEnabled === change.dayBeforeEnabled &&
        saved.sameDayEnabled === change.sameDayEnabled &&
        saved.updatedAt !== null,
      "Canonical reminder setter did not save the reviewed values",
    )
    return
  }
  const saved = await getStoreOrderVisibility(tx, input)
  check(
    saved?.salesRepOrderVisibility === change.visibility &&
      saved.salesRepOrderVisibilityUpdatedByUserId === scope.userId,
    "Canonical visibility setter did not save the reviewed value",
  )
}

export async function verifyG05SignedProposalRollback(
  ctx: GeneralContext,
  conversationId: string,
  recordEvidence?: (evidence: {
    case: Mode
    beforeDigest: string
    afterDigest: string
    transactionChecksReached: string[]
    forcedRollbackReached: boolean
  }) => Promise<void>,
) {
  assertG05RollbackEnvironment(process.env)
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const userId = ctx.session.user.id
  const storeId = ctx.tenantContext.activeStore?.id ?? ""
  const membershipId = ctx.tenantContext.membership.id
  const [identity] = await db.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database`
  check(
    identity?.database === g02RollbackScope.database &&
      tenantId === g02RollbackScope.tenantId &&
      storeId === g02RollbackScope.storeId &&
      userId === g02RollbackScope.userId &&
      conversationId === g02RollbackScope.conversationId,
    "Exact saved QA scope required",
  )
  await db.membership.findFirstOrThrow({
    where: {
      id: membershipId,
      tenantId,
      userId,
      role: "OWNER",
      status: "ACTIVE",
      tenant: { dataClassification: "QA", isActive: true },
    },
  })
  // Receipt and reminder successes and the plan refusal need both features.
  const plan =
    ctx.tenantContext.tenant.retailOpsPlanId ??
    RETAIL_OPS_LAUNCH_DEFAULT_PLAN_ID
  assertRetailOpsPlanIdFeature(plan, "invoices")
  assertRetailOpsPlanIdFeature(plan, "orderReminders")
  const scope: Scope = { tenantId, storeId, userId, membershipId }
  const before = await g05Facts(db, scope)
  const results: Array<{ case: Mode; elapsedMs: number; checks: string[] }> = []
  for (const mode of g05RollbackModes) {
    const id = randomUUID()
    const key = `assistant_${id}`
    const rollback = new Error("G05_SIGNED_FORCED_ROLLBACK")
    const started = performance.now()
    const expiresAt = new Date(Date.now() + 900_000)
    const payload = await payloadFor(db, mode, scope)
    const binding = {
      id,
      expiresAt,
      payloadHash: proposalDigest(payload),
      tenantId,
      storeId,
      actorUserId: userId,
      revision: 1,
    }
    const token = proposalApprovalToken(
      binding,
      process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
    )
    let proved = false
    let transactions = 0
    const checks: string[] = []
    const scopedDb = new Proxy(db, {
      get(owner, property) {
        if (property !== "$transaction") {
          const value = Reflect.get(owner, property)
          return typeof value === "function" ? value.bind(owner) : value
        }
        return (
          operation: (tx: Prisma.TransactionClient) => Promise<Confirmation>,
          options: {
            maxWait?: number
            timeout?: number
            isolationLevel?: Prisma.TransactionIsolationLevel
          },
        ) => {
          assertG02RollbackTransactionOptions(options)
          check(++transactions === 1, "Unexpected root transaction or retry")
          return db.$transaction(async (tx) => {
            await beforeReview(tx, mode, scope)
            const prepared = await storeSettingsUpdate.review?.(
              { ...ctx, db: tx },
              payload,
            )
            check(prepared?.target, "Settings review unavailable")
            await tx.assistantActionProposal.create({
              data: {
                ...binding,
                conversationId,
                action: payload.action,
                payload,
                roleSnapshot: "OWNER",
                approvalTokenHash: proposalDigest(token),
                idempotencyKey: key,
                targetRecordId: prepared.target.id,
                targetRevision: prepared.target.revision,
              },
            })
            if (!isSuccess(mode)) await stageRefusal(tx, mode, scope)
            const seeded = await g05Facts(tx, scope)
            if (isSuccess(mode)) {
              const app = await operation(tx)
              const receipt = app.receipt
              check(
                app.status === "COMPLETED" &&
                  receipt?.kind === receiptKind[payload.change.section] &&
                  receipt.recordId === storeId,
                "Signed confirmation did not return the section receipt",
              )
              await assertSaved(tx, payload, scope)
              const row = await tx.assistantActionProposal.findUniqueOrThrow({
                where: { id },
              })
              check(
                row.status === "COMPLETED" &&
                  proposalDigest(row.executedResult) ===
                    proposalDigest(receipt),
                "Atomic assistant receipt differs",
              )
              const completed = await g05Facts(tx, scope)
              check(completed !== seeded, "Confirmation changed nothing")
              const replay = await operation(tx)
              check(
                replay.status === "COMPLETED" &&
                  proposalDigest(replay.receipt) === proposalDigest(receipt),
                "Completed replay changed the original receipt",
              )
              check(
                (await g05Facts(tx, scope)) === completed,
                "Completed replay wrote again",
              )
              checks.push(
                "real-signed-confirmation",
                `canonical-${payload.change.section}-setter-saved-reviewed-value`,
                "atomic-section-receipt",
                "completed-replay-no-write",
              )
            } else {
              let code: unknown
              try {
                await operation(tx)
              } catch (error) {
                code =
                  error && typeof error === "object" && "code" in error
                    ? error.code
                    : error
              }
              check(
                code === expectedRefusal[mode],
                `Expected ${expectedRefusal[mode]} refusal for ${mode}, got ${String(code)}`,
              )
              check(
                (await g05Facts(tx, scope)) === seeded,
                "Refusal changed settings, authority or proposal facts",
              )
              checks.push(`real-signed-${expectedRefusal[mode].toLowerCase()}`)
            }
            proved = true
            throw rollback
          }, options)
        }
      },
    })
    let unexpected: { error: unknown } | undefined
    try {
      await decideGeneralProposal(
        { ...ctx, db: scopedDb as GeneralContext["db"] },
        {
          proposalId: id,
          revision: 1,
          decision: "confirm",
          approvalToken:
            mode === "changed-token"
              ? `${token[0] === "a" ? "b" : "a"}${token.slice(1)}`
              : token,
        },
      )
      throw new Error("Forced rollback did not escape the confirmation")
    } catch (error) {
      if (error !== rollback) unexpected = { error }
    }
    const after = await g05Facts(db, scope)
    await recordEvidence?.({
      case: mode,
      beforeDigest: before,
      afterDigest: after,
      transactionChecksReached: checks,
      forcedRollbackReached: proved && !unexpected,
    })
    if (unexpected) throw unexpected.error
    check(proved && transactions === 1, "Signed rollback case was not proved")
    check(after === before, "Saved facts changed after rollback")
    check(
      (await db.assistantActionProposal.count({ where: { id } })) === 0,
      "Rollback-owned proposal persisted",
    )
    results.push({
      case: mode,
      elapsedMs: Math.round(performance.now() - started),
      checks,
    })
  }
  return {
    sourceSuite: "G05 signed store-settings rollback v2",
    results,
    savedFactsUnchanged: true,
    providerCalls: 0,
    committedFixtures: false,
    acceptance: false,
    remaining: "Saved web/native Open/Close and Store-mismatch journeys",
  }
}
