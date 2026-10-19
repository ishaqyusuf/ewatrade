import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { serviceWorkEditorContextSchema } from "@ewatrade/assistant/general/contracts"
import { z } from "zod"
import type { NativeServiceWorkScope } from "./native-service-work-values"

export const nativeServiceJobId = z.string().trim().min(1).max(128)
export function nativeServiceJobContext(
  raw: unknown,
  scope: NativeServiceWorkScope,
  jobId: string,
) {
  const context = serviceWorkEditorContextSchema.parse(raw)
  if (
    context.tenantId !== scope.tenantId ||
    context.storeId !== scope.storeId ||
    context.actorUserId !== scope.actorUserId ||
    context.job.id !== jobId ||
    context.line !== null
  )
    throw Error(
      "The exact saved Service Job is unavailable in the current workspace.",
    )
  return context
}
/** No queue item, related Job or wrong-Store fallback is accepted. */
export function nativeServiceJobMatches(
  job: RouterOutputs["services"]["getJob"] | undefined,
  context: ReturnType<typeof nativeServiceJobContext>,
  jobId: string,
) {
  return Boolean(
    job &&
      job.id === jobId &&
      job.storeId === context.storeId &&
      job.orderNumber === context.job.orderNumber &&
      job.commercialOrderId,
  )
}
