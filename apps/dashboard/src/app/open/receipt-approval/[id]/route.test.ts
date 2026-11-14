import { expect, test } from "bun:test"
import { GET } from "./route"

const open = (id: string) =>
  GET(new Request("https://dash.ewatrade.com/open/receipt-approval/x"), {
    params: Promise.resolve({ id }),
  })

test("web fallback opens the approval page on the same origin", async () => {
  const response = await open("cmh0abc_12-x")
  expect(response.status).toBe(307)
  expect(response.headers.get("location")).toBe(
    "https://dash.ewatrade.com/receipt-approval/cmh0abc_12-x",
  )
})

test("an odd or oversized id falls back to the overview", async () => {
  for (const id of ["../secret", "a b", "x".repeat(129), ""])
    expect((await open(id)).headers.get("location")).toBe(
      "https://dash.ewatrade.com/",
    )
})
