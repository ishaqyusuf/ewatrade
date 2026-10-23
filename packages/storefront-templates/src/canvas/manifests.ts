import {
  type EditableField,
  type SectionDefinition,
  defineTemplate,
} from "../../../storefront-contracts/src/manifest"

export const canvasVersion = "2.0.0"
export const canvasFamilies = [
  {
    key: "catalog-v4",
    name: "Catalog",
    family: "catalog",
    businessTypes: ["retail", "services"],
  },
  {
    key: "retail-editorial",
    name: "Quiet editorial",
    family: "editorial",
    businessTypes: ["retail"],
  },
  {
    key: "service-desk",
    name: "Request desk",
    family: "desk",
    businessTypes: ["services"],
  },
  {
    key: "component-editorial",
    name: "Component editorial",
    family: "editorial",
    businessTypes: ["retail"],
  },
] as const
export type CanvasKind =
  | "intro"
  | "collection"
  | "rotate"
  | "story"
  | "quotes"
  | "faq"
  | "contact"
const kinds: CanvasKind[] = [
  "intro",
  "collection",
  "rotate",
  "story",
  "quotes",
  "faq",
  "contact",
]
const copy = (
  key: string,
  label: string,
  fallback = "",
  maxLength = 280,
): EditableField => ({ key, label, kind: "text", default: fallback, maxLength })
const cover = {
  key: "cover",
  label: "Cover illustration",
  kind: "asset",
  default: null,
} satisfies EditableField
const shell = (
  key: string,
  label: string,
  first: boolean,
): SectionDefinition => ({
  key,
  version: 1,
  label,
  required: true,
  ...(first ? { fixedFirst: true } : { fixedLast: true }),
  fields: [],
  allowedBlocks: [],
  resources: ["business"],
  capabilities: ["conversation", "whatsappEnquiry"],
})

function fields(kind: CanvasKind, family: string): EditableField[] {
  switch (kind) {
    case "intro":
      return [
        copy("headline", "Headline", "", 100),
        copy("tagline", "Description"),
        { ...cover, default: family === "editorial" ? "design-clay" : null },
      ]
    case "collection":
      return [
        copy(
          "heading",
          family === "desk" ? "Services heading" : "Collection heading",
          family === "desk"
            ? "Available services"
            : family === "catalog"
              ? "Products & services"
              : "Selected pieces",
          80,
        ),
        copy(
          "request-heading",
          "Request panel heading",
          "Start with a request",
          80,
        ),
        {
          key: "show-categories",
          label: "Category filters",
          kind: "boolean",
          default: true,
        },
      ]
    case "rotate":
      return [
        copy("prefix", "Lead-in text", "Here for", 60),
        ...["one", "two", "three", "four", "five", "six"].map((n, i) =>
          copy(
            `phrase-${n}`,
            `Phrase ${i + 1}`,
            ["everyday needs", "something special", "your next idea"][i] ?? "",
            80,
          ),
        ),
        {
          key: "rotation-speed",
          label: "Show each phrase for",
          kind: "select",
          default: "normal",
          options: [
            { value: "fast", label: "1.5 seconds" },
            { value: "normal", label: "3 seconds" },
            { value: "slow", label: "5 seconds" },
          ],
        },
      ]
    case "story":
      return [
        copy("headline", "Story heading", "Our story", 100),
        copy("tagline", "Story", "", 600),
        cover,
      ]
    case "quotes":
      return [
        copy("heading", "Testimonials heading", "What customers say", 80),
        ...["one", "two", "three"].flatMap((n, i) => [
          copy(`quote-${n}`, `Customer quote ${i + 1}`, "", 400),
          copy(`name-${n}`, `Customer name ${i + 1}`, "", 80),
        ]),
      ]
    case "faq":
      return [
        copy(
          "heading",
          "FAQ heading",
          family === "editorial"
            ? "Asked often"
            : family === "desk"
              ? "Before you send a request"
              : "Questions",
          80,
        ),
        ...["one", "two", "three"].flatMap((n, i) => [
          copy(
            `question-${n}`,
            `Question ${i + 1}`,
            [
              "How can I ask a question?",
              "How do I request a service?",
              "Where can I see current items?",
            ][i],
            160,
          ),
          copy(
            `answer-${n}`,
            `Answer ${i + 1}`,
            [
              "Use Message to contact the business.",
              "Choose an available service and use its Request action.",
              "Browse the catalog for current products and services.",
            ][i],
            600,
          ),
        ]),
      ]
    case "contact":
      return [
        copy("heading", "Store details heading", "Visit or message us", 80),
        copy("cta", "Message label", "Message us", 32),
      ]
  }
}

const legacyCanvasSections: readonly SectionDefinition[] =
  canvasFamilies.flatMap((template) =>
    kinds.map((kind): SectionDefinition => {
      const key = `${template.key}-${kind}`
      const collection = kind === "collection"
      return {
        key,
        version: 1,
        label: {
          intro: "Introduction",
          collection: template.family === "desk" ? "Services" : "Collection",
          rotate: "Rotating headline",
          story: "Story",
          quotes: "Testimonials",
          faq: "FAQ",
          contact: "Store details",
        }[kind],
        source: {
          templateKey: template.key,
          templateVersion: canvasVersion,
          sectionKey: key,
          sectionVersion: 1,
        },
        fields: fields(kind, template.family),
        allowedBlocks: [],
        resources: collection
          ? [template.family === "desk" ? "publicServices" : "publicCatalog"]
          : ["business"],
        capabilities: collection
          ? [
              "catalog",
              "services",
              "conversation",
              "whatsappEnquiry",
              "serviceRequest",
            ]
          : kind === "contact"
            ? ["conversation", "whatsappEnquiry"]
            : [],
      }
    }),
  )

const legacyCanvasManifests = canvasFamilies.map((template) => {
  const owned = (kind: CanvasKind) => `${template.key}-${kind}`
  const header = "studio-header"
  const footer = "studio-footer"
  const allowedSections = [
    header,
    ...legacyCanvasSections.map((section) => section.key),
    footer,
  ]
  return defineTemplate({
    schemaVersion: 1,
    runtimeVersion: 1,
    key: template.key,
    version: canvasVersion,
    name: template.name,
    description:
      "A canvas storefront with reusable template sections, direct copy editing and shared brand settings.",
    businessTypes: [...template.businessTypes],
    pages: [
      {
        key: "home",
        label: "Home",
        path: "/",
        allowedSections,
        defaultSections: [
          header,
          owned("intro"),
          owned("collection"),
          owned("contact"),
          footer,
        ],
      },
      {
        key: "about",
        label: "About",
        path: "/about",
        allowedSections,
        defaultSections: [
          header,
          owned("rotate"),
          owned("story"),
          owned("quotes"),
          owned("faq"),
          owned("contact"),
          footer,
        ],
      },
    ],
    sections: [
      shell(header, "Header", true),
      ...legacyCanvasSections,
      shell(footer, "Footer", false),
    ],
    blocks: [],
  })
})

const conciergeSection: SectionDefinition = {
  key: "service-concierge-collection",
  version: 1,
  label: "Service concierge",
  source: {
    templateKey: "service-concierge",
    templateVersion: canvasVersion,
    sectionKey: "service-concierge-collection",
    sectionVersion: 1,
  },
  fields: [
    copy("headline", "Headline", "What would you like help with?", 100),
    copy(
      "tagline",
      "Description",
      "Pick a service to see its current options and listed price.",
    ),
    copy("request-heading", "Enquiry heading", "Your enquiry", 80),
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
}

export const canvasSections: readonly SectionDefinition[] = [
  ...legacyCanvasSections,
  conciergeSection,
]

const desk = legacyCanvasManifests.find((entry) => entry.key === "service-desk")
if (!desk) throw new Error("Missing service canvas blueprint.")
export const serviceConciergeManifest = defineTemplate({
  ...desk,
  key: "service-concierge",
  name: "Service concierge",
  description:
    "A task-led service selector with current options, listed prices and an enquiry overview before continuing to the request page.",
  sections: [...desk.sections, conciergeSection],
  pages: desk.pages.map((page) => ({
    ...page,
    allowedSections: [...page.allowedSections, conciergeSection.key],
    defaultSections:
      page.key === "home"
        ? [
            "studio-header",
            conciergeSection.key,
            "service-desk-contact",
            "studio-footer",
          ]
        : [
            "studio-header",
            "service-desk-story",
            "service-desk-faq",
            "service-desk-contact",
            "studio-footer",
          ],
  })),
})
export const canvasManifests = [
  ...legacyCanvasManifests,
  serviceConciergeManifest,
]

export function canvasSectionKind(type: string): CanvasKind | null {
  return kinds.find((kind) => type.endsWith(`-${kind}`)) ?? null
}
export function canvasFamily(key: string) {
  return key === "service-concierge"
    ? "concierge"
    : (canvasFamilies.find((entry) => entry.key === key)?.family ?? "catalog")
}
