import { expect, test } from "bun:test"
import { parseLocalQaPhotoManifest } from "./local-qa-storefront-photos"

const local = {
  NODE_ENV: "development",
  APP_ENV: "local",
  DEV_PROFILE: "local",
  EWATRADE_ENV_MODE: "local",
  NEXT_PUBLIC_PLATFORM_DOMAIN: "localhost",
}
const host = "qa-shop.ewatrade-storefront.localhost"
const fixture = { slug: "qa-shop", photos: { "item-1": "sandals.webp" } }

test("downloaded photo fixtures require every local runtime marker and the exact registered host", () => {
  expect(parseLocalQaPhotoManifest(fixture, host, local)).toEqual(fixture)
  for (const key of [
    "NODE_ENV",
    "APP_ENV",
    "DEV_PROFILE",
    "EWATRADE_ENV_MODE",
  ]) {
    expect(
      parseLocalQaPhotoManifest(fixture, host, {
        ...local,
        [key]: "production",
      }),
    ).toBeNull()
  }
  expect(
    parseLocalQaPhotoManifest(fixture, "qa-shop.ewatrade.com", local),
  ).toBeNull()
  expect(
    parseLocalQaPhotoManifest(
      fixture,
      "other-shop.ewatrade-storefront.localhost",
      local,
    ),
  ).toBeNull()
})

test("photo fixtures reject traversal, remote URLs and unbounded inventory", () => {
  for (const file of [
    "../secret.webp",
    "https://example.test/image.webp",
    "original.jpg",
  ]) {
    expect(
      parseLocalQaPhotoManifest(
        { ...fixture, photos: { "item-1": file } },
        host,
        local,
      ),
    ).toBeNull()
  }
  expect(
    parseLocalQaPhotoManifest(
      {
        ...fixture,
        photos: Object.fromEntries(
          Array.from({ length: 9 }, (_, i) => [`item-${i}`, "sandals.webp"]),
        ),
      },
      host,
      local,
    ),
  ).toBeNull()
})
