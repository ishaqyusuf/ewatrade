import type {
  StorefrontComposition,
  TemplateManifest,
} from "../../storefront-contracts/src/manifest"
import type { PublicAsset } from "../../storefront-contracts/src/resources"

/** Bundled decorative art, not business/product photography or uploaded media. */
const illustration = (
  id: string,
  alt: string,
  artwork: string,
): PublicAsset => ({
  id,
  alt,
  url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="560" viewBox="0 0 1200 560">${artwork}</svg>`)}`,
})

export const storefrontDesignAssets: readonly PublicAsset[] = [
  illustration(
    "design-clay",
    "Clay shapes",
    '<path fill="#eee5dc" d="M0 0h1200v560H0z"/><circle cx="290" cy="280" r="200" fill="#bd8067"/><path fill="#d6b898" d="M650 80h360v400H650z"/><path d="M720 80v400m75-400v400m75-400v400m75-400v400" stroke="#eee5dc" stroke-width="14"/>',
  ),
  illustration(
    "design-indigo",
    "Indigo weave",
    '<path fill="#e5e8ec" d="M0 0h1200v560H0z"/><path d="M0 80h1200M0 240h1200M0 400h1200" stroke="#3e536b" stroke-width="90"/><path d="M120 0v560M440 0v560M760 0v560M1080 0v560" stroke="#8396a6" stroke-width="90"/>',
  ),
  illustration(
    "design-sage",
    "Sage leaves",
    '<path fill="#edf0e7" d="M0 0h1200v560H0z"/><path d="M120 480Q200 60 570 80Q540 430 120 480m500 0Q700 60 1070 80Q1040 430 620 480" fill="#a3af91"/><path d="M120 480L540 110m80 370l420-370" stroke="#edf0e7" stroke-width="10"/>',
  ),
]

export function storefrontDesignAsset(id: unknown) {
  return typeof id === "string"
    ? storefrontDesignAssets.find((asset) => asset.id === id)
    : undefined
}

export function storefrontDesignResources() {
  return Object.fromEntries(
    storefrontDesignAssets.map((asset) => [asset.id, { ...asset }]),
  )
}

/** References may name only reviewed bundled art; URL-shaped/private IDs refuse. */
export function validateDesignAssets(
  composition: StorefrontComposition,
  manifest: TemplateManifest,
) {
  for (const page of composition.pages)
    for (const section of page.sections) {
      const settings = [
        {
          values: section.settings,
          fields:
            manifest.sections.find((entry) => entry.key === section.type)
              ?.fields ?? [],
        },
        ...section.blocks.map((block) => ({
          values: block.settings,
          fields:
            manifest.blocks.find((entry) => entry.key === block.type)?.fields ??
            [],
        })),
      ]
      for (const { values, fields } of settings)
        for (const field of fields) {
          if (
            field.kind === "asset" &&
            values[field.key] !== null &&
            !storefrontDesignAsset(values[field.key])
          )
            throw new Error("Choose an available storefront illustration.")
        }
    }
}
