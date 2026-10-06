import { expect, test } from "bun:test"
import { assertPerformanceTarget } from "./target.mjs"

const target = {
  endpoint: "ep-performance",
  database: "neondb",
  expiresAt: "2030-01-01T00:00:00Z",
}
const url =
  "postgresql://owner:secret@ep-performance-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
const protectedUrls = ["local", "preview", "prod"].map(
  (name) =>
    `postgresql://owner:private@ep-${name}.us-east-1.aws.neon.tech/neondb?sslmode=require`,
)

test("accepts only the explicitly pinned isolated target", () => {
  expect(assertPerformanceTarget(url, protectedUrls, target)).toBe(url)
  for (const bad of [
    url.replace("ep-performance", "ep-preview"),
    url.replace("/neondb", "/other"),
    url.replace("sslmode=require", "sslmode=disable"),
    `${url}&options=-csearch_path=other`,
    "invalid-secret",
  ]) {
    expect(() => assertPerformanceTarget(bad, protectedUrls, target)).toThrow(
      "Performance target rejected",
    )
  }
})

test("rejects credential-independent aliases, expiry and absent protected profiles", () => {
  expect(() =>
    assertPerformanceTarget(
      url,
      [
        url
          .replace("-pooler", "")
          .replace("owner:secret", "different:credential"),
        ...protectedUrls,
      ],
      target,
    ),
  ).toThrow()
  expect(() =>
    assertPerformanceTarget(url, protectedUrls, target, new Date("2031-01-01")),
  ).toThrow()
  expect(() =>
    assertPerformanceTarget(url, [undefined, ...protectedUrls], target),
  ).toThrow()
  try {
    assertPerformanceTarget("secret-url", protectedUrls, target)
  } catch (error) {
    expect(String(error)).not.toContain("secret-url")
  }
})
