import { expect, test } from "bun:test"
import { Dialog } from "@ewatrade/ui"
import { renderToStaticMarkup } from "react-dom/server"
import { CatalogSetupHelperPickerContent } from "./catalog-setup-helper-picker"

function picker(kind: "product" | "service", profileKey: string | null) {
  return renderToStaticMarkup(
    <Dialog open>
      <CatalogSetupHelperPickerContent
        businessProfileKey={profileKey}
        kind={kind}
        onClose={() => {}}
        onSelect={() => {}}
        open
        selectedKey={null}
      />
    </Dialog>,
  )
}

test("farm Product create leads with eggs and farm goods without unrelated examples", () => {
  const markup = picker("product", "animal-feed-agricultural-supplies")
  expect(markup).toContain("Eggs by piece and tray")
  expect(markup).toContain("Live poultry by bird type")
  expect(markup).toContain("Farm produce by kilogram")
  expect(markup).not.toContain("Apparel by size and colour")
  expect(markup).not.toContain("Device repair")
  expect(markup).toContain("Browse all examples")
  expect(markup.indexOf("Eggs by piece and tray")).toBeLessThan(
    markup.indexOf("Setups"),
  )
})

test("Service create uses service examples for the same profile", () => {
  const markup = picker("service", "beauty-salon-spa")
  expect(markup).toContain("Haircut by style")
  expect(markup).not.toContain("Shampoo by bottle size")
  expect(markup).not.toContain("25 kg chicken feed")
})

test("missing or retired business profiles keep the complete matching-kind library", () => {
  for (const profileKey of [null, "retired-profile"]) {
    const markup = picker("product", profileKey)
    expect(markup).toContain("25 kg chicken feed")
    expect(markup).toContain("Apparel by size and colour")
    expect(markup).not.toContain("Device repair")
  }
})
