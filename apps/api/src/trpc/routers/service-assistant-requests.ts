import {
  serviceRequestOriginalInput,
  serviceRequestPageInput,
} from "@ewatrade/assistant/general/service-request-read"
import { ServiceIntakeReviewError } from "@ewatrade/db/service-intake-review"
import {
  listServiceRequestPageInTransaction,
  readServiceRequestOriginalInTransaction,
} from "@ewatrade/db/service-request-read"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure } from "../init"
import { assertServiceManager } from "./service-permissions"

const snapshot = {
  isolationLevel: "RepeatableRead" as const,
  maxWait: 10_000,
  timeout: 30_000,
}

function currentScope(ctx: {
  session: { user: { id: string } }
  tenantContext: {
    tenant: { id: string }
    membership: { role: string }
    activeStore: { id: string } | null
  }
}) {
  assertServiceManager(ctx.tenantContext.membership.role)
  if (!ctx.tenantContext.activeStore)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Choose the current Store.",
    })
  return {
    actorUserId: ctx.session.user.id,
    tenantId: ctx.tenantContext.tenant.id,
    storeId: ctx.tenantContext.activeStore.id,
  }
}

async function read<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ServiceIntakeReviewError)
      throw new TRPCError({
        code: error.code,
        message: error.message,
        cause: error,
      })
    throw error
  }
}

/** Pure protected Generic Service Request views; no disposition/customer action. */
export const serviceAssistantRequestsRouter = createTRPCRouter({
  listPage: protectedProcedure
    .input(serviceRequestPageInput)
    .query(({ ctx, input }) => {
      const scope = currentScope(ctx)
      return read(() =>
        ctx.db.$transaction(
          (tx) =>
            listServiceRequestPageInTransaction(tx, { ...input, ...scope }),
          snapshot,
        ),
      )
    }),
  original: protectedProcedure
    .input(serviceRequestOriginalInput)
    .query(({ ctx, input }) => {
      const scope = currentScope(ctx)
      return read(() =>
        ctx.db.$transaction(
          (tx) =>
            readServiceRequestOriginalInTransaction(tx, { ...input, ...scope }),
          snapshot,
        ),
      )
    }),
})
