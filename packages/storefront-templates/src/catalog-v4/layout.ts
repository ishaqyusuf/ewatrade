import type { StorefrontComposition } from "../../../storefront-contracts/src/manifest"

type MainSection = "catalog-header" | "catalog"
export type CatalogV4Region =
  | { type: "main"; sections: MainSection[] }
  | { type: "contact" }
export type CatalogV4Layout = {
  regions: CatalogV4Region[]
  tagline: string
  showCategories: boolean
  showContact: boolean
  themeStyle: Record<string, string>
}

/** Serializable layout from a validated composition. Defaults preserve Catalog v4. */
export function resolveCatalogV4Layout(
  composition: StorefrontComposition,
): CatalogV4Layout {
  const visible = (
    composition.pages.find((page) => page.key === "home")?.sections ?? []
  ).filter((section) => section.visible)
  const find = (type: string) =>
    visible.find((section) => section.type === type)
  const regions: CatalogV4Region[] = []
  for (const section of visible) {
    if (section.type === "contact") regions.push({ type: "contact" })
    else if (section.type === "catalog-header" || section.type === "catalog") {
      const previous = regions.at(-1)
      if (previous?.type === "main") previous.sections.push(section.type)
      else regions.push({ type: "main", sections: [section.type] })
    }
  }
  // Platform attribution stays visible even when merchant contact content is hidden.
  if (!find("contact")) regions.push({ type: "contact" })
  const themeStyle: Record<string, string> = {}
  if (composition.theme.accent !== "#171717")
    themeStyle["--sf-ink"] = composition.theme.accent
  if (composition.theme.background !== "#ffffff")
    themeStyle["--background"] = composition.theme.background
  if (composition.theme.font === "serif")
    themeStyle["--sf-font"] = "Georgia, serif"
  if (composition.theme.radius !== "small")
    themeStyle["--sf-corner-radius"] =
      composition.theme.radius === "rounded" ? "12px" : "0px"
  const tagline = find("catalog-header")?.settings.tagline
  return {
    regions,
    tagline: typeof tagline === "string" ? tagline.trim() : "",
    showCategories: find("catalog")?.settings["show-categories"] !== false,
    showContact: !!find("contact"),
    themeStyle,
  }
}
