import { expect, test } from "bun:test"
import { createStorefrontDesignBrief } from "../../storefront-contracts/src/design"
import { fixture } from "../../storefront-templates/src/fixtures"
import {
  defaultComposition,
  listSelectableTemplates,
} from "../../storefront-templates/src/registry"
import { storefrontDesignPrompt } from "./storefront-design"

test("the complete canvas catalog fits the existing generation input budget and carries exact provenance instructions", () => {
  const manifests = listSelectableTemplates().map((entry) => entry.manifest)
  const first = manifests[0]
  if (!first) throw new Error("Missing reviewed template")
  const brief = createStorefrontDesignBrief({
    ...fixture("populated"),
    composition: defaultComposition(first),
    baseRevision: 1,
    desiredJourney: "browse",
  })
  const prompt = storefrontDesignPrompt(brief, manifests)
  expect(new TextEncoder().encode(prompt).length).toBeLessThan(64_000)
  const data = JSON.parse(prompt.slice(prompt.indexOf("\n") + 1))
  expect(data.manifests).toHaveLength(manifests.length)
  // Every manifest round-trips to its exact ordered declarations; shared ones serialize once.
  manifests.forEach((manifest, index) => {
    const references: string[] = data.manifests[index].sectionDefinitions
    expect(
      references.map((reference) => data.sectionDeclarations[reference]),
    ).toEqual(JSON.parse(JSON.stringify(manifest.sections)))
  })
  const declared = manifests.flatMap((manifest) => manifest.sections)
  expect(Object.keys(data.sectionDeclarations).length).toBe(
    new Set(declared.map((section) => JSON.stringify(section))).size,
  )
  expect(manifests.some((manifest) => manifest.key === "market-hall")).toBe(
    true,
  )
  expect(prompt).toContain("Copy every declared section.source object exactly")
  expect(prompt).toContain("fixedLast stays last")
  expect(prompt).toContain("defaultSections")
})
