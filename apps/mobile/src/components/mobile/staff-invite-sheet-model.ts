export const COMPACT_STAFF_INVITE_SHEET_HEIGHT_RATIO = 0.44
export const STAFF_INVITE_SHEET_SNAP_POINTS = ["44%", "84%"] as const
export const STAFF_INVITE_SHEET_PRESENT_DELAY_MS = 120

export type StaffInviteDraft = {
  email: string
  name: string
}

export function getStaffInviteSheetMaxHeight(viewportHeight: number) {
  return Math.round(viewportHeight * COMPACT_STAFF_INVITE_SHEET_HEIGHT_RATIO)
}

export function hasStaffInviteDraft({ email, name }: StaffInviteDraft) {
  return [email, name].some((value) => value.trim().length > 0)
}
