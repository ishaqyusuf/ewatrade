import { describe, expect, test } from "bun:test"
import {
  CREATE_CUSTOMER_SHEET_SNAP_POINTS,
  CUSTOMER_SHEET_PRESENT_DELAY_MS,
  getCreateCustomerSheetMaxHeight,
  hasCreateCustomerDraft,
  isCreateCustomerSaveDisabled,
} from "./create-sale-customer-sheet-model"

describe("create customer sheet presentation", () => {
  test("caps the compact sheet at 44% of the viewport", () => {
    expect(getCreateCustomerSheetMaxHeight(740)).toBe(326)
    expect(getCreateCustomerSheetMaxHeight(844)).toBe(371)
    expect(CREATE_CUSTOMER_SHEET_SNAP_POINTS).toEqual(["44%", "84%"])
  })

  test("keeps save disabled until the required name is present", () => {
    expect(isCreateCustomerSaveDisabled({ disabled: false, name: "" })).toBe(
      true,
    )
    expect(isCreateCustomerSaveDisabled({ disabled: false, name: "   " })).toBe(
      true,
    )
    expect(
      isCreateCustomerSaveDisabled({ disabled: false, name: "Amina Bello" }),
    ).toBe(false)
    expect(
      isCreateCustomerSaveDisabled({ disabled: true, name: "Amina Bello" }),
    ).toBe(true)
  })

  test("defers presentation long enough to avoid trigger touch-through", () => {
    expect(CUSTOMER_SHEET_PRESENT_DELAY_MS).toBe(120)
  })

  test("protects a dirty draft from accidental sheet dismissal", () => {
    expect(hasCreateCustomerDraft({ email: "", name: "", phone: "" })).toBe(
      false,
    )
    expect(
      hasCreateCustomerDraft({ email: "", name: "  Amina  ", phone: "" }),
    ).toBe(true)
    expect(
      hasCreateCustomerDraft({
        email: "amina@example.com",
        name: "",
        phone: "",
      }),
    ).toBe(true)
  })
})
