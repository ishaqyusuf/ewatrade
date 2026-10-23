import { expect, test } from "bun:test"
import { versionAvailable } from "../../storefront-contracts/src/availability"
import { resolveTemplate } from "../../storefront-runtime/src/server"
import {
  catalogV4LegacyManifest,
  catalogV4Manifest,
} from "./catalog-v4/manifest"
import {
  type TemplateEntry,
  defaultComposition,
  getTemplateManifest,
  listSelectableTemplates,
  migrateCatalogCoverDraft,
  replaceDraftTemplate,
  templateRegistry,
} from "./registry"

function entry(
  state: "active" | "retired" | "blocked",
  version = "1.0.0",
): TemplateEntry {
  return {
    manifest: { ...catalogV4LegacyManifest, version },
    availability: { state },
    status: {
      registration: "runtime-registered",
      qualification: "qualified",
      release: "not-live",
    },
    source: "synthetic-policy-fixture",
  }
}

test("retired exact pins remain renderable and rollbackable; blocked pins remain inspectable only", () => {
  const retired = entry("retired")
  const blocked = entry("blocked")
  expect(versionAvailable(retired, "new-use")).toBe(false)
  expect(versionAvailable(retired, "render")).toBe(true)
  expect(versionAvailable(retired, "rollback")).toBe(true)
  for (const intent of ["new-use", "render", "rollback"] as const)
    expect(versionAvailable(blocked, intent)).toBe(false)
  expect(versionAvailable(blocked, "inspect")).toBe(true)
  for (const mode of ["live", "preview"] as const) {
    expect(resolveTemplate(mode, retired.manifest, [retired])).toBe(retired)
    expect(resolveTemplate(mode, blocked.manifest, [blocked])).toBeNull()
  }
  const dependency = {
    ...entry("active"),
    components: [
      {
        key: "synthetic",
        version: "1.0.0",
        availability: { state: "retired" as const },
      },
    ],
  }
  expect(versionAvailable(dependency, "new-use")).toBe(false)
  expect(versionAvailable(dependency, "rollback")).toBe(true)
  const defective = {
    ...dependency,
    components: [
      {
        ...dependency.components[0],
        availability: { state: "blocked" as const },
      },
    ],
  }
  expect(resolveTemplate("live", defective.manifest, [defective])).toBeNull()
  expect(versionAvailable(defective, "rollback")).toBe(false)
})

test("selection uses active qualified exact versions in deterministic numeric semver order", () => {
  const entries = [
    entry("active", "1.9.0"),
    entry("retired", "3.0.0"),
    entry("active", "1.10.0"),
    entry("blocked", "4.0.0"),
    {
      ...entry("active", "2.0.0"),
      status: {
        ...entry("active").status,
        qualification: "not-qualified" as const,
      },
    },
  ]
  expect(
    listSelectableTemplates(entries).map((value) => value.manifest.version),
  ).toEqual(["1.10.0", "1.9.0"])
  expect(
    listSelectableTemplates([...entries].reverse()).map(
      (value) => value.manifest.version,
    ),
  ).toEqual(["1.10.0", "1.9.0"])
  const old = defaultComposition(catalogV4LegacyManifest)
  expect(getTemplateManifest(old).version).toBe("1.0.0")
  expect(old.template.version).toBe("1.0.0")
  expect(
    templateRegistry.every((value) => value.availability.state === "active"),
  ).toBe(true)
})

test("explicit replacement and named cover migration only create validated draft values", () => {
  const old = defaultComposition(catalogV4LegacyManifest)
  old.theme.accent = "#123456"
  const header = old.pages[0]?.sections.find(
    (value) => value.type === "catalog-header",
  )
  if (!header) throw Error("Missing fixture header")
  header.settings.tagline = "Retain my copy"
  const before = JSON.stringify(old)
  const migrated = migrateCatalogCoverDraft(old)
  expect(migrated.template.version).toBe("1.1.0")
  expect(migrated.pages[0]?.sections[0]?.settings.tagline).toBe(
    "Retain my copy",
  )
  expect(migrated.pages[0]?.sections[0]?.settings.cover).toBeNull()
  expect(migrated.theme.accent).toBe("#123456")
  const replaced = replaceDraftTemplate(old, catalogV4Manifest)
  expect(replaced.pages[0]?.sections[0]?.settings.tagline).toBe("")
  expect(replaced.theme.accent).toBe("#123456")
  expect(JSON.stringify(old)).toBe(before)
  expect(() => migrateCatalogCoverDraft(migrated)).toThrow()
})
