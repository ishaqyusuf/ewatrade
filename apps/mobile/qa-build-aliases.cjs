const { existsSync } = require("node:fs")
const { resolve } = require("node:path")

const QA_COMPONENT_IMPORTS = [
  "@/components/mobile/qa-account-chooser",
  "@/components/mobile/qa-authorization-sheet",
  "@/components/mobile/qa-quick-fill-button",
]

const DESIGN_REFERENCE_IMPORTS = [
  "reference-commerce-home-customer-orders.png",
  "reference-products-create-media.png",
  "reference-customer-orders-insights.png",
  "reference-customers-profile-orders.png",
  "reference-customer-wishlist-reviews-loyalty.png",
]
const PRODUCTION_DESIGN_PLACEHOLDER = "assets/icons/splash-logo.png"
const INTERNAL_DESIGN_ASSET_PREFIXES = [
  "@assets/images/design-system/",
  "@assets/images/e-shop/",
]

function isInternalQaBuild(env = process.env) {
  const variant = (
    env.APP_VARIANT ??
    env.EXPO_PUBLIC_APP_VARIANT ??
    "production"
  ).toLowerCase()
  return new Set(["local", "dev", "development", "preview"]).has(variant)
}

function createProductionQaAliases(appRoot) {
  const componentNoop = resolve(
    appRoot,
    "src/internal-tooling/qa-components.production.tsx",
  )
  return new Map([
    ...QA_COMPONENT_IMPORTS.map((moduleName) => [moduleName, componentNoop]),
    [
      "@/hooks/use-qa-accelerator",
      resolve(appRoot, "src/internal-tooling/qa-provider.production.tsx"),
    ],
    [
      "@/internal-tooling/fixture-recipes",
      resolve(appRoot, "src/internal-tooling/fixture-recipes.production.ts"),
    ],
  ])
}

function createProductionDesignReferenceAliases(appRoot) {
  const bundledReference = resolve(appRoot, PRODUCTION_DESIGN_PLACEHOLDER)
  return new Map(
    DESIGN_REFERENCE_IMPORTS.map((fileName) => [
      `@design/${fileName}`,
      bundledReference,
    ]),
  )
}

function resolveProductionInternalDesignAssetAlias(
  moduleName,
  appRoot,
  internalQaBuild,
) {
  if (
    internalQaBuild ||
    !INTERNAL_DESIGN_ASSET_PREFIXES.some((prefix) =>
      moduleName.startsWith(prefix),
    )
  )
    return null
  return resolve(appRoot, PRODUCTION_DESIGN_PLACEHOLDER)
}

function resolveDesignReferenceAlias(
  moduleName,
  designRoot,
  aliases,
  internalQaBuild,
) {
  const bundledReference = aliases.get(moduleName)
  if (!bundledReference) return null
  const sourceReference = resolve(
    designRoot,
    moduleName.slice("@design/".length),
  )
  return !internalQaBuild || !existsSync(sourceReference)
    ? bundledReference
    : null
}

module.exports = {
  createProductionDesignReferenceAliases,
  createProductionQaAliases,
  isInternalQaBuild,
  resolveDesignReferenceAlias,
  resolveProductionInternalDesignAssetAlias,
}
