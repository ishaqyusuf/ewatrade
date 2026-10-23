import { validateDesignAssets } from "@ewatrade/storefront-runtime/design-assets"
import type { StorefrontClientSnapshot } from "@ewatrade/storefront-runtime/server"
import { validateComposition } from "../../storefront-contracts/src/manifest"
import { isCanvasManifest } from "./canvas/catalog"
import { type CanvasEditing, CanvasStorefront } from "./canvas/render"
import { CatalogV4 } from "./catalog-v4/render"
import { getTemplateManifest } from "./registry"
import { RetailEditorial } from "./retail-editorial/render"
import { ServiceDesk } from "./service-desk/render"

/** One exact renderer dispatch for live pages, editor previews and offline fixtures. */
function TemplateBody(props: {
  snapshot: StorefrontClientSnapshot
  draftPreview?: boolean
  domain: string
  after?: string
  customerChatOrigin: string
  onTaglineChange?: (value: string) => void
  pageKey?: string
  editing?: CanvasEditing
  onPageChange?: (key: string) => void
  /** Storefront host only: item details may push ?item= history. Embedded previews omit it. */
  syncUrl?: boolean
}) {
  const { snapshot } = props
  const manifest = getTemplateManifest(snapshot.composition, "render")
  validateComposition(snapshot.composition, manifest)
  validateDesignAssets(snapshot.composition, manifest)
  if (isCanvasManifest(manifest)) return <CanvasStorefront {...props} />
  if (manifest.key === "component-editorial" && manifest.version === "1.0.0")
    return <RetailEditorial {...props} />
  if (manifest.key === "retail-editorial") return <RetailEditorial {...props} />
  if (manifest.key === "service-desk") return <ServiceDesk {...props} />
  if (manifest.key !== "catalog-v4")
    throw new Error("This template renderer is unavailable.")
  const { business, catalog, contact } = snapshot.resources
  return (
    <CatalogV4
      composition={snapshot.composition}
      store={{
        ...business,
        ...catalog,
        ...contact,
        isQaPreview: snapshot.mode === "preview",
        isDraftPreview: props.draftPreview,
      }}
      domain={props.domain}
      after={props.after}
      customerChatOrigin={props.customerChatOrigin}
      onTaglineChange={props.onTaglineChange}
    />
  )
}

/** Container width, rather than dashboard viewport, controls embedded candidate responsiveness. */
export function StorefrontTemplate(props: Parameters<typeof TemplateBody>[0]) {
  return (
    <div className="sf-template-viewport">
      <TemplateBody {...props} />
    </div>
  )
}
