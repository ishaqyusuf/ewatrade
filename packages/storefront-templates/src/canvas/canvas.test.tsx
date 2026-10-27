import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  assertCompositionSources,
  validateComposition,
} from "../../../storefront-contracts/src/manifest"
import { loadStorefront } from "../../../storefront-runtime/src/server"
import { catalogV4Manifest } from "../catalog-v4/manifest"
import { fixture } from "../fixtures"
import { defaultComposition, templateRegistry } from "../registry"
import {
  buildSectionLibrary,
  canvasDefaults,
  canvasPage,
  canvasSection,
  insertSectionExcerpt,
  upgradeCanvasDraft,
} from "./library"
import { canvasManifests } from "./manifests"
import { CanvasStorefront } from "./render"

function required<T>(value: T | undefined): T {
  if (!value) throw new Error("Missing test fixture")
  return value
}
const manifest = required(canvasManifests[0])
const faq = required(
  buildSectionLibrary().find(
    (entry) =>
      entry.kind === "faq" && entry.template.key === "retail-editorial",
  ),
)

test("library derives every portable blueprint with exact source names, excluding fixed shell", () => {
  const library = buildSectionLibrary()
  // 31 canvas/hall blueprints + 8 Commerce studio library sections (header/footer fixed).
  expect(library).toHaveLength(39)
  expect(library.filter((entry) => entry.kind === "faq")).toHaveLength(5)
  for (const entry of library) {
    expect(entry.title).toBe(
      `${entry.definition.label} • ${entry.template.name}`,
    )
    expect(entry.definition.source?.templateKey).toBe(entry.template.key)
    expect(
      entry.definition.fixedFirst || entry.definition.fixedLast,
    ).toBeFalsy()
  }
  for (const template of canvasManifests)
    expect(canvasDefaults(template).pages.map((page) => page.key)).toEqual([
      "home",
      "about",
    ])
})

test("legacy draft upgrade preserves copy and brand without mutating the saved exact pin", () => {
  const old = defaultComposition(catalogV4Manifest)
  const header = required(old.pages[0]?.sections[0])
  header.settings.tagline = "Existing merchant copy"
  old.theme.accent = "#123456"
  const before = JSON.stringify(old)
  const upgraded = upgradeCanvasDraft(old)
  expect(upgraded.template.version).toBe("2.0.0")
  expect(canvasPage(upgraded, "home").sections[1]?.settings.tagline).toBe(
    "Existing merchant copy",
  )
  expect(upgraded.theme.accent).toBe("#123456")
  expect(JSON.stringify(old)).toBe(before)
  expect(upgradeCanvasDraft(upgraded)).toBe(upgraded)
})

test("repeated excerpts are independent, source pinned, page scoped and inserted before fixed footer", () => {
  const initial = canvasDefaults(manifest)
  const next = insertSectionExcerpt(
    insertSectionExcerpt(initial, "home", faq, "first-faq"),
    "home",
    faq,
    "second-faq",
  )
  canvasSection(next, "home", "first-faq").settings.heading =
    "Independent heading"
  expect(canvasSection(next, "home", "second-faq").settings.heading).toBe(
    "Asked often",
  )
  expect(canvasPage(next, "about")).toEqual(canvasPage(initial, "about"))
  expect(canvasPage(next, "home").sections.at(-1)?.type).toBe("studio-footer")
  expect(canvasSection(next, "home", "first-faq").source).toEqual(
    faq.definition.source,
  )
  expect(canvasPage(initial, "home").sections).toHaveLength(5)
  expect(() => insertSectionExcerpt(next, "home", faq, "first-faq")).toThrow()
  const moved = structuredClone(next)
  const home = canvasPage(moved, "home")
  const footer = home.sections.pop()
  if (footer) home.sections.unshift(footer)
  expect(() => validateComposition(moved, manifest)).toThrow()
  const hidden = structuredClone(next)
  required(canvasPage(hidden, "home").sections.at(-1)).visible = false
  expect(() => validateComposition(hidden, manifest)).toThrow()
})

test("forged or missing provenance fails composition validation; unavailable exact source fails host policy", () => {
  const next = insertSectionExcerpt(
    canvasDefaults(manifest),
    "home",
    faq,
    "faq",
  )
  const forged = structuredClone(next)
  canvasSection(forged, "home", "faq").source = {
    ...faq.definition.source,
    templateKey: "service-desk",
  } as NonNullable<typeof faq.definition.source>
  expect(() => validateComposition(forged, manifest)).toThrow()
  const missing = structuredClone(next)
  Reflect.deleteProperty(canvasSection(missing, "home", "faq"), "source")
  expect(() => validateComposition(missing, manifest)).toThrow()
  expect(() =>
    assertCompositionSources(next, (pin) =>
      pin.key === faq.template.key
        ? null
        : (templateRegistry.find(
            (entry) =>
              entry.manifest.key === pin.key &&
              entry.manifest.version === pin.version,
          )?.manifest ?? null),
    ),
  ).toThrow()
})

test("runtime refuses a blocked source template even when the destination pin remains active", async () => {
  const composition = insertSectionExcerpt(
    canvasDefaults(manifest),
    "home",
    faq,
    "portable-faq",
  )
  const result = await loadStorefront({
    registry: templateRegistry.map((entry) =>
      entry.manifest.key === faq.template.key &&
      entry.manifest.version === faq.template.version
        ? { ...entry, availability: { state: "blocked" as const } }
        : entry,
    ),
    resolveSite: async () => ({
      composition,
      scope: {
        tenantId: "synthetic",
        siteId: "synthetic-site",
        storeId: "synthetic-store",
        releaseId: "synthetic-release",
        mode: "live",
        locale: "en-NG",
        currencyCode: "NGN",
      },
    }),
    loadResources: async () => fixture("populated"),
  })
  expect(result.status).toBe("refused")
  expect(result).toMatchObject({ reason: "invalid-composition" })
})

test("shared rendered section excerpts retain layout/source, escape copy, and expose only current business facts", () => {
  const composition = insertSectionExcerpt(
    canvasDefaults(manifest),
    "home",
    faq,
    "faq",
  )
  canvasSection(composition, "home", "faq").settings.heading =
    "<script>unsafe</script>"
  const snapshot = {
    ...fixture("populated"),
    composition,
    mode: "preview" as const,
    locale: "en-NG",
    currencyCode: "NGN",
  }
  const html = renderToStaticMarkup(
    <CanvasStorefront
      snapshot={snapshot}
      domain="fixture.localhost"
      customerChatOrigin=""
    />,
  )
  expect(html).toContain("cv-editorial")
  expect(html).toContain("&lt;script&gt;unsafe&lt;/script&gt;")
  expect(html).not.toContain("<script>unsafe")
  expect(html).toContain("Fixture Store")
  expect(html).toContain('href="/about"')
  expect(html).toContain("Ankara tote")
  const about = renderToStaticMarkup(
    <CanvasStorefront
      snapshot={snapshot}
      pageKey="about"
      domain="fixture.localhost"
      customerChatOrigin=""
    />,
  )
  expect(about).toContain("Our story")
  expect(about).not.toContain("Independent heading")
})
