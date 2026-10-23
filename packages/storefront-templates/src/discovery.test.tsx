import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { fixture } from "./fixtures"
import { defaultComposition, templateRegistry } from "./registry"
import { StorefrontTemplate } from "./render"

test("every registered template renders crawlable public item links and EwaTrade attribution", () => {
  for (const entry of templateRegistry) {
    if (entry.status.qualification !== "qualified") continue
    const snapshot = {
      ...fixture("populated"),
      mode: "live" as const,
      locale: "en-NG",
      currencyCode: "NGN",
      composition: defaultComposition(entry.manifest),
    }
    const html = renderToStaticMarkup(
      <StorefrontTemplate
        snapshot={snapshot}
        domain="fixture-store.ewatrade.com"
        customerChatOrigin="https://chat.example"
        syncUrl
      />,
    )
    expect(html, `${entry.manifest.key}@${entry.manifest.version}`).toMatch(
      /href="\/\?item=item-[12]"/,
    )
    if (html.includes("Ankara tote"))
      expect(html).toContain('href="/?item=item-1"')
    if (html.includes("Tailoring fitting"))
      expect(html).toContain('href="/?item=item-2"')
    expect(html).toContain(
      '<a href="https://ewatrade.com/" data-storefront-event="storefront_backlink_clicked">Powered by',
    )
  }
})
