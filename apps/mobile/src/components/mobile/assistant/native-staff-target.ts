import {
  staffAccessTargetSchema,
  staffInvitationTargetSchema,
  staffStatusTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import { z } from "zod"

export const nativeStaffOriginalTarget = z.discriminatedUnion("kind", [
  staffStatusTargetSchema,
  staffAccessTargetSchema,
  staffInvitationTargetSchema,
])
export type NativeStaffOriginalTarget = z.infer<
  typeof nativeStaffOriginalTarget
>
export function readNativeStaffOriginalTarget(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 1024) return null
  try {
    const parsed = nativeStaffOriginalTarget.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
export function nativeStaffOriginalRoute(target: unknown) {
  const parsed = nativeStaffOriginalTarget.safeParse(target)
  return parsed.success
    ? {
        pathname: "/staff-invite-modal" as const,
        params: { target: JSON.stringify(parsed.data) },
      }
    : null
}
