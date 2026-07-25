import { describe, expect, test } from "bun:test"
import { customerCreateSchema, customerListPageSchema } from "./customers"

describe("customer schemas", () => {
  test("accepts standalone customer details", () => {
    expect(
      customerCreateSchema.parse({
        email: "customer@example.com",
        name: "Customer Name",
        phone: "+234 800 000 0000",
      }),
    ).toEqual({
      email: "customer@example.com",
      name: "Customer Name",
      phone: "+234 800 000 0000",
    })
  })

  test("accepts infinite-query pagination direction", () => {
    expect(
      customerListPageSchema.parse({
        direction: "forward",
        limit: 20,
      }),
    ).toMatchObject({ direction: "forward", limit: 20 })
  })
})
