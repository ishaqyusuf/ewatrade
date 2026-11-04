import { expect, test } from "bun:test"
import type { CommerceCustomer } from "../commerce/commerce-model"
import {
  contactDisplayName,
  contactPhoneOptions,
  findCustomerByPhone,
  formatContactPhone,
  normalizeContactPhone,
  phoneSearchDigits,
} from "./sale-contact-pick"

function customer(
  id: string,
  phone: string | null,
  directoryId?: string,
): CommerceCustomer {
  return {
    currencyTotals: [],
    directoryId,
    email: null,
    id,
    initials: "C",
    name: id,
    orders: [],
    pendingOrders: [],
    phone,
  }
}

test("local and international contact numbers read in the business country", () => {
  expect(normalizeContactPhone("0803 555 0142", "NG")).toBe("+2348035550142")
  expect(normalizeContactPhone("+234 803-555-0142", "NG")).toBe(
    "+2348035550142",
  )
  expect(normalizeContactPhone("234 803 555 0142", "NG")).toBe("+2348035550142")
  expect(normalizeContactPhone("024 412 3456", "GH")).toBe("+233244123456")
  expect(normalizeContactPhone("+44 20 7946 0958", "NG")).toBe("+442079460958")
  expect(normalizeContactPhone("  ", "NG")).toBe("")
  expect(normalizeContactPhone(undefined, "NG")).toBe("")
})

test("contact numbers are distinct, primary first, with readable labels", () => {
  const options = contactPhoneOptions(
    {
      name: "Bayo Adeyemi",
      phoneNumbers: [
        { label: "work", number: "0700 225 5000" },
        {
          label: "_$!<Mobile>!$_",
          number: "+234 812 004 7781",
          isPrimary: true,
        },
        { label: "mobile", number: "08120047781" },
        { label: null, number: "0809 991 2210" },
        { label: "fax", number: "" },
      ],
    },
    "NG",
  )
  expect(options).toEqual([
    { label: "Mobile", phone: "+2348120047781" },
    { label: "Work", phone: "+2347002255000" },
    { label: "Phone", phone: "+2348099912210" },
  ])
  expect(contactPhoneOptions({ name: "Dupe's Kitchen" }, "NG")).toEqual([])
})

test("a contact name falls back to its parts, then the company", () => {
  expect(contactDisplayName({ name: " Amaka Obi " })).toBe("Amaka Obi")
  expect(contactDisplayName({ firstName: "Amaka", lastName: "Obi" })).toBe(
    "Amaka Obi",
  )
  expect(contactDisplayName({ company: "Dupe's Kitchen" })).toBe(
    "Dupe's Kitchen",
  )
  expect(contactDisplayName({})).toBe("")
})

test("a picked number finds the saved customer however it was stored", () => {
  const customers = [
    customer("contact:phone:08035550142", "08035550142"),
    customer("cust-1", "0803 555 0142", "cust-1"),
    customer("cust-2", "+2347061183302", "cust-2"),
  ]
  expect(findCustomerByPhone(customers, "+2348035550142", "NG")?.id).toBe(
    "cust-1",
  )
  expect(findCustomerByPhone(customers, "+2347061183302", "NG")?.id).toBe(
    "cust-2",
  )
  expect(findCustomerByPhone(customers, "+2349053004410", "NG")).toBeUndefined()
  expect(findCustomerByPhone(customers, "", "NG")).toBeUndefined()
})

test("a previous-sale contact matches when no saved customer has the number", () => {
  const customers = [customer("contact:phone:+2348035550142", "+2348035550142")]
  expect(findCustomerByPhone(customers, "+2348035550142", "NG")?.id).toBe(
    "contact:phone:+2348035550142",
  )
})

test("server lookups search by the national digits", () => {
  expect(phoneSearchDigits("+2348035550142")).toBe("8035550142")
  expect(phoneSearchDigits("")).toBe("")
})

test("a number shows grouped with its country code", () => {
  expect(formatContactPhone("+2348035550142")).toBe("+234 803 555 0142")
  expect(formatContactPhone("not a number")).toBe("not a number")
})
