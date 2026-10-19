import { z } from "zod"
import { readRecordOriginSchema } from "./read-record-target"

const id = z.string().trim().min(1).max(128)

/** Generic Service Requests only; Product Inquiries and clinical intake stay distinct. */
export const serviceRequestPageInput = z
  .object({
    status: z
      .enum([
        "submitted",
        "needs_information",
        "quoted",
        "declined",
        "withdrawn",
        "converted",
      ])
      .optional(),
    query: z.string().trim().min(1).max(120).optional(),
    cursor: z.string().min(1).max(4096).optional(),
    limit: z.number().int().min(1).max(10).default(10),
  })
  .strict()

export const serviceRequestOriginalInput = z.object({ requestId: id }).strict()

/** Provenance is navigation context, never permission or a request-scope override. */
export const serviceRequestTargetSchema = serviceRequestOriginalInput
  .extend({
    kind: z.literal("service_request"),
    origin: readRecordOriginSchema,
  })
  .strict()

/** Preserve the exact page filters and origin; later pages still reauthorize. */
export const serviceRequestPageTargetSchema = z
  .object({
    kind: z.literal("service_request_page"),
    origin: readRecordOriginSchema,
    filters: serviceRequestPageInput,
  })
  .strict()

export const serviceRequestReadTargetSchema = z.discriminatedUnion("kind", [
  serviceRequestTargetSchema,
  serviceRequestPageTargetSchema,
])

export type ServiceRequestTarget = z.infer<typeof serviceRequestTargetSchema>
export type ServiceRequestPageTarget = z.infer<
  typeof serviceRequestPageTargetSchema
>
