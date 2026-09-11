import { describe, expect, test } from "bun:test"
import { getStaffDirectoryPresentation } from "./staff-directory-presentation-model"

const settledEmptyDirectory = {
  hasError: false,
  isAtStaffLimit: false,
  isLoading: false,
  isOffline: false,
  staffCount: 0,
}

describe("staff directory presentation", () => {
  test("gives the settled empty directory one labelled first-attendant action", () => {
    expect(getStaffDirectoryPresentation(settledEmptyDirectory)).toEqual({
      showInitialInviteAction: true,
      showStandardInviteFab: false,
    })
  })

  test("restores the standard list action once Staff records exist", () => {
    expect(
      getStaffDirectoryPresentation({
        ...settledEmptyDirectory,
        staffCount: 1,
      }),
    ).toEqual({
      showInitialInviteAction: false,
      showStandardInviteFab: true,
    })
  })

  test("does not present the first-attendant gate when membership is unavailable", () => {
    for (const unavailableState of [
      { isLoading: true },
      { hasError: true },
      { isOffline: true },
      { isAtStaffLimit: true },
    ]) {
      expect(
        getStaffDirectoryPresentation({
          ...settledEmptyDirectory,
          ...unavailableState,
        }),
      ).toEqual({
        showInitialInviteAction: false,
        showStandardInviteFab: true,
      })
    }
  })
})
