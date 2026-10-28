import { expect, test } from "bun:test"
import {
  createStorefrontDesignBrief,
  validateStorefrontDesignOutput,
} from "@ewatrade/storefront-contracts/design"
import {
  readStorefrontFeatureConfig,
  upgradeStorefrontFeatures,
  withStorefrontFeatureConfig,
} from "@ewatrade/storefront-contracts/features"
import { validateComposition } from "@ewatrade/storefront-contracts/manifest"
import { storefrontDesignResources } from "@ewatrade/storefront-runtime/design-assets"
import { fixture } from "./fixtures"
import {
  defaultComposition,
  getTemplateManifest,
  listSelectableTemplates,
  replaceDraftTemplate,
} from "./registry"

const manifestFor = (key: string) => {
  const manifest = listSelectableTemplates().find(
    (entry) => entry.manifest.key === key,
  )?.manifest
  if (!manifest) throw new Error(`Missing ${key}`)
  return manifest
}

test("explicit feature migration preserves legacy privacy/fulfilment and leaves release bytes unchanged", () => {
  const original = defaultComposition(manifestFor("commerce-studio"))
  const header = original.pages
    .flatMap((page) => page.sections)
    .find((section) => section.type === "commerce-studio-header")
  if (!header) throw new Error("Missing header")
  header.settings["show-low-stock-count"] = true
  header.settings["offer-delivery"] = true
  const bytes = JSON.stringify(original)
  const next = upgradeStorefrontFeatures(original)
  expect(JSON.stringify(original)).toBe(bytes)
  expect(next.features.orders.fulfilment).toEqual(["pickup", "delivery"])
  expect(next.features.catalog.showLowStockCounts).toBe(true)
  expect(validateComposition(next, getTemplateManifest(next))).toEqual(next)
  for (const { manifest } of listSelectableTemplates()) {
    const changed = replaceDraftTemplate(next, manifest)
    expect(readStorefrontFeatureConfig(changed)).toEqual(next.features)
    expect(changed.template).toEqual({
      key: manifest.key,
      version: manifest.version,
    })
  }
})

test("feature configuration cannot accept order requests without a fulfilment method", () => {
  const next = upgradeStorefrontFeatures(
    defaultComposition(manifestFor("commerce-studio")),
  )
  next.features.orders.fulfilment = []
  expect(() => validateComposition(next, getTemplateManifest(next))).toThrow(
    "Choose pickup or delivery",
  )
})

test("AI proposals must preserve feature policy across every direction and reject legacy or altered policy", () => {
  const current = upgradeStorefrontFeatures(
    defaultComposition(manifestFor("commerce-studio")),
  )
  const data = fixture("populated")
  data.resources.assets = storefrontDesignResources()
  const brief = createStorefrontDesignBrief({
    ...data,
    composition: current,
    baseRevision: 3,
    desiredJourney: "browse",
  })
  const manifests = ["commerce-studio", "retail-editorial", "service-desk"].map(
    manifestFor,
  )
  const output = {
    baseRevision: 3,
    directions: manifests.map((manifest, index) => ({
      id: ["01", "02", "03"][index],
      rationale: ["brand-led"],
      missingAssets: [],
      sourceReferences: [],
      composition: withStorefrontFeatureConfig(
        defaultComposition(manifest),
        current.features,
      ),
    })),
  }
  expect(
    validateStorefrontDesignOutput(output, brief, manifests).directions,
  ).toHaveLength(3)
  const changed = structuredClone(output)
  const second = changed.directions[1]
  if (!second) throw new Error("Missing direction")
  second.composition.features.accounts.enabled = false
  expect(() =>
    validateStorefrontDesignOutput(changed, brief, manifests),
  ).toThrow("preserve")
  const legacy = {
    ...output,
    directions: output.directions.map((direction, i) => ({
      ...direction,
      composition: defaultComposition(
        manifestFor(
          ["commerce-studio", "retail-editorial", "service-desk"][i] ??
            "commerce-studio",
        ),
      ),
    })),
  }
  expect(() =>
    validateStorefrontDesignOutput(legacy, brief, manifests),
  ).toThrow("preserve")
})

test("a legacy merchant with all fulfilment disabled can migrate without reopening intake", () => {
  const current = defaultComposition(manifestFor("commerce-studio"))
  const header = current.pages
    .flatMap((page) => page.sections)
    .find((section) => section.type === "commerce-studio-header")
  if (!header) throw new Error("Missing header")
  header.settings["offer-pickup"] = false
  header.settings["offer-delivery"] = false
  const next = upgradeStorefrontFeatures(current)
  expect(next.features.orders).toEqual({ enabled: false, fulfilment: [] })
  expect(next.features.accounts.enabled).toBe(true)
  expect(validateComposition(next, getTemplateManifest(next))).toEqual(next)
})
