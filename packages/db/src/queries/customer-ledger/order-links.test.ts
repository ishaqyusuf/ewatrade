import { describe, expect, test } from "bun:test"
import { classifyOrderCustomerLink } from "./order-links"

const customer = {
  id: "customer-a",
  normalizedPhone: "+2348030000001",
  normalizedEmail: "ada@example.com",
}
const none = { phones: new Set<string>(), emails: new Set<string>() }

describe("classifyOrderCustomerLink", () => {
  test("suggests exact phone, email or both, ignoring formatting and case", () => {
    expect(
      classifyOrderCustomerLink(
        customer,
        { customerPhone: "+234 803 000 0001", customerEmail: null },
        none,
      ),
    ).toEqual({ eligible: true, matchedBy: "PHONE" })
    expect(
      classifyOrderCustomerLink(
        customer,
        { customerPhone: null, customerEmail: " Ada@Example.com " },
        none,
      ),
    ).toEqual({ eligible: true, matchedBy: "EMAIL" })
    expect(
      classifyOrderCustomerLink(
        customer,
        {
          customerPhone: "+2348030000001",
          customerEmail: "ada@example.com",
        },
        none,
      ),
    ).toEqual({ eligible: true, matchedBy: "PHONE_AND_EMAIL" })
  })

  test("never matches by name or by a missing contact", () => {
    expect(
      classifyOrderCustomerLink(
        customer,
        { customerPhone: null, customerEmail: null },
        none,
      ),
    ).toEqual({ eligible: false, reason: "NO_MATCH" })
    expect(
      classifyOrderCustomerLink(
        { ...customer, normalizedPhone: null, normalizedEmail: null },
        { customerPhone: "+2348030000001", customerEmail: null },
        none,
      ),
    ).toEqual({ eligible: false, reason: "NO_MATCH" })
  })

  test("rejects an Order whose other contact contradicts this customer", () => {
    expect(
      classifyOrderCustomerLink(
        customer,
        {
          customerPhone: "+2348030000001",
          customerEmail: "someone.else@example.com",
        },
        none,
      ),
    ).toEqual({ eligible: false, reason: "CONTACT_CONFLICT" })
  })

  test("rejects an Order whose other contact belongs to another saved customer", () => {
    const phoneOnly = { ...customer, normalizedEmail: null }
    expect(
      classifyOrderCustomerLink(
        phoneOnly,
        {
          customerPhone: "+2348030000001",
          customerEmail: "bola@example.com",
        },
        { phones: new Set(), emails: new Set(["bola@example.com"]) },
      ),
    ).toEqual({ eligible: false, reason: "CONTACT_CONFLICT" })
    // An unknown extra email is not a conflict when the customer has none.
    expect(
      classifyOrderCustomerLink(
        phoneOnly,
        {
          customerPhone: "+2348030000001",
          customerEmail: "new@example.com",
        },
        none,
      ),
    ).toEqual({ eligible: true, matchedBy: "PHONE" })
  })
})
