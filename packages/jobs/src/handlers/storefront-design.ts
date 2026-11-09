import { randomUUID } from "node:crypto"
import { authorizedLiveAiFetch } from "@ewatrade/ai/dispatch-guard"
import { storefrontContentPrompt } from "@ewatrade/ai/storefront-content"
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
import {
  AssistantLiveAiAccessError,
  requireAdultLiveAiAccount,
} from "@ewatrade/db/assistant"
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
import { versionAvailable } from "@ewatrade/storefront-contracts/availability"
import {
  STOREFRONT_CONTENT_PROMPT_VERSION,
  storefrontContentBriefSchema,
  validateStorefrontContentOutput,
} from "@ewatrade/storefront-contracts/content"
import {
  storefrontDesignBriefSchema,
  validateStorefrontDesignOutput,
} from "@ewatrade/storefront-contracts/design"
import { templateManifestSchema } from "@ewatrade/storefront-contracts/manifest"
import {
  type TemplateManifest,
  assertCompositionSources,
  validateComposition,
} from "@ewatrade/storefront-contracts/manifest"
import { validateDesignAssets } from "@ewatrade/storefront-runtime/design-assets"
import {
  assertStorefrontContentBrief,
  listSelectableTemplates,
  templateRegistry,
} from "@ewatrade/storefront-templates"
import { evaluateQaProviderPolicy } from "@ewatrade/utils/qa-provider-policy"
import { z } from "zod"

const payloadSchema = z
  .object({ runId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) })
  .strict()
const maxAttempts = 2

/** Current registered policy is rechecked before a provider sees a frozen request. */
export function prepareStorefrontGenerationInput(
  run: { promptVersion: string; brief: unknown },
  registered: readonly TemplateManifest[],
) {
  if (run.promptVersion === STOREFRONT_CONTENT_PROMPT_VERSION) {
    const brief = storefrontContentBriefSchema.parse(run.brief)
    const manifest = registered.find(
      (entry) =>
        entry.key === brief.composition.template.key &&
        entry.version === brief.composition.template.version,
    )
    if (!manifest)
      throw new StorefrontDesignPreflightError("DESIGN_VERSIONS_CHANGED")
    validateComposition(brief.composition, manifest)
    assertCompositionSources(
      brief.composition,
      (pin) =>
        registered.find(
          (entry) => entry.key === pin.key && entry.version === pin.version,
        ) ?? null,
    )
    validateDesignAssets(brief.composition, manifest)
    assertStorefrontContentBrief(brief, registered)
    return {
      prompt: storefrontContentPrompt(brief),
      validate: (value: unknown) =>
        validateStorefrontContentOutput(value, brief),
    }
  }
  if (run.promptVersion !== STOREFRONT_DESIGN_PROMPT_VERSION)
    throw new StorefrontDesignPreflightError("DESIGN_VERSIONS_CHANGED")
  const brief = storefrontDesignBriefSchema.parse(run.brief)
  return {
    prompt: storefrontDesignPrompt(brief, registered),
    validate: (value: unknown) =>
      validateStorefrontDesignOutput(value, brief, registered),
  }
}

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
      ![
        STOREFRONT_DESIGN_PROMPT_VERSION,
        STOREFRONT_CONTENT_PROMPT_VERSION,
      ].includes(run.promptVersion) ||
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
    output:
      | ReturnType<typeof validateStorefrontDesignOutput>
      | ReturnType<typeof validateStorefrontContentOutput>
      | null,
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
    const manifests = z
      .array(templateManifestSchema)
      .max(20)
      .parse(claimed.manifests)
    const configuration = readStorefrontGenerationConfiguration(
      claimed.configuration,
    )
    if (!configuration)
      throw new StorefrontDesignPreflightError("DESIGN_CONFIGURATION_CHANGED")
    const registered = (
      claimed.promptVersion === STOREFRONT_CONTENT_PROMPT_VERSION
        ? templateRegistry.filter(
            (entry) =>
              entry.status.registration === "runtime-registered" &&
              entry.status.qualification === "qualified" &&
              versionAvailable(entry, "inspect"),
          )
        : listSelectableTemplates()
    ).map((entry) => entry.manifest)
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
    // Designs retain their exact frozen manifests; content resolves its current source profiles.
    const prepared = prepareStorefrontGenerationInput(
      claimed,
      claimed.promptVersion === STOREFRONT_CONTENT_PROMPT_VERSION
        ? registered
        : manifests,
    )
    const prompt = prepared.prompt
    if (new TextEncoder().encode(prompt).length > configuration.maxInputBytes)
      throw new StorefrontDesignPreflightError("DESIGN_INPUT_TOO_LARGE")
    const authorizeLiveAi = () =>
      requireAdultLiveAiAccount(db, initial.actorUserId)
    await authorizeLiveAi()
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
      { fetchImpl: authorizedLiveAiFetch(authorizeLiveAi) },
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
    let output:
      | ReturnType<typeof validateStorefrontDesignOutput>
      | ReturnType<typeof validateStorefrontContentOutput>
    try {
      const text = result.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")
      output = prepared.validate(JSON.parse(text))
    } catch {
      await finish(null, "DESIGN_OUTPUT_INVALID")
      return
    }
    await finish(output, null)
  } catch (error) {
    const knownBeforeCall =
      error instanceof StorefrontDesignPreflightError ||
      (error instanceof AssistantLiveAiAccessError && !providerStarted)
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
