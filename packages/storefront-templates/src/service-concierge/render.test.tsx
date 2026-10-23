import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { StorefrontClientSnapshot } from "../../../storefront-runtime/src/server"
import {
  buildSectionLibrary,
  canvasDefaults,
  insertSectionExcerpt,
} from "../canvas/library"
import { canvasManifests, serviceConciergeManifest } from "../canvas/manifests"
import { fixture } from "../fixtures"
import { getTemplateManifest } from "../registry"
import { StorefrontTemplate } from "../render"
import {
  SERVICE_OPTION_SEARCH_THRESHOLD,
  type ServiceOption,
  isServiceOptionSelectable,
  orderServiceOptionIds,
  serviceOptionPriceLabel,
} from "../shared/service-option-picker"

function snapshot(): StorefrontClientSnapshot {
  const data = fixture("populated")
  const service = data.resources.catalog.items.find(
    (item) => item.kind === "SERVICE",
  )
  if (!service) throw new Error("Missing synthetic service")
  service.options = [
    {
      id: "offering-one",
      name: "Shirt cleaning",
      priceMinor: 40000,
      currencyCode: "NGN",
      availability: null,
    },
    {
      id: "offering-two",
      name: "Price on request",
      priceMinor: null,
      currencyCode: "NGN",
      availability: null,
    },
  ]
  data.resources.contact.serviceRequestEntry = {
    formId: "form-one",
    offeringIds: ["offering-one"],
  }
  data.capabilities.serviceRequest = { available: true }
  return {
    ...data,
    composition: canvasDefaults(serviceConciergeManifest),
    mode: "preview",
    locale: "en-NG",
    currencyCode: "NGN",
  }
}
function render(data: StorefrontClientSnapshot, pageKey = "home") {
  return renderToStaticMarkup(
    <StorefrontTemplate
      snapshot={data}
      domain="synthetic.localhost"
      customerChatOrigin=""
      pageKey={pageKey}
    />,
  )
}
const option = (
  id: string,
  availability: ServiceOption["availability"] = null,
  priceMinor: number | null = 100000,
): ServiceOption => ({
  id,
  name: `Option ${id}`,
  priceMinor,
  currencyCode: "NGN",
  availability,
})

test("concierge renders current service/option facts and a preview-safe scoped request", () => {
  const data = snapshot()
  const html = render(data)
  expect(getTemplateManifest(data.composition, "new-use").key).toBe(
    "service-concierge",
  )
  expect(html).toContain("Your enquiry")
  expect(html).toContain("Shirt cleaning")
  expect(html).toContain("₦400")
  expect(html).toContain("Request a quote")
  expect(html).not.toContain("Continue to request")
  expect(html).toContain("Ankara tote")
  expect(html).not.toContain("Bring with you")
  expect(html).not.toContain("Adara")
  expect(html).toContain(
    "The request form opens with this service and every option you chose.",
  )
  expect(html).toContain(
    "Requesting a quote does not book a time or take a payment.",
  )
  // Short lists are a multi toggle list; the first listed option starts selected.
  expect(html).toContain('data-slot="toggle-group"')
  expect(html).not.toContain("<select")
  expect(html).toMatch(/aria-pressed="true"[^>]*>.*?Shirt cleaning/)
  expect(html).toContain("Price on request")
  expect(html).not.toContain("Price not listed")
  // Shared Button navigation; no header share actions.
  expect(html).toContain('aria-current="page"')
  expect(html).toContain("Manrope")
})

test("unlisted prices, absent capability, mismatched offering and no-service states stay honest", () => {
  const data = snapshot()
  data.capabilities.serviceRequest = { available: false }
  expect(render(data)).not.toContain("Request a quote")
  data.capabilities.serviceRequest = { available: true }
  if (data.resources.contact.serviceRequestEntry)
    data.resources.contact.serviceRequestEntry.offeringIds = [
      "another-offering",
    ]
  expect(render(data)).not.toContain("Request a quote")
  for (const item of data.resources.catalog.items)
    for (const option of item.options) option.priceMinor = null
  const unknown = render(data)
  expect(unknown).toContain("Price on request")
  expect(unknown).not.toContain("Price not listed")
  expect(unknown).not.toContain("₦0")
  data.resources.catalog.items = []
  const empty = render(data)
  expect(empty).toContain("No services listed yet")
  expect(empty).not.toContain("Your enquiry")
})

test("new portable section fits the new pin without silently modifying older manifests", () => {
  const excerpt = buildSectionLibrary().find(
    (entry) => entry.template.key === "service-concierge",
  )
  if (!excerpt) throw new Error("Missing concierge excerpt")
  const next = insertSectionExcerpt(
    canvasDefaults(serviceConciergeManifest),
    "about",
    excerpt,
    "extra-enquiry",
  )
  expect(getTemplateManifest(next, "render")).toBe(serviceConciergeManifest)
  expect(serviceConciergeManifest.sections.length).toBeLessThanOrEqual(32)
  for (const old of canvasManifests.filter(
    (entry) => entry.key !== "service-concierge",
  )) {
    expect(old.sections).toHaveLength(30)
    expect(
      old.sections.some((section) => section.key === excerpt.definition.key),
    ).toBe(false)
    expect(() =>
      insertSectionExcerpt(
        canvasDefaults(old),
        "home",
        excerpt,
        "incompatible",
      ),
    ).toThrow()
  }
})

test("five or more options use the searchable chips combobox; out of stock never starts selected", () => {
  const data = snapshot()
  const service = data.resources.catalog.items.find(
    (item) => item.kind === "SERVICE",
  )
  if (!service) throw new Error("Missing synthetic service")
  service.options = [
    option("a", "OUT_OF_STOCK"),
    option("b"),
    option("c", "MADE_TO_ORDER", null),
    option("d"),
    option("e"),
  ]
  expect(service.options.length).toBe(SERVICE_OPTION_SEARCH_THRESHOLD)
  data.resources.contact.serviceRequestEntry = {
    formId: "form-one",
    offeringIds: service.options.map((entry) => entry.id),
  }
  const html = render(data)
  expect(html).toContain('data-slot="combobox-chips"')
  expect(html).toContain("Search and choose one or more of 5 options.")
  expect(html).toContain("Remove Option b")
  expect(html).not.toContain("Remove Option a")
  expect(html).toContain("Request a quote")
})

test("an empty selection asks for an option and disables Request a quote", () => {
  const data = snapshot()
  const service = data.resources.catalog.items.find(
    (item) => item.kind === "SERVICE",
  )
  if (!service) throw new Error("Missing synthetic service")
  service.options = [option("a", "OUT_OF_STOCK"), option("b", "OUT_OF_STOCK")]
  data.resources.contact.serviceRequestEntry = {
    formId: "form-one",
    offeringIds: ["a", "b"],
  }
  const html = render(data)
  expect(html).toContain("Select at least one option to request a quote.")
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Request a quote/)
})

test("picker helpers keep catalog order, refuse new out-of-stock picks and label unlisted prices", () => {
  const options = [option("a"), option("b", "OUT_OF_STOCK"), option("c")]
  expect(orderServiceOptionIds(options, ["c", "x", "a", "c"])).toEqual([
    "a",
    "c",
  ])
  expect(isServiceOptionSelectable(options[1] as ServiceOption, [])).toBe(false)
  expect(isServiceOptionSelectable(options[1] as ServiceOption, ["b"])).toBe(
    true,
  )
  expect(serviceOptionPriceLabel(option("z", null, null))).toBe(
    "Price on request",
  )
  expect(serviceOptionPriceLabel(option("z"))).toBe("₦1,000")
})

test("About reads its facts from the public catalog and renders the FAQ Accordion", () => {
  const html = render(snapshot(), "about")
  expect(html).toContain("Synthetic fixture data.")
  expect(html).toContain("<dt>Services</dt>")
  expect(html).toContain("<dt>Products</dt>")
  expect(html).toContain("Request a quote")
  expect(html).toContain('data-slot="accordion"')
  expect(html).not.toContain("<details")
  expect(html).not.toContain("Location")
})
