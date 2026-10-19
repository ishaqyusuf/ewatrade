import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import { z } from "zod"

type Share = Extract<GeneralAction, { action: "service_message_share" }>
export type NativeServiceMessageEdits = {
  channel: Share["channel"]
  message: string
  reason: string
  alreadyShared: boolean
  acknowledgedContext: string | null
}
export type NativeServiceMessageContext =
  RouterOutputs["serviceCommunications"]["manualMessageEditorContext"]
export const nativeServiceMessageContextSchema = z
  .object({
    actorUserId: z.string().min(1),
    tenantId: z.string().min(1),
    storeId: z.string().min(1),
    job: z
      .object({
        id: z.string().min(1),
        revision: z.number().int().nonnegative(),
      })
      .strict(),
    order: z.object({ id: z.string().min(1), number: z.string() }).strict(),
    recipient: z
      .object({
        name: z.string().nullable(),
        phone: z.string().nullable(),
        email: z.string().nullable(),
      })
      .strict(),
    asOf: z.string().datetime(),
  })
  .strict()
const scopeProjection = z
  .object({
    actorUserId: z.string(),
    tenantId: z.string(),
    storeId: z.string(),
    job: z.object({ id: z.string() }).passthrough(),
  })
  .passthrough()
type Profile = {
  id?: string
  businessId?: string
  storeId?: string | null
  role?: string
  staffAccessMode?: string
  catalogEditor?: boolean
  status?: string
}
export function nativeServiceMessageProfileKey(
  profile: Profile | null | undefined,
) {
  if (
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE")
  )
    return null
  return JSON.stringify([
    profile?.id,
    profile?.businessId,
    profile?.storeId,
    profile?.role,
    profile?.staffAccessMode,
    profile?.catalogEditor,
    profile?.status,
  ])
}
/** UI freshness only; the protected canonical readers still decide authority. */
export function nativeServiceMessageContextMatches(
  context: unknown,
  profile: Profile | null | undefined,
  jobId?: string,
): boolean {
  const parsed = scopeProjection.safeParse(context)
  if (
    !parsed.success ||
    !profile?.id ||
    !profile.businessId ||
    !profile.storeId ||
    (profile.status !== undefined && profile.status !== "ACTIVE")
  )
    return false
  const role = profile.role?.trim().toUpperCase()
  if (
    !(
      role === "OWNER" ||
      role === "ADMIN" ||
      (role === "MANAGER" && profile.staffAccessMode === "LEGACY")
    )
  )
    return false
  return (
    parsed.data.actorUserId === profile.id &&
    parsed.data.tenantId === profile.businessId &&
    parsed.data.storeId === profile.storeId &&
    (jobId === undefined || parsed.data.job.id === jobId)
  )
}

/** Local acknowledgement binding only; private context stays in memory, never authority. */
export function nativeServiceMessageContextKey(raw: unknown): string | null {
  const result = nativeServiceMessageContextSchema.safeParse(raw)
  if (!result.success) return null
  const value = result.data
  return JSON.stringify([
    value.actorUserId,
    value.tenantId,
    value.storeId,
    value.job.id,
    value.job.revision,
    value.order.id,
    value.order.number,
    value.recipient.name,
    value.recipient.phone,
    value.recipient.email,
  ])
}

/** Fixed Job, explicit renewed self-report, no typed recipient/authority fields. */
export function nativeServiceMessageCandidate(
  initial: Share,
  edits: NativeServiceMessageEdits,
  context?: NativeServiceMessageContext | null,
): { ok: true; payload: Share } | { ok: false; error: string } {
  const original = generalActionSchema.safeParse(initial)
  if (!original.success || original.data.action !== "service_message_share")
    return { ok: false, error: "Open the exact saved message proposal again." }
  if (edits.alreadyShared !== true)
    return {
      ok: false,
      error: "Record a message only after you have shared it yourself.",
    }
  const fresh = nativeServiceMessageContextSchema.safeParse(context)
  if (!fresh.success || fresh.data.job.id !== original.data.jobId)
    return { ok: false, error: "Check the current Job and recipient again." }
  if (edits.acknowledgedContext !== nativeServiceMessageContextKey(fresh.data))
    return {
      ok: false,
      error:
        "The Job or recipient changed. Check it and acknowledge this exact message again.",
    }
  if (edits.channel !== "manual" && !fresh.data.recipient.phone?.trim())
    return {
      ok: false,
      error: "This Order has no phone for that reported sharing method.",
    }
  const reason = edits.reason.trim()
  const parsed = generalActionSchema.safeParse({
    action: original.data.action,
    jobId: original.data.jobId,
    channel: edits.channel,
    message: edits.message,
    ...(reason ? { reason } : {}),
    alreadyShared: true,
  })
  return parsed.success && parsed.data.action === "service_message_share"
    ? { ok: true, payload: parsed.data }
    : {
        ok: false,
        error: !parsed.success
          ? (parsed.error.issues[0]?.message ??
            "Check the exact message fields.")
          : "Open the exact saved message proposal again.",
      }
}
