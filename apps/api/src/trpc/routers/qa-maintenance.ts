import { createHmac, timingSafeEqual } from "node:crypto"
import {
  adoptQaTenantCandidates,
  createQaPurgeRun,
  discoverQaTenantCandidates,
  getQaPurgeRun,
  previewQaPurge,
} from "@ewatrade/db/queries"
import { jobIds, qaPurgeHandler, triggerJob } from "@ewatrade/jobs"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { createTRPCRouter, platformAdminProcedure } from "../init"

const confirmation = "PURGE ALL QA DATA"

function secret() {
  const value =
    process.env.QA_MAINTENANCE_SECRET?.trim() ??
    process.env.BETTER_AUTH_SECRET?.trim() ??
    process.env.AUTH_SECRET?.trim()
  if (!value) throw new Error("QA maintenance secret is not configured.")
  return value
}

function sign(fingerprint: string, expiresAt: number) {
  const payload = `${expiresAt}.${fingerprint}`
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("hex")}`
}

function valid(token: string, fingerprint: string) {
  const [expiry, signedFingerprint, signature] = token.split(".")
  const expiresAt = Number(expiry)
  if (
    !signature ||
    signedFingerprint !== fingerprint ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  )
    return false
  const expected = sign(fingerprint, expiresAt).split(".").at(-1) ?? ""
  return (
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  )
}

export const qaMaintenanceRouter = createTRPCRouter({
  candidates: platformAdminProcedure.query(({ ctx }) =>
    discoverQaTenantCandidates(ctx.db),
  ),
  adopt: platformAdminProcedure
    .input(z.object({ tenantIds: z.array(z.string().min(1)).min(1) }))
    .mutation(({ ctx, input }) =>
      adoptQaTenantCandidates(ctx.db, input.tenantIds),
    ),
  preview: platformAdminProcedure.query(async ({ ctx }) => {
    const preview = await previewQaPurge(ctx.db)
    const expiresAt = Date.now() + 10 * 60 * 1_000
    return {
      ...preview,
      previewExpiresAt: new Date(expiresAt),
      previewToken: sign(preview.fingerprint, expiresAt),
    }
  }),
  start: platformAdminProcedure
    .input(
      z.object({
        confirmation: z.literal(confirmation),
        previewToken: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const preview = await previewQaPurge(ctx.db)
      if (!valid(input.previewToken, preview.fingerprint)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "The QA purge preview expired or changed.",
        })
      }
      if (!preview.tenants.length || preview.blockers.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "QA purge is empty or blocked by live resources.",
        })
      }
      const run = await createQaPurgeRun(ctx.db, ctx.session.user.id)
      await triggerJob(jobIds.qaPurge, qaPurgeHandler, { runId: run.id })
      return { id: run.id, status: run.status }
    }),
  run: platformAdminProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(({ ctx, input }) => getQaPurgeRun(ctx.db, input.runId)),
})
