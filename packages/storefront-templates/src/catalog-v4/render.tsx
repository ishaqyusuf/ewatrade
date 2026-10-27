import { storefrontDesignAsset } from "@ewatrade/storefront-runtime/design-assets"
import { storefrontInitials } from "@ewatrade/storefront-runtime/presentation"
import { StorefrontAttribution } from "@ewatrade/storefront-runtime/primitives"
import {
  type StorefrontComposition,
  validateComposition,
} from "../../../storefront-contracts/src/manifest"
import { getTemplateManifest } from "../registry"
import { StorefrontCatalog } from "./catalog"
import { resolveCatalogV4Layout } from "./layout"
import type { CatalogV4Store } from "./types"

export type { CatalogV4Item, CatalogV4Store } from "./types"
export { resolveCatalogV4Layout } from "./layout"

/** Server entry: resolves the validated composition, hands plain layout data to the interactive island. */
export function CatalogV4({
  composition,
  ...props
}: {
  composition: StorefrontComposition
  store: CatalogV4Store
  domain: string
  after?: string
  customerChatOrigin: string
  onTaglineChange?: (value: string) => void
  /** Storefront host only: item details push ?item= history. Embedded previews omit it. */
  syncUrl?: boolean
}) {
  const layout = resolveCatalogV4Layout(
    validateComposition(
      composition,
      getTemplateManifest(composition, "render"),
    ),
  )
  const { store, domain } = props
  const lede = layout.tagline || store.description
  const cover = storefrontDesignAsset(
    composition.pages
      .find((page) => page.key === "home")
      ?.sections.find(
        (section) => section.type === "catalog-header" && section.visible,
      )?.settings.cover,
  )
  const staticParts = {
    brand: (
      <div className="sf-brand">
        <span className="sf-mark" aria-hidden="true">
          {storefrontInitials(store.name)}
        </span>
        <span className="sf-brand-name">{store.name}</span>
      </div>
    ),
    hero: (
      <section key="catalog-header" className="sf-hero">
        {cover ? (
          <img
            className="sf-cover"
            src={cover.url}
            alt=""
            width={1200}
            height={560}
          />
        ) : null}
        <h1>{store.name}</h1>
        {lede || props.onTaglineChange ? (
          <p
            className="sf-lede"
            contentEditable={
              props.onTaglineChange ? "plaintext-only" : undefined
            }
            suppressContentEditableWarning={!!props.onTaglineChange}
            aria-label={
              props.onTaglineChange ? "Edit storefront tagline" : undefined
            }
            onBlur={
              props.onTaglineChange
                ? (event) =>
                    props.onTaglineChange?.(
                      event.currentTarget.textContent ?? "",
                    )
                : undefined
            }
          >
            {lede}
          </p>
        ) : null}
      </section>
    ),
    footer: (
      <footer className="sf-footer">
        <div className="sf-wrap sf-footer-inner">
          {layout.showContact ? (
            <span>
              <strong>{store.name}</strong> · {domain}
            </span>
          ) : null}
          <span>
            <StorefrontAttribution />
          </span>
        </div>
      </footer>
    ),
  }
  return (
    <StorefrontCatalog {...props} layout={layout} staticParts={staticParts} />
  )
}
