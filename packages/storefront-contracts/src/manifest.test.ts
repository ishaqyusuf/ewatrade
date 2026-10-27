import { expect, test } from "bun:test"
import {
  type EditableField,
  defaultSettings,
  defineTemplate,
  validateComposition,
} from "./manifest"

const pinned: EditableField = {
  key: "pinned",
  label: "Pinned products",
  kind: "catalog-items",
  maxItems: 3,
  itemKind: "PRODUCT",
  default: [],
}
const manifest = (fields: EditableField[]) =>
  defineTemplate({
    schemaVersion: 1,
    runtimeVersion: 1,
    key: "pin-test",
    version: "1.0.0",
    name: "Pin test",
    description: "Contract fixture.",
    businessTypes: ["retail"],
    pages: [
      { key: "home", path: "/", label: "Home", allowedSections: ["shelf"] },
    ],
    sections: [
      {
        key: "shelf",
        version: 1,
        label: "Shelf",
        fields,
        allowedBlocks: [],
        resources: ["publicCatalog"],
        capabilities: ["catalog"],
      },
    ],
    blocks: [],
  })
const composition = (settings: Record<string, unknown>) => ({
  schemaVersion: 1,
  template: { key: "pin-test", version: "1.0.0" },
  theme: {},
  pages: [
    {
      key: "home",
      sections: [
        {
          id: "shelf-1",
          type: "shelf",
          version: 1,
          visible: true,
          settings,
          blocks: [],
        },
      ],
    },
  ],
})

test("catalog-items stores only bounded, unique item IDs", () => {
  const withPins = manifest([pinned])
  expect(defaultSettings(withPins.sections[0]?.fields ?? [])).toEqual({
    pinned: [],
  })
  expect(
    validateComposition(composition({ pinned: ["item_a", "item-b"] }), withPins)
      .pages[0]?.sections[0]?.settings.pinned,
  ).toEqual(["item_a", "item-b"])
  for (const value of [
    ["a", "b", "c", "d"], // over this field's max
    ["a", "a"], // duplicate
    ["bad id"], // pattern
    ["x".repeat(129)], // length
    ["<script>"],
    "item_a", // not a list
    null,
    [{ id: "a", priceMinor: 100 }], // never copied facts
  ])
    expect(() =>
      validateComposition(composition({ pinned: value }), withPins),
    ).toThrow()
  expect(() => validateComposition(composition({}), withPins)).toThrow(
    "Invalid value for pinned",
  )
})

test("manifests bound catalog-items fields and older contracts refuse them", () => {
  for (const field of [
    { ...pinned, maxItems: 9 },
    { ...pinned, maxItems: 0 },
    { ...pinned, default: ["item_a"] },
    { ...pinned, itemKind: "BUNDLE" },
  ])
    expect(() => manifest([field as EditableField])).toThrow()
  const before = manifest([])
  expect(validateComposition(composition({}), before).template.key).toBe(
    "pin-test",
  )
  expect(() =>
    validateComposition(composition({ pinned: [] }), before),
  ).toThrow("Unknown editable field pinned")
})
