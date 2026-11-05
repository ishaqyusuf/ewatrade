import { describe, expect, test } from "bun:test"
import { ownerTypePickPresentation } from "./owner-type-pick"

describe("business type pick presentation", () => {
  test("a single listed type confirms in the sheet", () => {
    expect(
      ownerTypePickPresentation({ multi: false, selected: ["salon"] }),
    ).toEqual({ otherOnPage: false, sheet: true, continueInFooter: false })
  })

  test("Other never opens the sheet: its field and Continue stay on the page", () => {
    expect(
      ownerTypePickPresentation({ multi: false, selected: ["other"] }),
    ).toEqual({ otherOnPage: true, sheet: false, continueInFooter: true })
  })

  test("several types continue from the footer, Other included", () => {
    expect(
      ownerTypePickPresentation({ multi: true, selected: ["salon", "other"] }),
    ).toEqual({ otherOnPage: false, sheet: false, continueInFooter: true })
  })

  test("nothing picked shows neither", () => {
    expect(ownerTypePickPresentation({ multi: false, selected: [] })).toEqual({
      otherOnPage: false,
      sheet: false,
      continueInFooter: false,
    })
  })
})
