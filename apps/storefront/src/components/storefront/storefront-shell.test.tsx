import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { canvasDefaults } from "../../../../../packages/storefront-templates/src/canvas/library"
import { previewCommerceAdapter } from "../../../../../packages/storefront-templates/src/commerce-studio/commerce"
import { commerceStudioManifest } from "../../../../../packages/storefront-templates/src/commerce-studio/manifest"
import { fixture } from "../../../../../packages/storefront-templates/src/fixtures"
import { defaultComposition } from "../../../../../packages/storefront-templates/src/registry"
import { StorefrontTemplate } from "../../../../../packages/storefront-templates/src/render"
import { retailEditorialManifest } from "../../../../../packages/storefront-templates/src/retail-editorial/manifest"
import { storefrontPresentation } from "../../lib/storefront-presentation"
import { StorefrontPageBoundary, StorefrontShell } from "./storefront-shell"

const snapshot = (composition: ReturnType<typeof defaultComposition>) => ({
  ...fixture("populated"),
  composition,
  mode: "live" as const,
  locale: "en-NG",
  currencyCode: "NGN",
})
const viewports = (html: string) =>
  html.match(/class="sf-template-viewport"/g)?.length ?? 0

test("the persistent Commerce shell sits inside one named storefront container", () => {
  const value = snapshot(canvasDefaults(commerceStudioManifest))
  const data = storefrontPresentation(value)
  const html = renderToStaticMarkup(
    <StorefrontShell data={data} adapter={previewCommerceAdapter}>
      <StorefrontPageBoundary data={data}>
        <p>page body</p>
      </StorefrontPageBoundary>
    </StorefrontShell>,
  )
  expect(viewports(html)).toBe(1)
  // Header, main (with the page) and footer all answer to the container queries.
  const start = html.indexOf('class="sf-template-viewport"')
  for (const part of ["cs-store", "cs-header", "page body", "cs-footer"])
    expect(html.indexOf(part)).toBeGreaterThan(start)
})

test("other templates keep their renderer's own single container", () => {
  const value = snapshot(defaultComposition(retailEditorialManifest))
  const data = storefrontPresentation(value)
  const html = renderToStaticMarkup(
    <StorefrontShell data={data} adapter={previewCommerceAdapter}>
      <StorefrontTemplate
        snapshot={value}
        domain="shop.test"
        customerChatOrigin=""
      />
    </StorefrontShell>,
  )
  expect(viewports(html)).toBe(1)
})
