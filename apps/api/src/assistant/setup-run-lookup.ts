import type { AssistantScope } from "@ewatrade/db/assistant"
/** Run IDs alone are never sufficient authority to recover a reply. */
export function setupRunLookup(scope: AssistantScope, runId: string) {
  return {
    where: {
      id: runId,
      actorUserId: scope.userId,
      conversation: {
        ownerUserId: scope.userId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        purpose: "SETUP" as const,
      },
    },
    select: {
      id: true as const,
      status: true as const,
      errorCode: true as const,
      conversationId: true as const,
    },
  }
}
