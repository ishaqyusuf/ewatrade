import { TRPCError } from "@trpc/server"
import { AssistantLimitError, AssistantStreamGuard } from "./stream-guard"

// Same process-local admission policy as assistant turns. The shared Tenant
// GENERAL database budget remains the durable spend limit across both features.
const draftGuard = new AssistantStreamGuard()

export async function withCustomerMessageDraftLease<T>(
  actorUserId: string,
  run: () => Promise<T>,
  guard = draftGuard,
): Promise<T> {
  let lease: ReturnType<AssistantStreamGuard["acquire"]>
  try {
    lease = guard.acquire(actorUserId)
  } catch (error) {
    if (error instanceof AssistantLimitError)
      throw new TRPCError({
        code: error.status === 429 ? "TOO_MANY_REQUESTS" : "CONFLICT",
        message: error.message,
        cause: error,
      })
    throw error
  }
  try {
    return await run()
  } finally {
    lease.release()
  }
}
