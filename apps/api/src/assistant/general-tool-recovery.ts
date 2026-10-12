import { FinanceError } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"

export const NOT_FOUND_GUIDANCE =
  "Usually the identifier is stale or guessed: identifiers from earlier replies are not kept and must never be guessed from names. Find the record again by name in this reply (readCatalogPage, searchRecords, readCustomers or readOrders) and use the identifier that read returns. If it still cannot be found, say so; do not call it an access problem."

/**
 * Tool failures the model can fix itself, told plainly. Anything else stays
 * the generic "unavailable for your role, Store or setup".
 */
export function recoverableToolFailure(toolName: string, error: unknown) {
  // A draft whose stated amounts convert outside the proposal limits.
  if (toolName === "draftAction" && error instanceof z.ZodError)
    return {
      status: "needs_changes" as const,
      reason: error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    }
  // Bookkeeping drafts call finance rules directly, outside the procedure that
  // maps their errors; "use an account in the same book" is the model's to fix
  // (live check, 12 Oct 2026, was reported as unavailable for the role).
  if (
    toolName === "draftAction" &&
    error instanceof FinanceError &&
    error.code !== "FORBIDDEN" &&
    error.code !== "NOT_FOUND"
  )
    return { status: "needs_changes" as const, reason: error.message }
  // A stale or guessed ID is not an access problem. Reported as one, the
  // model told the owner they had no access to an item it had read in an
  // earlier reply (12 Oct 2026); earlier tool results are not in history.
  if (
    (error instanceof TRPCError || error instanceof FinanceError) &&
    error.code === "NOT_FOUND"
  )
    return {
      status: "not_found" as const,
      reason: `${error.message} ${NOT_FOUND_GUIDANCE}`,
    }
}
