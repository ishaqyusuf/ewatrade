import type { Prisma, PrismaClient } from "@ewatrade/db"
import {
  type SiteScope,
  getPrimarySite,
  getScopedSite,
  type listSiteDesignRunsInTransaction,
  lockSiteInTransaction,
  lockStorefrontAuthorityInTransaction,
  siteContentHash,
  storefrontTransactionOptions,
} from "@ewatrade/db/queries"
import {
  type VersionIntent,
  versionAvailable,
} from "@ewatrade/storefront-contracts/availability"
import {
  STOREFRONT_RUNTIME_VERSION,
  type StorefrontComposition,
  type TemplateManifest,
  assertCompositionSources,
  validateComposition,
} from "@ewatrade/storefront-contracts/manifest"
import { validateDesignAssets } from "@ewatrade/storefront-runtime/design-assets"
import {
  listSelectableTemplates,
  templateRegistry,
} from "@ewatrade/storefront-templates"
import { TRPCError } from "@trpc/server"
export type StorefrontActor = { tenantId: string; actorUserId: string }
type Tx = Prisma.TransactionClient
/** Only runtime-registered, qualified templates on the current runtime are usable. */
export function usableTemplate(
  key: string,
  version?: string,
  intent: VersionIntent = "inspect",
) {
  const entry = (
    version === undefined ? listSelectableTemplates() : templateRegistry
  ).find(
    ({ manifest }) =>
      manifest.key === key &&
      (version === undefined || manifest.version === version),
  )
  if (
    !entry ||
    entry.status.registration !== "runtime-registered" ||
    entry.status.qualification !== "qualified" ||
    !versionAvailable(entry, intent) ||
    entry.manifest.runtimeVersion !== STOREFRONT_RUNTIME_VERSION
  )
    return null
  return entry.manifest
}

/** Validates against the registered manifest the composition names. */
export function checkComposition(
  input: unknown,
  intent: VersionIntent = "inspect",
):
  | { ok: true; composition: StorefrontComposition; manifest: TemplateManifest }
  | { ok: false; issue: string } {
  const template = (
    input as { template?: { key?: unknown; version?: unknown } } | null
  )?.template
  const manifest =
    typeof template?.key === "string" && typeof template.version === "string"
      ? usableTemplate(template.key, template.version, intent)
      : null
  if (!manifest)
    return {
      ok: false,
      issue: "This storefront design version isn't available.",
    }
  try {
    const composition = validateComposition(input, manifest)
    assertCompositionSources(composition, (pin) =>
      usableTemplate(pin.key, pin.version, intent),
    )
    validateDesignAssets(composition, manifest)
    return {
      ok: true,
      composition,
      manifest,
    }
  } catch (error) {
    const issue =
      error instanceof Error && !error.message.startsWith("[")
        ? error.message
        : "The storefront draft has invalid settings."
    return { ok: false, issue }
  }
}

export async function authorize(
  tx: Tx,
  actor: StorefrontActor,
  storeId: string,
) {
  const result = await lockStorefrontAuthorityInTransaction(tx, {
    ...actor,
    storeId,
  })
  if (result.ok) return result.authority
  if (result.reason === "forbidden")
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only active business Owners and Admins can manage the storefront.",
    })
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      result.reason === "store-unavailable"
        ? "The storefront's Store is not active."
        : "The business plan doesn't currently allow a public storefront.",
  })
}

/** Primary Site plus fresh authority for its own Store; null when not initialized. */
export async function openPrimarySite(
  tx: Tx,
  actor: StorefrontActor,
  lock: boolean,
) {
  const primary = await getPrimarySite(tx, actor.tenantId)
  if (!primary) return null
  const authority = await authorize(tx, actor, primary.storeId)
  const scope: SiteScope = {
    tenantId: actor.tenantId,
    storeId: primary.storeId,
    siteId: primary.id,
  }
  if (lock && !(await lockSiteInTransaction(tx, scope))) return null
  const site = lock ? await getScopedSite(tx, scope) : primary
  return site ? { site, scope, authority } : null
}

export function requireSite<T>(value: T | null): T {
  if (!value)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Set up the storefront first.",
    })
  return value
}

export function inTx<T>(db: PrismaClient, run: (tx: Tx) => Promise<T>) {
  return db.$transaction(run, storefrontTransactionOptions())
}

export function assertExpectedSite(siteId: string, expectedSiteId: string) {
  if (siteId !== expectedSiteId)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "The storefront workspace changed. Reload before saving or publishing.",
    })
}

export function presentGeneration(
  run: Awaited<ReturnType<typeof listSiteDesignRunsInTransaction>>[number] & {
    output?: Prisma.JsonValue
  },
) {
  return {
    id: run.id,
    status: run.status,
    baseRevision: run.baseDraftRevision,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    errorCode: run.errorCode,
    needsReconciliation:
      !!run.providerStartedAt &&
      !run.usageSettledAt &&
      (run.status === "FAILED" ||
        run.status === "CANCELLED" ||
        run.status === "READY"),
    output:
      run.status === "READY" &&
      run.output &&
      run.outputHash === siteContentHash(run.output)
        ? run.output
        : null,
    acceptedDirectionId: run.acceptedDirectionId,
    acceptedDraftRevision: run.acceptedDraftRevision,
  }
}
