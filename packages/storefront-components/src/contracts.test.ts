import { expect, test } from "bun:test"
import {
  assertComponentInputForManifest,
  componentManifestSchema,
} from "./contracts"
import { input, manifest } from "./fixtures.test-support"

test("public projection is deeply immutable and contains only declared data/actions", () => {
  const value = input({
    availableActions: [
      { type: "openConversation" },
      { type: "openItem", itemId: "item" },
    ],
  })
  expect(value.actions).toEqual([{ type: "openConversation" }])
  expect(value.data.catalog).toBeUndefined()
  expect(Object.isFrozen(value.data.business)).toBe(true)
  expect(Object.isFrozen(value.actions[0])).toBe(true)
  expect(() =>
    assertComponentInputForManifest(
      value,
      componentManifestSchema.parse(manifest),
    ),
  ).not.toThrow()
  expect(() =>
    assertComponentInputForManifest(
      { ...value },
      componentManifestSchema.parse(manifest),
    ),
  ).toThrow("COMPONENT_TRUSTED_INPUT_REQUIRED")
  expect(() => input({ data: { credentials: "private" } })).toThrow()
  expect(() =>
    input({ settings: { heading: "valid", privateKey: "private" } }),
  ).toThrow()
})

test("settings, nested public payloads and approved asset declarations are bounded", () => {
  expect(() => input({ settings: { heading: "x".repeat(121) } })).toThrow()
  expect(() =>
    input({
      data: {
        business: { name: "x".repeat(4001), slug: "local", description: null },
      },
    }),
  ).toThrow()
  expect(() =>
    input({ manifest: { ...manifest, assetRefs: ["cover"] } }),
  ).toThrow("COMPONENT_UNAPPROVED_ASSET")
  const value = input({
    manifest: { ...manifest, assetRefs: ["cover"] },
    approvedAssets: new Map([
      [
        "cover",
        {
          id: "cover",
          url: "https://approved.invalid/image.jpg",
          alt: "Cover",
        },
      ],
    ]),
  })
  expect(value.data.assets.cover?.url).toBe(
    "https://approved.invalid/image.jpg",
  )
  expect(Object.isFrozen(value.data.assets.cover)).toBe(true)
  const item = {
    id: "item",
    name: "Item",
    kind: "PRODUCT",
    description: null,
    category: null,
    illustrationId: "box",
    currencyCode: "NGN",
    priceMinor: null,
    isFromPrice: false,
    availability: null,
    options: [
      {
        id: "option",
        name: "Option",
        priceMinor: null,
        currencyCode: "NGN",
        availability: null,
      },
    ],
  }
  const withCatalog = input({
    manifest: {
      ...manifest,
      section: { ...manifest.section, resources: ["publicCatalog"] },
    },
    data: { catalog: [item] },
  })
  expect(Object.isFrozen(withCatalog.data.catalog)).toBe(true)
  expect(Object.isFrozen(withCatalog.data.catalog?.[0]?.options)).toBe(true)
  expect(() =>
    input({
      data: {
        catalog: [{ ...item, options: Array(21).fill(item.options[0]) }],
      },
    }),
  ).toThrow()
})
