import {
  type EditableField,
  type SectionDefinition,
  defineTemplate,
} from "../../../storefront-contracts/src/manifest"
import {
  canvasFamilies,
  canvasManifests,
  canvasSections,
} from "../canvas/manifests"

export const marketHallVersion = "1.0.0"
export type MarketHallKind = "floor" | "counter"

const copy = (
  key: string,
  label: string,
  fallback: string,
  maxLength: number,
): EditableField => ({ key, label, kind: "text", default: fallback, maxLength })
const source = (sectionKey: string) => ({
  templateKey: "market-hall",
  templateVersion: marketHallVersion,
  sectionKey,
  sectionVersion: 1,
})

/** Market hall's own sections. Empty text falls back to current business facts at render. */
export const marketHallSections: readonly SectionDefinition[] = [
  {
    key: "market-hall-floor",
    version: 1,
    label: "Market floor",
    source: source("market-hall-floor"),
    fields: [
      copy("headline", "Headline", "", 100),
      copy("tagline", "Description", "", 280),
      copy("all-label", "All items label", "All items", 40),
      copy(
        "board-heading",
        "Price board heading",
        "Prices in this collection",
        80,
      ),
      {
        key: "show-categories",
        label: "Category navigation",
        kind: "boolean",
        default: true,
      },
    ],
    allowedBlocks: [],
    resources: ["business", "publicCatalog"],
    capabilities: [
      "catalog",
      "services",
      "conversation",
      "whatsappEnquiry",
      "serviceRequest",
    ],
  },
  {
    key: "market-hall-counter",
    version: 1,
    label: "Services counter",
    source: source("market-hall-counter"),
    fields: [
      copy("heading", "Services heading", "Services", 80),
      copy("tagline", "Services description", "", 280),
    ],
    allowedBlocks: [],
    resources: ["publicServices"],
    capabilities: [
      "services",
      "conversation",
      "whatsappEnquiry",
      "serviceRequest",
    ],
  },
]

export function marketHallSectionKind(type: string): MarketHallKind | null {
  return type === "market-hall-floor"
    ? "floor"
    : type === "market-hall-counter"
      ? "counter"
      : null
}

// Only the four pinned 2.0.0 families' portable declarations, never later additions,
// so this manifest stays at 2 shell + 28 portable + 2 own = 32 sections.
const legacyKeys: readonly string[] = canvasFamilies.map((entry) => entry.key)
const portable = canvasSections.filter((section) =>
  legacyKeys.includes(section.source?.templateKey ?? ""),
)
const catalogCanvas = canvasManifests.find(
  (entry) => entry.key === "catalog-v4",
)
const header = catalogCanvas?.sections.find(
  (entry) => entry.key === "studio-header",
)
const footer = catalogCanvas?.sections.find(
  (entry) => entry.key === "studio-footer",
)
if (!header || !footer || portable.length !== 28)
  throw new Error("Market hall needs the pinned canvas shell and sections.")

const allowedSections = [
  header.key,
  ...portable.map((section) => section.key),
  ...marketHallSections.map((section) => section.key),
  footer.key,
]

/** Separate exact pin; the four 2.0.0 canvas manifests are not modified. */
export const marketHallManifest = defineTemplate({
  schemaVersion: 1,
  runtimeVersion: 1,
  key: "market-hall",
  version: marketHallVersion,
  name: "Market hall",
  description:
    "A merchandising floor: category navigation beside a featured item and a compact price board, with services in a ruled strip below.",
  businessTypes: ["retail", "services"],
  pages: [
    {
      key: "home",
      label: "Home",
      path: "/",
      allowedSections,
      defaultSections: [
        header.key,
        "market-hall-floor",
        "market-hall-counter",
        footer.key,
      ],
    },
    {
      key: "about",
      label: "About",
      path: "/about",
      allowedSections,
      defaultSections: [
        header.key,
        // Intro falls back to the business name and description; Story starts empty.
        "catalog-v4-intro",
        "catalog-v4-faq",
        "catalog-v4-contact",
        footer.key,
      ],
    },
  ],
  sections: [header, ...portable, ...marketHallSections, footer],
  blocks: [],
})
