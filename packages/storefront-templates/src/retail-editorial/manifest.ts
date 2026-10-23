import { defineTemplate } from "../../../storefront-contracts/src/manifest"

/** Owner-selected Workshop01, b403c4ec-11c2-4f1d-b17a-04233873460a. */
export const retailEditorialManifest = defineTemplate({
  schemaVersion: 1,
  runtimeVersion: 1,
  key: "retail-editorial",
  version: "1.0.0",
  name: "Quiet editorial",
  description:
    "Brand-led retail storefront with a split introduction and editorial collection.",
  businessTypes: ["retail"],
  pages: [
    {
      key: "home",
      path: "/",
      label: "Home",
      allowedSections: ["retail-intro", "retail-collection", "contact"],
    },
  ],
  sections: [
    {
      key: "retail-intro",
      version: 1,
      label: "Introduction",
      required: true,
      fixedFirst: true,
      allowedBlocks: [],
      resources: ["business"],
      capabilities: [],
      fields: [
        {
          key: "headline",
          label: "Headline",
          kind: "text",
          maxLength: 100,
          default: "",
        },
        {
          key: "tagline",
          label: "Description",
          kind: "text",
          maxLength: 280,
          default: "",
        },
        {
          key: "cover",
          label: "Cover illustration",
          kind: "asset",
          default: "design-clay",
        },
      ],
    },
    {
      key: "retail-collection",
      version: 1,
      label: "Collection",
      required: true,
      allowedBlocks: [],
      resources: ["publicCatalog"],
      capabilities: [
        "catalog",
        "conversation",
        "whatsappEnquiry",
        "serviceRequest",
      ],
      fields: [
        {
          key: "heading",
          label: "Collection heading",
          kind: "text",
          maxLength: 80,
          default: "Selected pieces",
        },
        {
          key: "show-categories",
          label: "Show categories",
          kind: "boolean",
          default: true,
        },
      ],
    },
    {
      key: "contact",
      version: 1,
      label: "Store details",
      allowedBlocks: [],
      resources: ["business"],
      capabilities: ["conversation", "whatsappEnquiry", "serviceRequest"],
      fields: [],
    },
  ],
  blocks: [],
})
