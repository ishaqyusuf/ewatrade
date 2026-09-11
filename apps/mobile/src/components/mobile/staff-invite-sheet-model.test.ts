import { describe, expect, test } from "bun:test"
import {
  STAFF_INVITE_SHEET_PRESENT_DELAY_MS,
  STAFF_INVITE_SHEET_SNAP_POINTS,
  getStaffInviteSheetMaxHeight,
  hasStaffInviteDraft,
} from "./staff-invite-sheet-model"

describe("staff invite sheet presentation", () => {
  test("keeps a compact resting state and a larger keyboard state", () => {
    expect(getStaffInviteSheetMaxHeight(740)).toBe(326)
    expect(getStaffInviteSheetMaxHeight(844)).toBe(371)
    expect(STAFF_INVITE_SHEET_SNAP_POINTS).toEqual(["44%", "84%"])
  })

  test("defers presentation long enough to avoid trigger touch-through", () => {
    expect(STAFF_INVITE_SHEET_PRESENT_DELAY_MS).toBe(120)
  })

  test("protects either staff draft field from accidental dismissal", () => {
    expect(hasStaffInviteDraft({ email: "", name: "" })).toBe(false)
    expect(hasStaffInviteDraft({ email: "staff@example.com", name: "" })).toBe(
      true,
    )
    expect(hasStaffInviteDraft({ email: "", name: "  Amina  " })).toBe(true)
  })
})
