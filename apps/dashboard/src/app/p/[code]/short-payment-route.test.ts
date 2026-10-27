import { afterAll, beforeAll, expect, mock, test } from "bun:test"

mock.module("server-only", () => ({}))

const env = { ...process.env }
beforeAll(() => {
  process.env.PAYMENT_LINK_PUBLIC_ORIGIN = "https://app.ewatrade.test"
  // No API origin: the projection read returns null without any request.
  process.env.API_URL = ""
  process.env.NEXT_PUBLIC_API_URL = ""
})
afterAll(() => {
  process.env = env
})

const code = "AbCdEfGhIjKlMnOpQr_-12"

async function images(route: "short" | "signed", value: string) {
  const { generateMetadata } =
    route === "short"
      ? await import("./page")
      : await import("../../pay/[token]/page")
  const params = Promise.resolve(
    route === "short" ? { code: value } : { token: value },
  )
  // biome-ignore lint/suspicious/noExplicitAny: both routes share the metadata shape
  const metadata = await generateMetadata({ params } as any)
  return {
    og: metadata.openGraph?.images,
    twitter: metadata.twitter?.images,
    title: metadata.title,
  }
}

test("a short code declares its own short versioned image", async () => {
  const url = `https://app.ewatrade.test/p/${code}/image?v=amount-ticket-v1`
  const result = await images("short", code)
  expect(result.og).toEqual([
    { url, width: 1200, height: 630, alt: "Payment information · EwaTrade" },
  ])
  expect(result.twitter).toEqual([url])
})

test("a signed token keeps its /pay image path", async () => {
  const result = await images("signed", "v1.signed.token")
  expect(result.twitter).toEqual([
    "https://app.ewatrade.test/pay/v1.signed.token/image?v=amount-ticket-v1",
  ])
})

test("the short image reuses the payment image renderer and privacy headers", async () => {
  const previousDirectory = process.cwd()
  try {
    process.chdir(new URL("../../../..", import.meta.url).pathname)
    const { GET } = await import("./image/route")
    for (const value of [code, "not-a-code"]) {
      const response = await GET(new Request("https://app.ewatrade.test"), {
        params: Promise.resolve({ code: value }),
      })
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("image/png")
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      )
      expect(response.headers.get("referrer-policy")).toBe("no-referrer")
      expect(response.headers.get("x-robots-tag")).toBe(
        "noindex, nofollow, noarchive",
      )
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1_000)
    }
  } finally {
    process.chdir(previousDirectory)
  }
})

test("anything but an exact short code declares no image", async () => {
  for (const value of ["short", `${code}x`, "../pay/v1.signed.token"]) {
    const result = await images("short", value)
    expect(result.og).toEqual([])
    expect(result.twitter).toEqual([])
    expect(result.title).toBe("Payment information · EwaTrade")
  }
})
