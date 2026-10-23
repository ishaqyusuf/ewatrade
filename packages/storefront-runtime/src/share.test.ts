import { expect, test } from "bun:test"
import { shareStorefrontLink } from "./share"
const request = {
  title: "QA shop",
  url: "https://test.ewatrade-storefront.localhost/",
}
test("native share cancellation never copies without a user's intent", async () => {
  let copies = 0
  expect(
    await shareStorefrontLink(request, {
      share: async () => {
        throw new DOMException("Cancelled", "AbortError")
      },
      copy: async () => {
        copies++
      },
    }),
  ).toBe("cancelled")
  expect(copies).toBe(0)
})
test("native share failure falls back to the exact canonical address", async () => {
  let copied = ""
  expect(
    await shareStorefrontLink(request, {
      share: async () => {
        throw new Error("Unavailable")
      },
      copy: async (url) => {
        copied = url
      },
    }),
  ).toBe("copied")
  expect(copied).toBe(request.url)
})
test("clipboard denial returns an honest unavailable result", async () => {
  expect(
    await shareStorefrontLink(request, {
      copy: async () => {
        throw new Error("Denied")
      },
    }),
  ).toBe("unavailable")
  expect(await shareStorefrontLink(request, {})).toBe("unavailable")
})
