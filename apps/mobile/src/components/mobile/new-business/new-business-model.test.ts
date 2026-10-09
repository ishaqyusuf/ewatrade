import { expect, test } from "bun:test"
import { businessCreateInput, newBusinessDraft } from "./new-business-model"
test("business creation sends selected country and a normalized international phone", () => {
  const draft = {
    ...newBusinessDraft(),
    countryCode: "GH",
    phone: "024 123 4567",
    businessName: "Store",
    businessProfileKey: "general-retail-groceries",
  }
  const input = businessCreateInput(draft)
  expect(input.countryCode).toBe("GH")
  expect(input.supportPhone).toBe("+233241234567")
  expect(
    businessCreateInput({ ...draft, phone: "+2348031234567" }).supportPhone,
  ).toBe("+2348031234567")
})
