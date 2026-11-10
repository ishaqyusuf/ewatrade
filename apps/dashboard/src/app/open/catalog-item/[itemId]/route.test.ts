import { expect, test } from "bun:test"
import { GET } from "./route"

const open = (id: string) =>
  GET(new Request("https://dash.ewatrade.com/open/catalog-item/x"), {
    params: Promise.resolve({ itemId: id }),
  })

test("web fallback opens the exact saved Product on the same origin", async () => {
  const response = await open("item/one?x=1")
  expect(response.status).toBe(307)
  const target = new URL(response.headers.get("location") ?? "")
  expect(target.origin).toBe("https://dash.ewatrade.com")
  expect(target.pathname).toBe("/sales")
  expect([...target.searchParams]).toEqual([["catalogDetail", "item/one?x=1"]])
})

test("an oversized identity falls back to the Catalog without a record", async () => {
  const target = new URL(
    (await open("x".repeat(129))).headers.get("location") ?? "",
  )
  expect(target.search).toBe("")
})
