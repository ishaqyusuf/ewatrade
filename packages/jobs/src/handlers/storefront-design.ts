import { randomUUID } from "node:crypto"
import {
  STOREFRONT_DESIGN_PROMPT_VERSION,
  STOREFRONT_GENERATION_CONFIGURATION_KEY,
  StorefrontDesignPreflightError,
  generateStorefrontDesign,
  isStorefrontDesignProviderConfigured,
  readStorefrontGenerationConfiguration,
  storefrontDesignPrompt,
} from "@ewatrade/ai/storefront-design"
import type { PrismaClient } from "@ewatrade/db"
import { prisma } from "@ewatrade/db/client"
import {
  getScopedSite,
  lockSiteDesignRunInTransaction,
  lockSiteInTransaction,
  lockStorefrontAuthorityInTransaction,
  settleSiteDesignUsageInTransaction,
  siteContentHash,
  storefrontTransactionOptions,
} from "@ewatrade/db/queries"
import {
  storefrontDesignBriefSchema,
  validateStorefrontDesignOutput,
} from "@ewatrade/storefront-contracts/design"
import { templateManifestSchema } from "@ewatrade/storefront-contracts/manifest"
import { listSelectableTemplates } from "@ewatrade/storefront-templates"
import { evaluateQaProviderPolicy } from "@ewatrade/utils/qa-provider-policy"
import { z } from "zod"

const payloadSchema = z
  .object({ runId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) })
  .strict()
const maxAttempts = 2

/** Identifier-only durable worker. One external call maximum; unknown outcomes are never retried/refunded. */
export async function storefrontDesignHandler(
  payload: { runId: string },
  dependencies: {
    db?: PrismaClient
    generate?: typeof generateStorefrontDesign
  } = {},
) {
  const { runId } = payloadSchema.parse(payload)
  const db = dependencies.db ?? prisma
  const initial = await db.siteDesignRun.findUnique({
    where: { id: runId },
    select: { tenantId: true, storeId: true, siteId: true, actorUserId: true },
  })
  if (!initial) return
  const scope = {
    tenantId: initial.tenantId,
    storeId: initial.storeId,
    siteId: initial.siteId,
  }
  const leaseToken = randomUUID()
  const claimed = await db.$transaction(async (tx) => {
    const authority = await lockStorefrontAuthorityInTransaction(tx, {
      ...scope,
      actorUserId: initial.actorUserId,
    })
    await lockSiteInTransaction(tx, scope)
    const run = await lockSiteDesignRunInTransaction(tx, scope, runId)
    if (!run || !["QUEUED", "RUNNING", "VALIDATING"].includes(run.status))
      return null
    if (run.leaseUntil && run.leaseUntil.getTime() > Date.now()) return null
    const failBeforeCall = async (errorCode: string) => {
      await settleSiteDesignUsageInTransaction(
        tx,
        run,
        run.actualTokens,
        errorCode,
      )
      await tx.siteDesignRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          errorCode,
          completedAt: new Date(),
          leaseUntil: null,
        },
      })
      return null
    }
    if (run.providerStartedAt)
      return failBeforeCall(
        run.actualTokens === null
          ? "PROVIDER_OUTCOME_UNKNOWN"
          : "VALIDATION_INTERRUPTED",
      )
    if (run.attempts >= maxAttempts)
      return failBeforeCall("DESIGN_ATTEMPTS_EXHAUSTED")
    if (!authority.ok) return failBeforeCall("DESIGN_AUTHORITY_CHANGED")
    const policy = evaluateQaProviderPolicy({
      adapter: "live",
      operation: "ai_analysis",
      tenantDataClassification: authority.authority.tenant.dataClassification,
    })
    if (!policy.allowed) {
      await tx.qaAccessAuditEvent.create({
        data: {
          eventType: "provider_operation_blocked",
          metadata: {
            operation: "ai_analysis",
            source: "storefront-design-worker",
          },
          outcome: policy.code,
        },
      })
      return failBeforeCall("DESIGN_PROVIDER_POLICY_BLOCKED")
    }
    const site = await getScopedSite(tx, scope)
    if (!site?.isPrimary || site.draftRevision !== run.baseDraftRevision)
      return failBeforeCall("DESIGN_DRAFT_CHANGED")
    const setting = await tx.systemConfiguration.findUnique({
      where: { key: STOREFRONT_GENERATION_CONFIGURATION_KEY },
      select: { value: true },
    })
    const configuration = readStorefrontGenerationConfiguration(setting?.value)
    if (
      !configuration ||
      siteContentHash(configuration) !== siteContentHash(run.configuration) ||
      !isStorefrontDesignProviderConfigured(configuration)
    )
      return failBeforeCall("DESIGN_CONFIGURATION_CHANGED")
    if (
      run.promptVersion !== STOREFRONT_DESIGN_PROMPT_VERSION ||
      run.inputHash !==
        siteContentHash({
          brief: run.brief,
          manifests: run.manifests,
          configuration: run.configuration,
        })
    )
      return failBeforeCall("DESIGN_INPUT_CHANGED")
    return tx.siteDesignRun.update({
      where: { id: run.id },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        leaseToken,
        leaseUntil: new Date(Date.now() + 120_000),
      },
    })
  }, storefrontTransactionOptions())
  if (!claimed) return

  let tokens: number | null = null
  let providerStarted = false
  const started = Date.now()
  const finish = async (
    output: ReturnType<typeof validateStorefrontDesignOutput> | null,
    errorCode: string | null,
  ) =>
    db.$transaction(async (tx) => {
      const run = await lockSiteDesignRunInTransaction(tx, scope, runId)
      if (!run || run.leaseToken !== leaseToken) return
      await settleSiteDesignUsageInTransaction(
        tx,
        { ...run, durationMs: Date.now() - started },
        tokens,
        errorCode ?? "completed",
      )
      const canComplete =
        run.status === "RUNNING" || run.status === "VALIDATING"
      await tx.siteDesignRun.update({
        where: { id: runId },
        data: {
          ...(canComplete
            ? {
                status: output ? "READY" : "FAILED",
                errorCode,
                ...(output
                  ? { output, outputHash: siteContentHash(output) }
                  : {}),
              }
            : {}),
          completedAt: run.completedAt ?? new Date(),
          durationMs: Date.now() - started,
          leaseToken: null,
          leaseUntil: null,
        },
      })
    }, storefrontTransactionOptions())
  try {
    const brief = storefrontDesignBriefSchema.parse(claimed.brief)
    const manifests = z
      .array(templateManifestSchema)
      .max(20)
      .parse(claimed.manifests)
    const configuration = readStorefrontGenerationConfiguration(
      claimed.configuration,
    )
    if (!configuration)
      throw new StorefrontDesignPreflightError("DESIGN_CONFIGURATION_CHANGED")
    const registered = listSelectableTemplates().map((entry) => entry.manifest)
    if (
      manifests.some(
        (manifest) =>
          !registered.some(
            (current) =>
              current.key === manifest.key &&
              current.version === manifest.version &&
              siteContentHash(current) === siteContentHash(manifest),
          ),
      )
    )
      throw new StorefrontDesignPreflightError("DESIGN_VERSIONS_CHANGED")
    const prompt = storefrontDesignPrompt(brief, manifests)
    if (new TextEncoder().encode(prompt).length > configuration.maxInputBytes)
      throw new StorefrontDesignPreflightError("DESIGN_INPUT_TOO_LARGE")
    const began = await db.siteDesignRun.updateMany({
      where: {
        id: runId,
        ...scope,
        status: "RUNNING",
        leaseToken,
        leaseUntil: { gt: new Date() },
        providerStartedAt: null,
      },
      data: { providerStartedAt: new Date() },
    })
    if (!began.count) return
    providerStarted = true
    const result = await (dependencies.generate ?? generateStorefrontDesign)(
      configuration,
      prompt,
    )
    tokens =
      Number.isSafeInteger(result.tokens) &&
      Number(result.tokens) >= 0 &&
      Number(result.tokens) <= 1_000_000
        ? result.tokens
        : null
    await db.siteDesignRun.updateMany({
      where: { id: runId, status: "RUNNING", leaseToken },
      data: {
        status: "VALIDATING",
        actualTokens: tokens,
        durationMs: Date.now() - started,
      },
    })
    if (new TextEncoder().encode(result.text).length > 262_144) {
      await finish(null, "DESIGN_OUTPUT_TOO_LARGE")
      return
    }
    let output: ReturnType<typeof validateStorefrontDesignOutput>
    try {
      const text = result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")
      output = validateStorefrontDesignOutput(
        JSON.parse(text),
        brief,
        registered,
      )
    } catch {
      await finish(null, "DESIGN_OUTPUT_INVALID")
      return
    }
    await finish(output, null)
  } catch (error) {
    const knownBeforeCall = error instanceof StorefrontDesignPreflightError
    if (knownBeforeCall || !providerStarted) tokens = 0
    await finish(
      null,
      knownBeforeCall
        ? error.code
        : !providerStarted
          ? "DESIGN_INPUT_INVALID"
          : tokens === null
            ? "PROVIDER_OUTCOME_UNKNOWN"
            : "DESIGN_RESULT_FAILED",
    )
  }
}
