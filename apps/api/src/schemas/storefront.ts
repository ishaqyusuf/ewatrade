import { catalogQuerySchema } from "@ewatrade/storefront-contracts/resources"
import { z } from "zod"

export const storefrontPreviewSchema = z
  .object({
    session: z.string().min(1).max(4096),
    query: catalogQuerySchema.default({}),
    /** Private preview only; finite registered compositions, never saved here. */
    designs: z.array(z.unknown()).max(3).optional(),
  })
  .strict()

const id = z.string().trim().min(1).max(128)
const revision = z.number().int().min(0)
/** Client-generated per user intent; retries of the same intent reuse it. */
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/)

/** Compositions are validated against the registered manifest in the command. */
export const storefrontInitializeSchema = z
  .object({
    storeId: id,
    templateKey: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,63}$/)
      .optional(),
    templateVersion: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .optional(),
  })
  .strict()

export const storefrontSaveDraftSchema = z
  .object({
    expectedSiteId: id,
    expectedRevision: revision,
    composition: z.unknown(),
  })
  .strict()

export const storefrontPublishSchema = z
  .object({
    expectedSiteId: id,
    expectedDraftRevision: revision,
    expectedActiveReleaseId: id.nullable(),
    idempotencyKey,
    /** The owner's explicit consent to public browsing of this exact draft. */
    publicBrowsingConsent: z.literal(true),
  })
  .strict()

export const storefrontRollbackSchema = z
  .object({
    expectedSiteId: id,
    releaseId: id,
    expectedActiveReleaseId: id.nullable(),
    idempotencyKey,
  })
  .strict()

export const storefrontHistorySchema = z
  .object({ take: z.number().int().min(1).max(50).default(20) })
  .strict()
  .default({ take: 20 })

export const storefrontDesignBriefRequestSchema = z
  .object({ desiredJourney: z.enum(["browse", "request"]) })
  .strict()

export const storefrontGenerateSchema = z
  .object({
    expectedSiteId: id,
    expectedDraftRevision: revision,
    clientRequestId: idempotencyKey,
    desiredJourney: z.enum(["browse", "request"]),
    refinement: z.string().trim().max(500).default(""),
  })
  .strict()
export const storefrontGenerationIdSchema = z
  .object({ expectedSiteId: id, runId: id })
  .strict()

export const storefrontAcceptDesignSchema = storefrontGenerationIdSchema
  .extend({
    expectedRevision: revision,
    directionId: z.enum(["01", "02", "03"]),
  })
  .strict()
