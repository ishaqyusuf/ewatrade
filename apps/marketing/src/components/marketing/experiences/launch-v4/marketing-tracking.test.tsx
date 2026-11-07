import { expect, test } from "bun:test"
import { marketingInteraction } from "@/lib/marketing-interactions"
import { safeBatch } from "@ewatrade/events/policy"
import { renderToStaticMarkup } from "react-dom/server"
import { BusinessTypesV15 } from "./business-types-v15"
import { HeaderV15, WhatsAppAnnouncement } from "./header-v15"
import { HeroV15 } from "./hero-v15"
import { NativePreview } from "./native-preview"
import { ClosingV15, FaqV15, FeatureSuite, FooterV15 } from "./page-sections"
import { PricingV15 } from "./pricing-v15"
import { Walkthrough } from "./walkthrough"
import { WhatsAppV15 } from "./whatsapp-v15"

// Exercise the rendered controls: a helper-only test would miss unwired buttons.
test("landing controls carry accepted Logly labels, without collecting their text or values", async () => {
  const html = renderToStaticMarkup(
    <>
      <HeaderV15 signupEnabled dark={false} onToggleTheme={() => {}} />
      <WhatsAppAnnouncement />
      <HeroV15 signupEnabled />
      <WhatsAppV15 />
      <Walkthrough request={null} />
      <FeatureSuite />
      <NativePreview />
      <BusinessTypesV15 />
      <PricingV15 signupEnabled />
      <FaqV15 />
      <ClosingV15 signupEnabled />
      <FooterV15 dark={false} onToggleTheme={() => {}} />
    </>,
  )
  const events: NonNullable<ReturnType<typeof marketingInteraction>>[] = []
  const missing: string[] = []
  await new HTMLRewriter()
    .on("a,button,summary,input", {
      element(el) {
        // Accessibility-only jump has no funnel meaning.
        if (el.getAttribute("class") === "skip") return
        const event = marketingInteraction({
          action: el.getAttribute("data-marketing-action"),
          channel: el.getAttribute("data-marketing-channel"),
          category: el.getAttribute("data-marketing-category"),
        })
        if (event) events.push(event)
        else
          missing.push(
            `${el.tagName}:${el.getAttribute("aria-label") ?? el.getAttribute("href") ?? el.getAttribute("class")}`,
          )
      },
    })
    .transform(new Response(html))
    .text()
  expect(missing).toEqual([])
  expect(
    events
      .filter((e) => e.properties.channel === "features")
      .map((e) => e.properties.category),
  ).toEqual([
    "storefront",
    "orders",
    "quotes",
    "stock",
    "customers",
    "finance",
    "team",
    "reports",
  ])
  expect(
    events
      .filter((e) => e.properties.channel === "faq")
      .map((e) => e.properties.category),
  ).toEqual(["catalog", "fulfilment", "approval", "mobile", "plans"])
  expect(events).toContainEqual({
    name: "marketing_cta_clicked",
    properties: {
      surface: "marketing",
      action: "signup",
      channel: "closing",
      category: "general",
    },
  })
  for (const action of [
    "quantity_increase",
    "quantity_decrease",
    "quantity_edit",
    "search",
    "next_step",
    "previous_step",
    "filter",
    "menu_open",
  ])
    expect(events.some((e) => e.properties.action === action)).toBe(true)
  const batch = safeBatch(
    {
      sentAt: new Date().toISOString(),
      sdk: { name: "@ishaqyusuf/logly-core", version: "0.2.0" },
      events: events.map((event) => ({
        ...event,
        eventId: crypto.randomUUID(),
        project: "wrong",
        version: 1,
        source: "browser",
        occurredAt: new Date().toISOString(),
        visitorId: "fixture",
        route: "/",
      })),
    },
    "ewatrade-marketing",
  )
  expect(batch.events).toHaveLength(events.length)
  expect(batch.events.every((e) => e.project === "ewatrade-marketing")).toBe(
    true,
  )
  expect(JSON.stringify(batch)).not.toMatch(
    /Amina|Jawdah|4,500|Search preview|Search orders|wa.me/,
  )
})
