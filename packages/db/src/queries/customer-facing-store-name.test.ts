import { describe, expect, test } from "bun:test"

import { customerFacingStoreName } from "./customer-facing-store-name"

const tenant = (name: string, stores: number) => ({
  name,
  _count: { stores },
})

describe("customer-facing Store name", () => {
  test("shows the business name for a one-Store business", () => {
    expect(
      customerFacingStoreName({
        name: "Main store",
        tenant: tenant("Heritage Wash & Care", 1),
      }),
    ).toBe("Heritage Wash & Care")
  })

  test("adds the Store name when the business has several Stores", () => {
    expect(
      customerFacingStoreName({
        name: "Ikeja",
        tenant: tenant("Heritage Wash & Care", 2),
      }),
    ).toBe("Heritage Wash & Care · Ikeja")
  })

  test("does not repeat a Store named like the business", () => {
    expect(
      customerFacingStoreName({
        name: "heritage wash & care",
        tenant: tenant("Heritage Wash & Care", 3),
      }),
    ).toBe("Heritage Wash & Care")
  })

  test("falls back to the Store name without business details", () => {
    expect(customerFacingStoreName({ name: "Ada Store" })).toBe("Ada Store")
  })
})
