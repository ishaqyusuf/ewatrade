import {
  AssistantLiveAiAccessError,
  requireAdultLiveAiAccount,
} from "@ewatrade/db/assistant"
import { TRPCError } from "@trpc/server"

/** API error presentation; the database query owns current account authority. */
export async function requireAdultLiveAiForRequest(
  ...args: Parameters<typeof requireAdultLiveAiAccount>
) {
  try {
    await requireAdultLiveAiAccount(...args)
  } catch (cause) {
    if (cause instanceof AssistantLiveAiAccessError)
      throw new TRPCError({ code: "FORBIDDEN", message: cause.message, cause })
    throw cause
  }
}
