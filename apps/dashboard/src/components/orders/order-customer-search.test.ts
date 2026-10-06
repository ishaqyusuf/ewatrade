import { describe, expect, test } from "bun:test"
import {
  customerDraftFromSearch,
  orderCustomerContacts,
} from "./order-customer-search"

describe("inline customer creation from search", () => {
  test("numeric phone searches preserve leading zeroes and leave name empty", () => {
    expect(customerDraftFromSearch(" 08000000906 ")).toEqual({
      name: "",
      phone: "08000000906",
    })
    expect(customerDraftFromSearch("+234 (800) 000-0906")).toEqual({
      name: "",
      phone: "+234 (800) 000-0906",
    })
  })
  test("name searches prefill name, including names containing numbers", () => {
    expect(customerDraftFromSearch("  QA Ada  ")).toEqual({
      name: "QA Ada",
      phone: "",
    })
    expect(customerDraftFromSearch("Shop 42")).toEqual({
      name: "Shop 42",
      phone: "",
    })
    expect(customerDraftFromSearch("")).toEqual({ name: "", phone: "" })
  })
  test("Store history deduplicates contacts and never invents directory IDs", () => {
    const contact = {
      customerName: " Ada ",
      customerPhone: "08000000906",
      customerEmail: null,
    }
    const rows = orderCustomerContacts([
      contact,
      { ...contact, customerName: "ada" },
      { customerName: null, customerPhone: null, customerEmail: null },
      { ...contact, customerPhone: "08000000907" },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ name: "Ada", phone: "08000000906", email: null })
    expect(rows[0]?.id).toBeUndefined()
  })
})
