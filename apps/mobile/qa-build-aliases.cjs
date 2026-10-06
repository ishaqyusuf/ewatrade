const { resolve } = require("node:path")

const QA_COMPONENT_IMPORTS = [
  "@/components/mobile/floating-qa-button",
  "@/components/mobile/qa-account-chooser",
  "@/components/mobile/qa-authorization-sheet",
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
  ])
}

module.exports = { createProductionQaAliases, isInternalQaBuild }
