import type { GeneralContext } from "./general-context"

/** One exact saved-state snapshot; transaction-local users are included by email. */
export async function staffInvitationRollbackFacts(
  db: Pick<GeneralContext["db"], "$queryRaw">,
  tenantId: string,
  email: string,
) {
  const rows = await db.$queryRaw<
    Array<{ hash: string }>
  >`SELECT md5(jsonb_build_object(
    'tenant',(SELECT to_jsonb(t) FROM "Tenant" t WHERE t.id=${tenantId}),
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "Membership" m WHERE m."tenantId"=${tenantId}),
    'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "RetailOpsStaffProfile" p WHERE p."tenantId"=${tenantId}),
    'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffStoreAssignment" a WHERE a."tenantId"=${tenantId}),
    'invites',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM "RetailOpsStaffInviteToken" i WHERE i."tenantId"=${tenantId}),
    'lifecycle',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "RetailOpsStaffLifecycleEvent" e WHERE e."tenantId"=${tenantId}),
    'access',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "StaffAccessAuditEvent" e WHERE e."tenantId"=${tenantId}),
    'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "StaffInvitationCommand" c WHERE c."tenantId"=${tenantId}),
    'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM "StaffInvitationNotification" n WHERE n."tenantId"=${tenantId}),
    'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffInvitationNotificationAttempt" a WHERE a."tenantId"=${tenantId}),
    'users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM "User" u WHERE u.email=${email} OR u.id IN (SELECT m."userId" FROM "Membership" m WHERE m."tenantId"=${tenantId})),
    'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "Session" s WHERE s."userId" IN (SELECT u.id FROM "User" u WHERE u.email=${email} OR u.id IN (SELECT m."userId" FROM "Membership" m WHERE m."tenantId"=${tenantId}))),
    'accounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "Account" a WHERE a."userId" IN (SELECT u.id FROM "User" u WHERE u.email=${email} OR u.id IN (SELECT m."userId" FROM "Membership" m WHERE m."tenantId"=${tenantId}))),
    'chats',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "AssistantConversation" c WHERE c."tenantId"=${tenantId}),
    'messages',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "AssistantMessage" m WHERE m."conversationId" IN (SELECT c.id FROM "AssistantConversation" c WHERE c."tenantId"=${tenantId})),
    'proposals',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "AssistantActionProposal" p WHERE p."tenantId"=${tenantId}),
    'runs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "AssistantRun" r WHERE r."conversationId" IN (SELECT c.id FROM "AssistantConversation" c WHERE c."tenantId"=${tenantId})),
    'budget',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b."scopeKey") FROM "AssistantBudget" b)
  )::text) AS hash`
  const hash = rows[0]?.hash
  if (!hash) throw Error("Staff invitation rollback snapshot missing.")
  return hash
}
