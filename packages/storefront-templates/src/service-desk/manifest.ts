import { defineTemplate } from "../../../storefront-contracts/src/manifest"

/** Owner-selected Workshop01, 698f9e51-7e2a-406d-9d2e-28b2cdac1e74. */
export const serviceDeskManifest = defineTemplate({
  schemaVersion: 1,
  runtimeVersion: 1,
  key: "service-desk",
  version: "1.0.0",
  name: "Request desk",
  description:
    "Request-led service directory with authoritative offerings and existing customer entrypoints.",
  businessTypes: ["services"],
  pages: [
    {
      key: "home",
      path: "/",
      label: "Home",
      allowedSections: ["service-intro", "service-offerings", "contact"],
    },
  ],
  sections: [
    {
      key: "service-intro",
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
      ],
    },
    {
      key: "service-offerings",
      version: 1,
      label: "Services",
      required: true,
      allowedBlocks: [],
      resources: ["publicServices"],
      capabilities: [
        "catalog",
        "services",
        "conversation",
        "whatsappEnquiry",
        "serviceRequest",
      ],
      fields: [
        {
          key: "heading",
          label: "Services heading",
          kind: "text",
          maxLength: 80,
          default: "Available services",
        },
        {
          key: "request-heading",
          label: "Request panel heading",
          kind: "text",
          maxLength: 80,
          default: "Start with a request",
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
