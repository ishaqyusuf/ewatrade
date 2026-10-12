import { z } from "zod"
import { serviceWorkLifecycleAction } from "./service-work"
import { serviceWorkRecordAction } from "./service-work-records"

const id = z.string().trim().min(1).max(128)
export const serviceWorkEditorActionSchema = z.discriminatedUnion("action", [
  ...serviceWorkLifecycleAction.options,
  ...serviceWorkRecordAction.options,
])
export type ServiceWorkEditorAction = z.infer<
  typeof serviceWorkEditorActionSchema
>
export const serviceWorkEditorInput = z
  .object({ jobId: id, lineId: id.optional() })
  .strict()
/** Authenticated projection only; never accept these scope fields as query input. */
export const serviceWorkEditorContextSchema = z
  .object({
    tenantId: id,
    storeId: id,
    actorUserId: id,
    job: z
      .object({
        id,
        orderNumber: z.string(),
        customerName: z.string().nullable(),
        promisedAt: z.string().datetime({ offset: true }).nullable(),
      })
      .strict(),
    line: z
      .object({
        id,
        offeringName: z.string(),
        variantName: z.string(),
        quantity: z.string(),
        status: z.string(),
        authorizationStatus: z.string(),
      })
      .strict()
      .nullable(),
    assignees: z
      .array(z.object({ id, name: z.string().min(1) }).strict())
      .max(100),
    assigneesComplete: z.boolean(),
  })
  .strict()
export type ServiceWorkEditorContext = z.infer<
  typeof serviceWorkEditorContextSchema
>
