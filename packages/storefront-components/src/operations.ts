import { z } from "zod"

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const count = z.number().int().min(0).max(1_000_000)
const duration = z.number().int().min(0).max(86_400_000).nullable()
const code = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,79}$/)
  .nullable()
const run = z
  .object({
    id,
    status: z.enum([
      "QUEUED",
      "RUNNING",
      "VALIDATING",
      "READY",
      "FAILED",
      "CANCELLED",
    ]),
    reservedTokens: count,
    actualTokens: count.nullable(),
    durationMs: duration,
    providerStarted: z.boolean(),
    accepted: z.boolean(),
    errorCode: code,
  })
  .strict()
const event = z
  .object({
    id,
    action: z.enum([
      "initialized",
      "saved",
      "published",
      "rolled_back",
      "generation_requested",
      "generation_cancelled",
      "design_accepted",
    ]),
  })
  .strict()
const check = z
  .object({
    id,
    releaseId: id.nullable(),
    status: z.enum(["PENDING", "CLAIMED", "COMPLETED", "FAILED"]),
    result: z
      .enum([
        "PUBLIC_SOURCE_UNAVAILABLE",
        "SUPERSEDED",
        "DESIGN_UNAVAILABLE",
        "SOURCE_READY_HTTP_UNVERIFIED",
        "SOURCE_CHECK_FAILED",
      ])
      .nullable(),
  })
  .strict()
const failure = z
  .object({
    id,
    operation: z.enum([
      "storefront.initialize",
      "storefront.saveDraft",
      "storefront.publish",
      "storefront.rollback",
      "storefront.generate",
      "storefront.acceptDesign",
      "storefront.cancelGeneration",
    ]),
    code: z.enum([
      "BAD_REQUEST",
      "CONFLICT",
      "FORBIDDEN",
      "UNAUTHORIZED",
      "PRECONDITION_FAILED",
      "INTERNAL_SERVER_ERROR",
      "TIMEOUT",
      "TOO_MANY_REQUESTS",
    ]),
  })
  .strict()
const artifact = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["ready", "failed", "outcome-unknown"]),
    generatorKind: z.enum(["provider", "offline-fixture", "disabled"]),
    totalMs: duration,
    actualTokens: count.nullable(),
    reviewed: z.boolean(),
  })
  .strict()

/** Only safe projections from an already scoped operator console export; no DB or credentials. */
export const storefrontOperationsSnapshotSchema = z
  .object({
    version: z.literal(1),
    source: z.enum([
      "synthetic-fixture",
      "local-artifact-review",
      "operator-export",
    ]),
    siteStatus: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).nullable(),
    activeReleaseId: id.nullable(),
    runs: z.array(run).max(50),
    events: z.array(event).max(100),
    checks: z.array(check).max(50),
    failures: z.array(failure).max(100),
    artifacts: z.array(artifact).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    for (const key of [
      "runs",
      "events",
      "checks",
      "failures",
      "artifacts",
    ] as const) {
      if (new Set(value[key].map((row) => row.id)).size !== value[key].length) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Duplicate receipt IDs would double-count outcomes.",
        })
      }
    }
  })

const tally = (values: string[]) =>
  Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [
        value,
        values.filter((entry) => entry === value).length,
      ]),
  )
function latency(values: Array<number | null>) {
  const known = values.filter((value): value is number => value !== null)
  return {
    known: known.length,
    unknown: values.length - known.length,
    meanMs: known.length
      ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length)
      : null,
    maxMs: known.length ? Math.max(...known) : null,
  }
}

/** Counts describe this bounded snapshot, never a business-wide census or proof of HTTP delivery. */
export function summarizeStorefrontOperations(value: unknown) {
  const input = storefrontOperationsSnapshotSchema.parse(value)
  const providerArtifacts = input.artifacts.filter(
    (row) => row.generatorKind === "provider",
  )
  const tokenValues = [
    ...input.runs.map((row) => row.actualTokens),
    ...providerArtifacts.map((row) => row.actualTokens),
  ]
  return {
    coverage: "bounded-scoped-snapshot" as const,
    source: input.source,
    generation: {
      runs: tally(input.runs.map((row) => row.status)),
      acceptedProposals: input.runs.filter((row) => row.accepted).length,
      failureCodes: tally(
        input.runs.flatMap((row) => (row.errorCode ? [row.errorCode] : [])),
      ),
      latency: latency(input.runs.map((row) => row.durationMs)),
    },
    usage: {
      knownActualTokens: tokenValues.reduce<number>(
        (sum, value) => sum + (value ?? 0),
        0,
      ),
      unknownUsageReceipts: tokenValues.filter((value) => value === null)
        .length,
      unsettledReservedTokens: input.runs
        .filter((row) => row.actualTokens === null)
        .reduce((sum, row) => sum + row.reservedTokens, 0),
      providerStartedWithoutUsage: input.runs.filter(
        (row) => row.providerStarted && row.actualTokens === null,
      ).length,
      monetaryCost: null,
      monetaryCostStatus: "not-recorded-use-provider-invoice" as const,
    },
    components: {
      artifacts: tally(input.artifacts.map((row) => row.status)),
      offlineFixtures: input.artifacts.filter(
        (row) => row.generatorKind === "offline-fixture",
      ).length,
      reviewedArtifacts: input.artifacts.filter((row) => row.reviewed).length,
      latency: latency(input.artifacts.map((row) => row.totalMs)),
    },
    publication: {
      siteStatus: input.siteStatus,
      activeReleaseId: input.activeReleaseId,
      committedOutcomes: tally(input.events.map((row) => row.action)),
      requestFailures: tally(
        input.failures.map((row) => `${row.operation}:${row.code}`),
      ),
      sourceChecks: tally(
        input.checks.map(
          (row) => `${row.status}:${row.result ?? "UNRECORDED"}`,
        ),
      ),
      activeReleaseChecks: input.activeReleaseId
        ? input.checks
            .filter((row) => row.releaseId === input.activeReleaseId)
            .map((row) => ({ status: row.status, result: row.result }))
        : [],
      delivery: "unverified" as const,
    },
  }
}
