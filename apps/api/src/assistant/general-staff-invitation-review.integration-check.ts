import { randomUUID } from "node:crypto"
import { generalAnswerSchema, type GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { inviteRetailOpsStaffInTransaction, reviewStaffInvitationInTransaction } from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"
import { generalStaffInvitationReviewInput } from "./general-staff-invitation-review"

/** Owned QA only; real protected reads and canonical refusal, no invitation/email. */
export async function verifyStaffInvitationReview(ctx: GeneralContext, conversationId: string) {
  const db = ctx.db, tenantId = ctx.tenantContext.tenant.id, actorUserId = ctx.session.user.id
  await db.assistantConversation.findFirstOrThrow({ where: { id: conversationId, tenantId, ownerUserId: actorUserId, storeId: ctx.tenantContext.activeStore!.id, purpose: "GENERAL", tenant: { dataClassification: "QA" } }, select: { id: true } })
  const actor = await db.membership.findFirstOrThrow({ where: { tenantId, userId: actorUserId, role: "OWNER", status: "ACTIVE" }, select: { id: true } })
  const foreignStore = await db.store.findFirstOrThrow({ where: { tenantId: { not: tenantId }, tenant: { dataClassification: "QA" }, status: "ACTIVE" }, select: { id: true } })
  const email = `invitation-review.${randomUUID()}@ishaq.qa.test`
  const facts = async () => (await db.$queryRaw<Array<{ hash: string }>>`SELECT md5(jsonb_build_object(
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "Membership" m WHERE m."tenantId"=${tenantId}),
    'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "RetailOpsStaffProfile" p WHERE p."tenantId"=${tenantId}),
    'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffStoreAssignment" a WHERE a."tenantId"=${tenantId}),
    'invites',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM "RetailOpsStaffInviteToken" i WHERE i."tenantId"=${tenantId}),
    'access',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffAccessAuditEvent" a WHERE a."tenantId"=${tenantId}),
    'lifecycle',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "RetailOpsStaffLifecycleEvent" e WHERE e."tenantId"=${tenantId}),
    'users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM "User" u WHERE u.id=${actorUserId} OR u.email=${email}),
    'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "Session" s WHERE s."userId"=${actorUserId}),
    'accounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "Account" a WHERE a."userId"=${actorUserId}),
    'tenant',(SELECT to_jsonb(t) FROM "Tenant" t WHERE t.id=${tenantId}),
    'conversation',(SELECT to_jsonb(c) FROM "AssistantConversation" c WHERE c.id=${conversationId}),
    'messages',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "AssistantMessage" m WHERE m."conversationId"=${conversationId}),
    'proposals',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "AssistantActionProposal" p WHERE p."conversationId"=${conversationId}),
    'runs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "AssistantRun" r WHERE r."conversationId"=${conversationId}),
    'budget',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b."scopeKey") FROM "AssistantBudget" b WHERE b."scopeKey" LIKE ${`%${tenantId}%`})
  )::text) AS hash`)[0]!.hash
  const before = await facts(), answers: GeneralAnswer[] = [], results: unknown[] = []
  const tools = createGeneralTools(ctx, conversationId, () => { throw Error("Review drafted a mutation") }, answer => answers.push(generalAnswerSchema.parse(answer)))
  const execute = tools.reviewStaffInvitation?.execute
  if (!execute) throw Error("Invitation review tool missing")
  const input = generalStaffInvitationReviewInput.parse({ email: ` ${email.toUpperCase()} `, name: " QA reviewed staff ", assignments: [{ storeId: ctx.tenantContext.activeStore!.id, role: "CASHIER" }], defaultStoreId: ctx.tenantContext.activeStore!.id, catalogEditor: false })
  for (const email of [input.email, ctx.session.user.email]) {
    const result = await execute({ ...input, email }, { toolCallId: randomUUID(), messages: [] })
    const output = JSON.parse(JSON.stringify(result))
    if (output.status !== "available" || output.data.recipient.email !== email || output.data.notification.status !== "not_requested" || output.data.proposed.status !== "INVITED") throw Error("Actual protected review differs")
    if (email === ctx.session.user.email && (output.data.currentMembership?.id !== actor.id || !output.data.blockers.some((b: { code: string }) => b.code === "STAFF_PROTECTED_ROLE"))) throw Error("Original protected Owner not blocked")
    if (/acceptanceToken|tokenHash|password/.test(JSON.stringify(output.data))) throw Error("Private invitation field leaked")
    results.push(result)
  }
  const foreign = await execute({ ...input, assignments: [{ storeId: foreignStore.id, role: "CASHIER" }], defaultStoreId: foreignStore.id }, { toolCallId: randomUUID(), messages: [] })
  if (JSON.parse(JSON.stringify(foreign)).status !== "unavailable") throw Error("Foreign Store review succeeded")
  results.push(foreign)
  const rollback = new Error("STAFF_INVITATION_REVIEW_ROLLBACK")
  let revokedReviewRefused = false, nativeProtectedRefused = false, nativeRevokedRefused = false, rolledBack = false
  try {
    await db.$transaction(async tx => {
      try {
        await inviteRetailOpsStaffInTransaction(tx, { actorUserId, tenantId, storeId: input.defaultStoreId, role: "cashier", email: ctx.session.user.email })
      } catch (error) { nativeProtectedRefused = error instanceof Error && "code" in error && error.code === "FORBIDDEN" }
      if (!nativeProtectedRefused) throw Error("Native invite could overwrite protected Owner")
      await tx.membership.update({ where: { id: actor.id }, data: { status: "SUSPENDED" } })
      try { await reviewStaffInvitationInTransaction(tx, { ...input, actorUserId, tenantId }) }
      catch (error) { revokedReviewRefused = error instanceof Error && "code" in error && error.code === "FORBIDDEN" }
      try { await inviteRetailOpsStaffInTransaction(tx, { actorUserId, tenantId, storeId: input.defaultStoreId, role: "cashier", email: input.email }) }
      catch (error) { nativeRevokedRefused = error instanceof Error && "code" in error && error.code === "FORBIDDEN" }
      if (!revokedReviewRefused || !nativeRevokedRefused) throw Error("Revoked authority remained usable")
      throw rollback
    }, { maxWait: 10_000, timeout: 30_000 })
  } catch (error) { if (error !== rollback) throw error; rolledBack = true }
  if (before !== await facts()) throw Error("Saved staff/auth/chat facts changed")
  return { verified: true, answers, results, revokedReviewRefused, nativeProtectedRefused, nativeRevokedRefused, rolledBack, savedStaffAuthAndChatFactsUnchanged: true, providerCalls: false, notificationsRequested: false }
}
