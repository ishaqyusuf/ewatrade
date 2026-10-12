import { z } from "zod"

const id = z.string().trim().min(1).max(128)
/** Browser navigation contains owning identities only; authority comes from the server. */
export const serviceWorkOriginalTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("service_work"), jobId: id, eventId: id })
    .strict(),
  z
    .object({ kind: z.literal("service_work_note"), jobId: id, recordId: id })
    .strict(),
  z
    .object({
      kind: z.literal("service_work_exception"),
      jobId: id,
      recordId: id,
    })
    .strict(),
])
export type ServiceWorkOriginalTarget = z.infer<
  typeof serviceWorkOriginalTargetSchema
>
