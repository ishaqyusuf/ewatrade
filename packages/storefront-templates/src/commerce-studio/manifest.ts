import {
  type EditableField,
  type SectionDefinition,
  defineTemplate,
} from "../../../storefront-contracts/src/manifest"

/**
 * Commerce studio: the flagship shop + services storefront.
 * Workshop direction `commerce-studio` v7, revision
 * 5da7748c-cecd-49a0-90bb-222bed599859 (owner-requested implementation baseline,
 * 27 October 2026). Business facts, prices and stock always come from the runtime
 * load; settings hold only merchant-written copy and presentation choices.
 */
export const commerceStudioLegacyVersion = "1.0.0"
/** 1.1.0 adds pinned products to Featured; every other section keeps its 1.0.0 source. */
export const commerceStudioVersion = "1.1.0"
export type CommerceStudioKind =
  | "header"
  | "hero"
  | "categories"
  | "featured"
  | "catalog"
  | "services"
  | "story"
  | "faq"
  | "contact"
  | "footer"

const text = (
  key: string,
  label: string,
  fallback: string,
  maxLength: number,
): EditableField => ({ key, label, kind: "text", default: fallback, maxLength })
const toggle = (
  key: string,
  label: string,
  fallback: boolean,
): EditableField => ({ key, label, kind: "boolean", default: fallback })
const source = (sectionKey: string) => ({
  templateKey: "commerce-studio",
  templateVersion: commerceStudioLegacyVersion,
  sectionKey,
  sectionVersion: 1,
})
const section = (
  kind: CommerceStudioKind,
  label: string,
  fields: EditableField[],
  extra: Partial<SectionDefinition> = {},
): SectionDefinition => ({
  key: `commerce-studio-${kind}`,
  version: 1,
  label,
  source: source(`commerce-studio-${kind}`),
  fields,
  allowedBlocks: [],
  resources: ["business", "publicCatalog"],
  capabilities: ["catalog", "services", "whatsappEnquiry", "serviceRequest"],
  ...extra,
})

/** Empty copy falls back to current business facts at render; nothing is invented. */
export const commerceStudioLegacySections: readonly SectionDefinition[] = [
  section(
    "header",
    "Header and business details",
    [
      text("tagline", "Short line under your name", "", 80),
      text("location", "Where customers find you", "", 120),
      text("hours", "Opening hours", "", 120),
      toggle("offer-pickup", "Customers can pick up", true),
      toggle("offer-delivery", "You deliver", false),
      text("delivery-note", "Delivery area or note", "", 120),
      toggle("show-login", "Show customer login", true),
    ],
    { required: true, fixedFirst: true },
  ),
  section("hero", "Introduction", [
    text("headline", "Headline", "", 100),
    text("description", "Description", "", 280),
    toggle("show-actions", "Show Shop and Services buttons", true),
  ]),
  section("categories", "Shop by category", [
    text("heading", "Heading", "Shop by category", 80),
  ]),
  section("featured", "Featured products", [
    text("heading", "Heading", "New in the shop", 80),
    {
      key: "lead",
      label: "Lead with",
      kind: "select",
      default: "available",
      options: [
        { value: "available", label: "Available items first" },
        { value: "newest", label: "Most recently added" },
        { value: "price-low", label: "Lowest price first" },
      ],
    },
    {
      key: "count",
      label: "How many to show",
      kind: "select",
      default: "four",
      options: [
        { value: "three", label: "3" },
        { value: "four", label: "4" },
        { value: "eight", label: "8" },
      ],
    },
  ]),
  section("catalog", "Full catalog", [
    text("heading", "Heading", "Shop", 80),
    toggle("show-search", "Show search and sorting", true),
  ]),
  section("services", "Services", [
    text("heading", "Heading", "Services", 80),
    text(
      "intro",
      "Introduction",
      "Choose what you need and a day that suits you. The business confirms the price and time with you before any work starts.",
      280,
    ),
  ]),
  section("story", "Our story", [
    text("heading", "Heading", "Our story", 80),
    text("body", "Story", "", 1200),
  ]),
  section("faq", "Questions", [
    text("heading", "Heading", "How ordering works", 80),
    text("question-one", "Question 1", "Do I pay when I send a request?", 160),
    text(
      "answer-one",
      "Answer 1",
      "No. The business checks your request, confirms the total with you, then shares how to pay.",
      600,
    ),
    text(
      "question-two",
      "Question 2",
      "Is my order confirmed straight away?",
      160,
    ),
    text(
      "answer-two",
      "Answer 2",
      "Your request is received straight away. It becomes an order when the business confirms it.",
      600,
    ),
    text("question-three", "Question 3", "", 160),
    text("answer-three", "Answer 3", "", 600),
  ]),
  section("contact", "Visit or message", [
    text("heading", "Heading", "Visit or message us", 80),
    text("note", "Extra note", "", 280),
  ]),
  section("footer", "Footer", [text("note", "Footer note", "", 200)], {
    required: true,
    fixedLast: true,
  }),
]

const keys = commerceStudioLegacySections.map((entry) => entry.key)
const k = (kind: CommerceStudioKind) => `commerce-studio-${kind}`

/** Exact 1.0.0 contract, kept registered so releases pinned to it still render. */
export const commerceStudioLegacyManifest = defineTemplate({
  schemaVersion: 1,
  runtimeVersion: 1,
  key: "commerce-studio",
  version: commerceStudioLegacyVersion,
  name: "Commerce studio",
  description:
    "A complete shop and services storefront: product grid with bag and order requests, service requests with preferred dates, receipts, and optional customer login.",
  businessTypes: ["retail", "services"],
  themeControls: ["width", "density"],
  pages: [
    {
      key: "home",
      label: "Home",
      path: "/",
      allowedSections: keys,
      defaultSections: [
        k("header"),
        k("hero"),
        k("categories"),
        k("featured"),
        k("services"),
        k("story"),
        k("faq"),
        k("contact"),
        k("footer"),
      ],
    },
    {
      key: "shop",
      label: "Shop",
      path: "/shop",
      allowedSections: keys,
      defaultSections: [k("header"), k("catalog"), k("footer")],
    },
    {
      key: "services",
      label: "Services",
      path: "/services",
      allowedSections: keys,
      defaultSections: [k("header"), k("services"), k("faq"), k("footer")],
    },
    {
      key: "about",
      label: "Our story",
      path: "/about",
      allowedSections: keys,
      defaultSections: [k("header"), k("story"), k("contact"), k("footer")],
    },
  ],
  sections: commerceStudioLegacySections,
  blocks: [],
})

export const commerceStudioPinnedField: EditableField = {
  key: "pinned",
  label: "Pinned products",
  kind: "catalog-items",
  maxItems: 8,
  itemKind: "PRODUCT",
  default: [],
}

export const commerceStudioSections: readonly SectionDefinition[] =
  commerceStudioLegacySections.map((entry) =>
    entry.key === k("featured")
      ? {
          ...entry,
          version: 2,
          source: {
            templateKey: "commerce-studio",
            templateVersion: commerceStudioVersion,
            sectionKey: entry.key,
            sectionVersion: 2,
          },
          fields: [...entry.fields, commerceStudioPinnedField],
        }
      : entry,
  )

export const commerceStudioManifest = defineTemplate({
  ...commerceStudioLegacyManifest,
  version: commerceStudioVersion,
  sections: commerceStudioSections,
})

export function commerceStudioSectionKind(
  type: string,
): CommerceStudioKind | null {
  return type.startsWith("commerce-studio-")
    ? ((type.slice("commerce-studio-".length) as CommerceStudioKind) ?? null)
    : null
}

export { orderingFulfilmentMethods as commerceStudioFulfilment } from "../../../storefront-contracts/src/orders"
