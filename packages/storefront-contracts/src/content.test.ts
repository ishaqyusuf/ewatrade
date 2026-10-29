import { expect, test } from "bun:test"
import {
  buildSectionLibrary,
  canvasManifest,
  insertSectionExcerpt,
} from "../../storefront-templates/src/canvas/library"
import {
  createStorefrontContentBrief,
  getStorefrontContentProfile,
  storefrontContentFields,
} from "../../storefront-templates/src/content-profiles"
import {
  defaultComposition,
  getTemplateManifest,
  listSelectableTemplates,
} from "../../storefront-templates/src/registry"
import {
  applyStorefrontContent,
  storefrontContentFieldState,
  validateStorefrontContentOutput,
} from "./content"

const composition = () => defaultComposition(canvasManifest("catalog-v4"))
const context = {
  name: "Example workshop",
  description: "Handmade baskets and repairs.",
  location: "Ibadan",
  offerings: "Baskets, repairs",
}
function fixture() {
  const base = composition()
  const field = storefrontContentFields(base, "home")[0]
  if (!field) throw new Error("Expected an editable content area.")
  const brief = createStorefrontContentBrief({
    composition: base,
    pageKey: "home",
    fieldIds: [field.id],
    context,
    contextOrigin: "business",
    baseRevision: 3,
    instructions: "Use a warmer tone.",
  })
  return { base, field, brief }
}
test("content validation requires exact selected fields, safe text and known references", () => {
  const { field, brief } = fixture()
  const output = {
    version: 1,
    fields: [
      {
        id: field.id,
        text: "Explore our workshop",
        sourceReferences: ["context.name"],
      },
    ],
  }
  expect(validateStorefrontContentOutput(output, brief).fields[0]?.text).toBe(
    "Explore our workshop",
  )
  expect(() =>
    validateStorefrontContentOutput({ ...output, fields: [] }, brief),
  ).toThrow()
  expect(() =>
    validateStorefrontContentOutput(
      { ...output, fields: [output.fields[0], output.fields[0]] },
      brief,
    ),
  ).toThrow()
  for (const text of [
    "<script>alert(1)</script>",
    "Guaranteed free delivery",
    "Only ₦500",
    "In stock now",
    "x".repeat(field.maxLength + 1),
  ]) {
    expect(() =>
      validateStorefrontContentOutput(
        { ...output, fields: [{ ...output.fields[0], text }] },
        brief,
      ),
    ).toThrow()
  }
  expect(() =>
    validateStorefrontContentOutput(
      {
        ...output,
        fields: [{ ...output.fields[0], sourceReferences: ["private.phone"] }],
      },
      brief,
    ),
  ).toThrow()
})
test("recommended word ranges remain advisory while hard field constraints block apply", () => {
  const { field } = fixture()
  expect(
    storefrontContentFieldState(
      { ...field, minWords: 5, maxWords: 8 },
      "Two words",
    ),
  ).toMatchObject({ valid: true, outsideRange: true, words: 2 })
  expect(storefrontContentFieldState(field, "").valid).toBe(false)
  expect(
    storefrontContentFieldState(field, "x".repeat(field.maxLength + 1)).valid,
  ).toBe(false)
})
test("selected apply is text-only, independent and refuses stale drafts", () => {
  const { base, field } = fixture()
  const drafts = [{ id: field.id, text: "Our workshop collection" }]
  const next = applyStorefrontContent({
    current: base,
    base,
    fields: [field],
    drafts,
  })
  expect(
    next.pages[0]?.sections.find((s) => s.id === field.sectionId)?.settings[
      field.key
    ],
  ).toBe(drafts[0]?.text)
  expect(JSON.stringify(base)).not.toBe(JSON.stringify(next))
  expect(next.template).toEqual(base.template)
  expect(next.theme).toEqual(base.theme)
  expect(() =>
    applyStorefrontContent({ current: next, base, fields: [field], drafts }),
  ).toThrow("draft changed")
  expect(() =>
    applyStorefrontContent({
      current: base,
      base,
      fields: [field],
      drafts: [{ id: "foreign", text: "Other" }],
    }),
  ).toThrow()
})
test("profiles differ by template and each area has a purpose and hard constraint", () => {
  const catalog = getStorefrontContentProfile(
    getTemplateManifest(composition()),
  )
  const editorial = getStorefrontContentProfile(
    getTemplateManifest(defaultComposition(canvasManifest("retail-editorial"))),
  )
  if (!catalog || !editorial) throw new Error("Expected writing profiles.")
  expect(catalog.voice).not.toBe(editorial.voice)
  const description = (profile: NonNullable<typeof catalog>) => {
    const area = profile.areas.find(
      (area) => area.key === "tagline" && area.sectionType.includes("intro"),
    )
    if (!area) throw new Error("Expected an introduction description.")
    return area
  }
  expect(description(catalog).maxWords).not.toBe(
    description(editorial).maxWords,
  )
  for (const area of catalog.areas) {
    expect(area.purpose.length).toBeGreaterThan(20)
    expect(area.maxLength).toBeGreaterThan(0)
  }
  expect(
    catalog.areas
      .filter((area) => area.key.startsWith("quote-"))
      .every((area) => area.generation === "manual"),
  ).toBe(true)
})
test("every selectable template has a profile and copied sections keep source guidance", () => {
  for (const entry of listSelectableTemplates())
    expect(getStorefrontContentProfile(entry.manifest)).not.toBeNull()
  const excerpt = buildSectionLibrary().find(
    (entry) =>
      entry.template.key === "retail-editorial" && entry.kind === "intro",
  )
  if (!excerpt) throw new Error("Expected a portable editorial introduction.")
  const mixed = insertSectionExcerpt(
    composition(),
    "home",
    excerpt,
    "copied-intro",
  )
  const copied = storefrontContentFields(mixed, "home").filter(
    (field) => field.sectionId === "copied-intro",
  )
  expect(copied.length).toBeGreaterThan(0)
  expect(
    copied.every((field) => field.profile.key === "retail-editorial"),
  ).toBe(true)
  const description = copied.find((field) => field.key === "tagline")
  expect(description?.maxWords).toBe(28)
  expect(() =>
    createStorefrontContentBrief({
      composition: mixed,
      pageKey: "home",
      fieldIds: ["unknown"],
      context,
      contextOrigin: "business",
      baseRevision: 3,
      instructions: "",
    }),
  ).toThrow("no longer available")
  const first = copied[0]
  if (!first) throw new Error("Expected a copied area.")
  expect(() =>
    createStorefrontContentBrief({
      composition: mixed,
      pageKey: "home",
      fieldIds: [first.id, first.id],
      context,
      contextOrigin: "business",
      baseRevision: 3,
      instructions: "",
    }),
  ).toThrow("only once")
})
test("commerce action labels, photos and fixed shell copy remain manual", () => {
  const entry = listSelectableTemplates().find(
    (template) => template.manifest.key === "commerce-studio",
  )
  if (!entry) throw new Error("Expected Commerce studio.")
  const fields = storefrontContentFields(
    defaultComposition(entry.manifest),
    "home",
  )
  expect(fields.length).toBeGreaterThan(0)
  expect(fields.some((field) => /(?:-label|-alt)$/.test(field.key))).toBe(false)
  expect(fields.some((field) => /header|footer/.test(field.sectionId))).toBe(
    false,
  )
  expect(fields.find((field) => field.key === "intro")?.maxWords).toBe(32)
})
