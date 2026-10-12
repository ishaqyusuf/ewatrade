import { randomUUID } from "node:crypto"
import {
  generalAnswerSchema,
  type GeneralAnswer,
} from "@ewatrade/assistant/general/contracts"
import type { GeneralContext } from "./general-context"
import { createGeneralTools } from "./general-tools"
import { generalStaffDirectoryInput } from "./general-staff-reads"
import { generalBudgetScopeKey } from "./general-allowance"

/** Actual protected read-tool callback; caller must select the exact isolated QA profile. */
export async function verifyStaffDirectoryAnswerTargets(
  ctx: GeneralContext,
  conversationId: string,
  continuation: ReturnType<typeof generalStaffDirectoryInput.parse>,
) {
  const db = ctx.db,
    tenantId = ctx.tenantContext.tenant.id
  await db.assistantConversation.findFirstOrThrow({
    where: {
      id: conversationId,
      tenantId,
      ownerUserId: ctx.session.user.id,
      storeId: ctx.tenantContext.activeStore!.id,
      purpose: "GENERAL",
      tenant: { dataClassification: "QA" },
    },
    select: { id: true },
  })
  const facts = async () =>
    (
      await db.$queryRaw<Array<{ hash: string }>>`SELECT md5(jsonb_build_object(
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "Membership" m WHERE m."tenantId"=${tenantId}),
    'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "RetailOpsStaffProfile" p WHERE p."tenantId"=${tenantId}),
    'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffStoreAssignment" a WHERE a."tenantId"=${tenantId}),
    'invites',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM "RetailOpsStaffInviteToken" i WHERE i."tenantId"=${tenantId}),
    'access',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffAccessAuditEvent" a WHERE a."tenantId"=${tenantId}),
    'lifecycle',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "RetailOpsStaffLifecycleEvent" e WHERE e."tenantId"=${tenantId}),
    'conversation',(SELECT to_jsonb(c) FROM "AssistantConversation" c WHERE c.id=${conversationId} AND c."tenantId"=${tenantId}),
    'messages',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "AssistantMessage" m WHERE m."conversationId"=${conversationId}),
    'proposals',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "AssistantActionProposal" p WHERE p."conversationId"=${conversationId} AND p."tenantId"=${tenantId}),
    'runs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "AssistantRun" r WHERE r."conversationId"=${conversationId}),
    'budget',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b."scopeKey") FROM "AssistantBudget" b WHERE b."scopeKey"=${generalBudgetScopeKey({ tenantId })})
  )::text) AS hash`
    )[0]!.hash
  const before = await facts()
  const answers: GeneralAnswer[] = []
  const tools = createGeneralTools(
    ctx,
    conversationId,
    () => {
      throw Error("Read drafted a mutation")
    },
    (answer) => answers.push(generalAnswerSchema.parse(answer)),
  )
  const execute = tools.readStaffDirectory?.execute
  if (!execute) throw Error("Directory tool missing")
  const actor = await db.membership.findFirstOrThrow({
    where: {
      tenantId,
      userId: ctx.session.user.id,
      status: "ACTIVE",
      role: "OWNER",
    },
    select: { role: true },
  })
  const inputs = [
    generalStaffDirectoryInput.parse({
      search: ctx.session.user.email,
      role: actor.role,
      status: "ACTIVE",
    }),
    generalStaffDirectoryInput.parse(continuation),
  ]
  const results: unknown[] = []
  for (const input of inputs) {
    const result = await execute(input, {
      toolCallId: randomUUID(),
      messages: [],
    })
    const output = JSON.parse(JSON.stringify(result))
    const answer = answers.at(-1)
    if (
      output.status !== "available" ||
      answer?.target?.kind !== "staff_directory" ||
      JSON.stringify(answer.target.filters) !== JSON.stringify(input)
    )
      throw Error("Actual tool lost original directory filters/cursor")
    if (
      input === inputs[0] &&
      (output.data.total !== 1 ||
        output.data.data[0]?.email !== ctx.session.user.email)
    )
      throw Error("Exact QA Owner directory read differs")
    if (
      input === inputs[1] &&
      (output.data.total !== 0 || output.data.data.length !== 0)
    )
      throw Error("Rolled-back continuation unexpectedly has saved matches")
    results.push(result)
  }
  if (answers.length !== inputs.length)
    throw Error("Unexpected answer callback count")
  if (before !== (await facts()))
    throw Error("Saved staff/chat/budget facts changed during read")
  return {
    verified: true,
    answers,
    results,
    savedStaffAndChatFactsUnchanged: true,
    providerCalls: false,
  }
}
