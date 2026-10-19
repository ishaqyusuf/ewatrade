import {
  staffDirectoryTargetSchema,
  staffHistoryTargetSchema,
  staffMemberTargetSchema,
} from "@ewatrade/assistant/general/contracts"
import { z } from "zod"

/** Exact read navigation only; protected readers retain authority and cursor checks. */
export const nativeStaffReadTarget = z.discriminatedUnion("kind", [
  staffDirectoryTargetSchema,
  staffHistoryTargetSchema,
  staffMemberTargetSchema,
])
export type NativeStaffReadTarget = z.infer<typeof nativeStaffReadTarget>

export function readNativeStaffReadTarget(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 8192) return null
  try {
    const parsed = nativeStaffReadTarget.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function nativeStaffReadRoute(target: unknown) {
  const parsed = nativeStaffReadTarget.safeParse(target)
  return parsed.success
    ? {
        pathname: "/staff-invite-modal" as const,
        params: { target: JSON.stringify(parsed.data) },
      }
    : null
}
