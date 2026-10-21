import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import { TRPCError } from "@trpc/server"
import type { GeneralContext } from "./general-context"
import { assertGeneralDraftAction } from "./general-context"
import {
  type CurrentGeneralDraftSource,
  readCurrentGeneralDraftInTransaction,
} from "./general-current-draft"
import {
  editGeneralProposalInTransaction,
  inFreshGeneralTransaction,
} from "./general-proposals"
import { proposalDigest } from "./proposal-security"

/** The model never receives or chooses the draft identity retained by this turn. */
export function createGeneralDraftCorrection(
  input: { conversationId: string; runId: string },
  dependencies = {
    transaction: inFreshGeneralTransaction,
    read: readCurrentGeneralDraftInTransaction,
    edit: editGeneralProposalInTransaction,
  },
) {
  let source: CurrentGeneralDraftSource | null = null
  return {
    async read(ctx: GeneralContext) {
      source = null
      const current = await dependencies.transaction(ctx, async (fresh) => {
        const result = await dependencies.read(fresh, input)
        if (result.status === "available")
          assertGeneralDraftAction(fresh, result.payload.action)
        return result
      })
      if (current.status !== "available") return current
      source = current.source
      return { status: "editing" as const, payload: current.payload }
    },
    async edit(ctx: GeneralContext, payload: GeneralAction) {
      const read = source
      source = null
      if (!read || payload.action !== "product_create")
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Read the current product draft before applying a correction.",
        })
      return dependencies.transaction(ctx, async (fresh) => {
        const current = await dependencies.read(fresh, input)
        if (
          current.status !== "available" ||
          proposalDigest(current.source) !== proposalDigest(read)
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The draft changed. Read its latest version before correcting it.",
          })
        assertGeneralDraftAction(fresh, payload.action)
        const saved = await dependencies.edit(fresh, {
          proposalId: read.proposalId,
          revision: read.revision,
          payload,
        })
        return {
          proposalId: saved.id,
          revision: saved.revision,
          payload: saved.payload,
          status: "needs_user_confirmation" as const,
        }
      })
    },
  }
}
