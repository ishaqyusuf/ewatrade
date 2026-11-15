import { describe, expect, test } from "bun:test"
import { setupIntroKind, setupIntroMessages } from "./setup-intro-messages"

describe("setup intro", () => {
  test("reads only goods or services from the route", () => {
    expect(setupIntroKind("product")).toBe("product")
    expect(setupIntroKind("service")).toBe("service")
    expect(setupIntroKind("customer")).toBeNull()
    expect(setupIntroKind(["product"])).toBeNull()
  })

  test("greets by first name, then asks for the kind with priced examples", () => {
    const product = setupIntroMessages("product", {
      currencyCode: "NGN",
      name: "Ada Obi",
    })
    expect(product).toHaveLength(3)
    expect(product[0]).toBe("Hi Ada, how is your day going?")
    expect(product[1]).toContain("product")
    expect(product[2]).toContain("₦4,500 per crate")

    const service = setupIntroMessages("service", { currencyCode: "NGN" })
    expect(service[0]).toBe("Hi, how is your day going?")
    expect(service[1]).toContain("service")
    expect(service[2]).toContain("quote each job")
  })
})
